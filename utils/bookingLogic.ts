import { convertDateToLongFormat } from './helpers.js';
import { getErrorDetail, requestJson } from './http.js';
import { getOptionalEnv, getRequiredEnv } from './runtime.js';
import { slotParser } from './slotParser.js';
import {
  buildBookingDetailsRequest,
  buildExistingReservationsRequest,
  buildFinalBookingRequest,
  buildFindSlotsRequest,
  buildVenueDetailsRequest,
} from './resyRequests.js';
import {
  deserializeSearchSelection,
  resolveSearchPlan,
  serializeSearchSelection,
} from './searchTargets.js';
import type {
  BookingResponse,
  BookingTokenResponse,
  ExistingReservationEntry,
  ExistingReservationsResponse,
  ResolvedSearchPlan,
  ResyVenueEntry,
  SearchSelection,
  SlotSearchResponse,
  VenueDetailsResponse,
  VenueSearchHit,
  VenueSearchResponse,
} from './types.js';

let cachedExistingReservations: Promise<ExistingReservationEntry[]> | null = null;
const cachedVenueSearchContexts = new Map<
  string,
  Promise<VenueSearchContext | null>
>();

interface VenueSearchContext {
  venueId: string;
  venueName: string;
  latitude?: number;
  longitude?: number;
}

export function resetBookingState(): void {
  cachedExistingReservations = null;
  cachedVenueSearchContexts.clear();
}

function logRequestError(error: unknown): void {
  console.error(getErrorDetail(error));
}

async function loadUpcomingReservations(): Promise<ExistingReservationEntry[]> {
  if (!cachedExistingReservations) {
    cachedExistingReservations = (async () => {
      const authToken = getRequiredEnv('AUTH_TOKEN');
      const response = await requestJson<ExistingReservationsResponse>(
        buildExistingReservationsRequest(authToken),
      );
      return response.reservations ?? [];
    })().catch((error: unknown) => {
      logRequestError(error);
      return [];
    });
  }

  return cachedExistingReservations;
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : trimmed;
}

function normalizeVenueName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractResyVenueId(
  value: VenueSearchHit['id'],
): string | undefined {
  if (typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }

  if (value && typeof value === 'object' && 'resy' in value && value.resy != null) {
    return String(value.resy);
  }

  return undefined;
}

function extractReservationDate(entry: ExistingReservationEntry): string | undefined {
  const candidates = [
    entry.date,
    entry.reservation_date,
    entry.service_date,
    entry.reservation?.date,
    entry.reservation?.reservation_date,
    entry.reservation?.service_date,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function buildBlockedDateSet(
  reservations: ExistingReservationEntry[],
): Set<string> {
  const blockedDates = new Set<string>();

  for (const reservation of reservations) {
    const date = extractReservationDate(reservation);

    if (date) {
      blockedDates.add(date);
    }
  }

  return blockedDates;
}

function targetIsBlocked(
  target: { venueId: string; date: string },
  blockedDates: Set<string>,
): boolean {
  return blockedDates.has(target.date);
}

async function resolveSearchContext(): Promise<ResolvedSearchPlan> {
  return resolveSearchPlan();
}

async function loadVenueSearchContext(
  venueId: string,
): Promise<VenueSearchContext | null> {
  const cached = cachedVenueSearchContexts.get(venueId);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    try {
      const response = await requestJson<VenueDetailsResponse>(
        buildVenueDetailsRequest(venueId),
      );
      const venueName = response.name?.trim();

      if (!venueName) {
        console.error(`Unable to resolve venue metadata for ${venueId}.`);
        return null;
      }

      return {
        venueId,
        venueName,
        latitude: response.location?.latitude,
        longitude: response.location?.longitude,
      };
    } catch (error: unknown) {
      logRequestError(error);
      return null;
    }
  })();

  cachedVenueSearchContexts.set(venueId, pending);
  const result = await pending;

  if (!result) {
    cachedVenueSearchContexts.delete(venueId);
  }

  return result;
}

function buildVenueEntryFromSearchResult(
  response: VenueSearchResponse,
  searchContext: VenueSearchContext,
): ResyVenueEntry | null {
  const hits = response.search?.hits ?? [];
  const matchedHit =
    hits.find((hit) => extractResyVenueId(hit.id) === searchContext.venueId) ??
    hits.find(
      (hit) =>
        normalizeVenueName(hit.name) === normalizeVenueName(searchContext.venueName),
    );

  if (!matchedHit) {
    console.log(
      `Search response did not include venue ${searchContext.venueName} (${searchContext.venueId}).`,
    );
    return null;
  }

  return {
    venue: {
      id: searchContext.venueId,
      name: matchedHit.name,
    },
    slots: matchedHit.availability?.slots ?? [],
  };
}

