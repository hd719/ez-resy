import { formatDateForEnv } from './helpers.js';
import {
  buildFindSlotsRequest,
  buildVenueConfigRequest,
  buildVenueDetailsRequest,
} from './resyRequests.js';
import { getErrorDetail, requestJson } from './http.js';
import {
  getBooleanEnv,
  getOptionalEnv,
  getPositiveIntegerEnv,
  getRequiredEnv,
} from './runtime.js';
import type {
  ResySlot,
  VenueConfigResponse,
  VenueDetailsResponse,
  VenueSearchResponse,
} from './types.js';

const DEFAULT_DISCOVERY_INTERVAL_SECONDS = 15;
const DEFAULT_DISCOVERY_TIMEZONE = 'America/New_York';
const DEFAULT_DISCOVERY_HORIZON_DAYS = 120;

export interface DiscoveryConfig {
  enabled: boolean;
  venueId?: string;
  startDate: string;
  endDate: string;
  partySize: string;
  intervalSeconds: number;
  timezone: string;
  triggerBooking: boolean;
}

interface DiscoveryVenueSearchContext {
  venueId: string;
  venueName: string;
  latitude?: number;
  longitude?: number;
}

interface DiscoveryAvailability {
  slotCount: number;
  firstSlot: ResySlot | null;
}

interface DiscoveryRunOptions {
  stopAfterFirstBookableDate?: boolean;
}

export function getDiscoveryConfig(): DiscoveryConfig {
  const enabled = getBooleanEnv('DISCOVERY_MODE', false);
  const startDate = getOptionalEnv('DISCOVERY_START_DATE') ?? formatDateForEnv(new Date());
  const horizonDays = getPositiveIntegerEnv(
    'DISCOVERY_HORIZON_DAYS',
    DEFAULT_DISCOVERY_HORIZON_DAYS,
  );
  const endDate = addDays(startDate, horizonDays);
  const partySize =
    getOptionalEnv('DISCOVERY_PARTY_SIZE') ?? getOptionalEnv('PARTY_SIZE') ?? '2';
  const intervalSeconds = getPositiveIntegerEnv(
    'DISCOVERY_POLL_INTERVAL_SECONDS',
    DEFAULT_DISCOVERY_INTERVAL_SECONDS,
  );
  const timezone = getOptionalEnv('DISCOVERY_TIMEZONE') ?? DEFAULT_DISCOVERY_TIMEZONE;
  const venueId = getOptionalEnv('DISCOVERY_VENUE_ID');
  const triggerBooking = getBooleanEnv('DISCOVERY_TRIGGER_BOOKING', false);

  if (enabled && !venueId) {
    throw new Error('DISCOVERY_VENUE_ID is required when DISCOVERY_MODE=true.');
  }

  return {
    enabled,
    venueId,
    startDate,
    endDate,
    partySize,
    intervalSeconds,
    timezone,
    triggerBooking,
  };
}

export function describeDiscoveryConfig(config: DiscoveryConfig): string {
  const handoffDescription = config.triggerBooking
    ? ' Booking will begin immediately after the calendar advances.'
    : '';

  return `Discovery mode enabled for venue ${config.venueId}. Polling the calendar every ${config.intervalSeconds} seconds from ${config.startDate} through ${config.endDate} for party size ${config.partySize} (${config.timezone}).${handoffDescription}`;
}

export async function runCalendarDiscovery(
  config = getDiscoveryConfig(),
  options: DiscoveryRunOptions = {},
): Promise<string> {
  const venueId = config.venueId ?? getRequiredEnv('DISCOVERY_VENUE_ID');
  let currentLastCalendarDay = await fetchLastCalendarDayWithRetry(config);

  console.log(
    `Initial last_calendar_day for venue ${venueId} is ${currentLastCalendarDay}. Waiting for it to advance.`,
  );

  while (true) {
    await sleep(config.intervalSeconds * 1000);

    const lastCalendarDay = await fetchLastCalendarDayWithRetry(config);
    if (lastCalendarDay !== currentLastCalendarDay) {
      console.log(
        `Calendar advanced for venue ${venueId} at ${formatDiscoveryTimestamp(
          config.timezone,
        )}: ${currentLastCalendarDay} -> ${lastCalendarDay}`,
      );
      await waitForDateToBecomeBookable(config, lastCalendarDay);

      if (options.stopAfterFirstBookableDate) {
        return lastCalendarDay;
      }

      currentLastCalendarDay = lastCalendarDay;
      console.log(
        `Continuing discovery for venue ${venueId}. Waiting for the next calendar advance beyond ${currentLastCalendarDay}.`,
      );
      continue;
    }

    console.log(
      `No calendar change yet for venue ${venueId}. Current last_calendar_day remains ${lastCalendarDay} at ${formatDiscoveryTimestamp(
        config.timezone,
      )}.`,
    );
  }
}

