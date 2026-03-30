import axios from 'axios';
import { formatDateForEnv } from './helpers.js';
import { buildVenueCalendarRequest } from './resyRequests.js';
import {
  getBooleanEnv,
  getOptionalEnv,
  getPositiveIntegerEnv,
  getRequiredEnv,
} from './runtime.js';
import type { VenueCalendarResponse } from './types.js';

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
  };
}

export function describeDiscoveryConfig(config: DiscoveryConfig): string {
  return `Discovery mode enabled for venue ${config.venueId}. Polling the calendar every ${config.intervalSeconds} seconds from ${config.startDate} through ${config.endDate} for party size ${config.partySize} (${config.timezone}).`;
}

export async function runCalendarDiscovery(
  config = getDiscoveryConfig(),
): Promise<string> {
  const venueId = config.venueId ?? getRequiredEnv('DISCOVERY_VENUE_ID');
  const initialLastCalendarDay = await fetchLastCalendarDay(config);

  console.log(
    `Initial last_calendar_day for venue ${venueId} is ${initialLastCalendarDay}. Waiting for it to advance.`,
  );

  while (true) {
    await sleep(config.intervalSeconds * 1000);

    const lastCalendarDay = await fetchLastCalendarDay(config);
    if (lastCalendarDay !== initialLastCalendarDay) {
      console.log(
        `Calendar advanced for venue ${venueId} at ${formatDiscoveryTimestamp(
          config.timezone,
        )}: ${initialLastCalendarDay} -> ${lastCalendarDay}`,
      );
      return lastCalendarDay;
    }

    console.log(
      `No calendar change yet for venue ${venueId}. Current last_calendar_day remains ${lastCalendarDay} at ${formatDiscoveryTimestamp(
        config.timezone,
      )}.`,
    );
  }
}

async function fetchLastCalendarDay(config: DiscoveryConfig): Promise<string> {
  const venueId = config.venueId ?? getRequiredEnv('DISCOVERY_VENUE_ID');
  const response = await axios.request<VenueCalendarResponse>(
    buildVenueCalendarRequest(
      venueId,
      config.startDate,
      config.endDate,
      config.partySize,
    ),
  );
  const lastCalendarDay = response.data.last_calendar_day;

  if (!lastCalendarDay) {
    throw new Error(`Calendar response for venue ${venueId} did not include last_calendar_day.`);
  }

  return lastCalendarDay;
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