export async function checkForExistingBooking(): Promise<boolean> {
  const plan = await resolveSearchContext();
  const reservations = await loadUpcomingReservations();
  const blockedDates = buildBlockedDateSet(reservations);
  const availableTargets = plan.targets.filter(
    (target) => !targetIsBlocked(target, blockedDates),
  );

  if (plan.targets.length === 0) {
    return false;
  }

  if (availableTargets.length === 0) {
    console.log('You already have a reservation on every candidate date.');
    return true;
  }

  return false;
}

export async function fetchDataAndParseSlots(): Promise<string | null> {
  const plan = await resolveSearchContext();
  const reservations = await loadUpcomingReservations();
  const blockedDates = buildBlockedDateSet(reservations);
  const partySize = getRequiredEnv('PARTY_SIZE');

  for (const target of plan.targets) {
    if (targetIsBlocked(target, blockedDates)) {
      console.log(
        `Skipping ${target.date} for venue ${target.venueId} because you already have a reservation that day.`,
      );
      continue;
    }

    const response = await fetchSlotsForTarget(target.venueId, target.date, partySize);

    if (!response) {
      continue;
    }

    const venueEntries = response.results.venues ?? [];

    for (const venueEntry of venueEntries) {
      if (!venueEntry?.slots?.length) {
        continue;
      }

      console.log(
        `Checking for reservations at ${venueEntry.venue.name} on ${convertDateToLongFormat(
          target.date,
        )} for ${partySize} people...`,
      );

      const slotId = await slotParser(venueEntry.slots);

      if (slotId) {
        const selection: SearchSelection = {
          venueId: target.venueId,
          date: target.date,
          slotToken: slotId,
          venueName: venueEntry.venue.name,
        };

        return serializeSearchSelection(selection);
      }
    }

    console.log(
      `No matching slots found for venue ${target.venueId} on ${target.date}.`,
    );
  }

  console.log('No slots available across the configured venues and dates.');
  return null;
}

export async function getBookingConfig(slotId: string): Promise<string | null> {
  const selection = deserializeSearchSelection(slotId);

  if (selection) {
    return getBookingToken(selection);
  }

  const date = getOptionalEnv('DATE');
  if (!date) {
    console.error('Missing required environment variable: DATE');
    return null;
  }

  return getBookingToken({
    venueId: getOptionalEnv('VENUE_ID') ?? '',
    date,
    slotToken: slotId,
  });
}

export async function makeBooking(bookToken: string): Promise<BookingResponse | null> {
  const authToken = getRequiredEnv('AUTH_TOKEN');
  const paymentId = getRequiredEnv('PAYMENT_ID');
  const config = buildFinalBookingRequest(authToken);
  const formData = new URLSearchParams();

  formData.append('struct_payment_method', JSON.stringify({ id: paymentId }));
  formData.append('book_token', bookToken);
  formData.append('source_id', 'resy.com-venue-details');

  try {
    const response = await requestJson<BookingResponse>({
      ...config,
      data: formData,
      headers: {
        ...config.headers,
        'content-type': 'application/x-www-form-urlencoded',
      },
    });

    return response;
  } catch (error: unknown) {
    logRequestError(error);
    return null;
  }
}

async function fetchSlotsForTarget(
  venueId: string,
  date: string,
  partySize: string,
): Promise<SlotSearchResponse | null> {
  try {
    const searchContext = await loadVenueSearchContext(venueId);
    if (!searchContext) {
      return null;
    }

    const response = await requestJson<VenueSearchResponse>(
      buildFindSlotsRequest(
        searchContext.venueName,
        date,
        partySize,
        searchContext.latitude,
        searchContext.longitude,
      ),
    );

    const venueEntry = buildVenueEntryFromSearchResult(response, searchContext);

    return {
      results: {
        venues: venueEntry ? [venueEntry] : [],
      },
    };
  } catch (error: unknown) {
    logRequestError(error);
    return null;
  }
}

async function getBookingToken(selection: SearchSelection): Promise<string | null> {
  try {
    const response = await requestJson<BookingTokenResponse>(
      buildBookingDetailsRequest(
        selection.slotToken,
        selection.date,
        getRequiredEnv('PARTY_SIZE'),
      ),
    );

    return response.book_token.value;
  } catch (error: unknown) {
    logRequestError(error);
    return null;
  }
}