async function waitForDateToBecomeBookable(
  config: DiscoveryConfig,
  targetDate: string,
): Promise<string> {
  const venueId = config.venueId ?? getRequiredEnv('DISCOVERY_VENUE_ID');
  const venueSearchContext = await loadVenueSearchContextWithRetry(config);

  console.log(
    `Calendar now includes ${targetDate} for venue ${venueId}. Waiting for the date to become bookable.`,
  );

  while (true) {
    const availability = await fetchBookableAvailabilityWithRetry(
      config,
      targetDate,
      venueSearchContext,
    );
    if (availability.slotCount > 0) {
      const firstSlotDescription = availability.firstSlot
        ? ` First slot: ${availability.firstSlot.date.start} (${availability.firstSlot.config.type}).`
        : '';

      console.log(
        `Date ${targetDate} became bookable for venue ${venueId} at ${formatDiscoveryTimestamp(
          config.timezone,
        )} with ${availability.slotCount} slot(s).${firstSlotDescription}`,
      );
      return targetDate;
    }

    console.log(
      `No bookable inventory yet for venue ${venueId} on ${targetDate} at ${formatDiscoveryTimestamp(
        config.timezone,
      )}.`,
    );
    await sleep(config.intervalSeconds * 1000);
  }
}

async function fetchLastCalendarDayWithRetry(
  config: DiscoveryConfig,
): Promise<string> {
  const venueId = config.venueId ?? getRequiredEnv('DISCOVERY_VENUE_ID');

  while (true) {
    try {
      return await fetchLastCalendarDay(config);
    } catch (error: unknown) {
      logDiscoveryRequestError(error, venueId, config);
      await sleep(config.intervalSeconds * 1000);
    }
  }
}

async function fetchBookableAvailabilityWithRetry(
  config: DiscoveryConfig,
  targetDate: string,
  venueSearchContext: DiscoveryVenueSearchContext,
): Promise<DiscoveryAvailability> {
  const venueId = config.venueId ?? getRequiredEnv('DISCOVERY_VENUE_ID');

  while (true) {
    try {
      return await fetchBookableAvailability(config, targetDate, venueSearchContext);
    } catch (error: unknown) {
      logDiscoveryRequestError(
        error,
        venueId,
        config,
        `bookability check for ${targetDate}`,
      );
      await sleep(config.intervalSeconds * 1000);
    }
  }
}

async function fetchLastCalendarDay(config: DiscoveryConfig): Promise<string> {
  const venueId = config.venueId ?? getRequiredEnv('DISCOVERY_VENUE_ID');
  const response = await requestJson<VenueConfigResponse>(
    buildVenueConfigRequest(venueId),
  );
  const lastCalendarDay = response.calendar_date_to;

  if (!lastCalendarDay) {
    throw new Error(
      `Venue config response for venue ${venueId} did not include calendar_date_to.`,
    );
  }

  return lastCalendarDay;
}

async function fetchBookableAvailability(
  config: DiscoveryConfig,
  targetDate: string,
  venueSearchContext: DiscoveryVenueSearchContext,
): Promise<DiscoveryAvailability> {
  const response = await requestJson<VenueSearchResponse>(
    buildFindSlotsRequest(
      venueSearchContext.venueName,
      targetDate,
      config.partySize,
      venueSearchContext.latitude,
      venueSearchContext.longitude,
    ),
  );

  const slots = extractMatchedVenueSlots(response, venueSearchContext);

  return {
    slotCount: slots.length,
    firstSlot: slots[0] ?? null,
  };
}

async function loadVenueSearchContextWithRetry(
  config: DiscoveryConfig,
): Promise<DiscoveryVenueSearchContext> {
  const venueId = config.venueId ?? getRequiredEnv('DISCOVERY_VENUE_ID');

  while (true) {
    try {
      return await loadVenueSearchContext(config);
    } catch (error: unknown) {
      logDiscoveryRequestError(error, venueId, config, 'venue metadata lookup');
      await sleep(config.intervalSeconds * 1000);
    }
  }
}

async function loadVenueSearchContext(
  config: DiscoveryConfig,
): Promise<DiscoveryVenueSearchContext> {
  const venueId = config.venueId ?? getRequiredEnv('DISCOVERY_VENUE_ID');
  const response = await requestJson<VenueDetailsResponse>(
    buildVenueDetailsRequest(venueId),
  );
  const venueName = response.name?.trim();

  if (!venueName) {
    throw new Error(`Unable to resolve venue metadata for ${venueId}.`);
  }

  return {
    venueId,
    venueName,
    latitude: response.location?.latitude,
    longitude: response.location?.longitude,
  };
}

function extractMatchedVenueSlots(
  response: VenueSearchResponse,
  searchContext: DiscoveryVenueSearchContext,
): ResySlot[] {
  const hits = response.search?.hits ?? [];
  const matchedHit =
    hits.find((hit) => extractResyVenueId(hit.id) === searchContext.venueId) ??
    hits.find((hit) => normalizeVenueName(hit.name ?? '') === normalizeVenueName(searchContext.venueName));

  return matchedHit?.availability?.slots ?? [];
}

function logDiscoveryRequestError(
  error: unknown,
  venueId: string,
  config: DiscoveryConfig,
  operation = 'calendar check',
): void {
  const timestamp = formatDiscoveryTimestamp(config.timezone);
  const detail = getErrorDetail(error);

  console.error(
    `Discovery ${operation} failed for venue ${venueId} at ${timestamp}: ${detail}. Retrying in ${config.intervalSeconds} seconds.`,
  );
}

function normalizeVenueName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractResyVenueId(
  value: number | string | { resy?: number | string | null } | undefined,
): string | undefined {
  if (typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }

  if (value && typeof value === 'object' && 'resy' in value && value.resy != null) {
    return String(value.resy);
  }

  return undefined;
}

function formatDiscoveryTimestamp(timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(new Date());
}

function addDays(date: string, days: number): string {
  const nextDate = new Date(`${date}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  return formatDateForEnv(nextDate);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
