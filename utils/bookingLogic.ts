import axios, { type AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import { convertDateToLongFormat } from './helpers.js';
import { getOptionalEnv, getRequiredEnv } from './runtime.js';
import { slotParser } from './slotParser.js';
import {
  buildBookingDetailsRequest,
  buildExistingReservationsRequest,
  buildFinalBookingRequest,
  buildFindSlotsRequest,
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
  SearchSelection,
  SlotSearchResponse,
} from './types.js';

let cachedExistingReservations: Promise<ExistingReservationEntry[]> | null = null;

export function resetBookingState(): void {
  cachedExistingReservations = null;
}

function logAxiosError(error: unknown): void {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    console.error(responseData ?? error.message);
    return;
  }

  console.error(error);
}

async function loadUpcomingReservations(): Promise<ExistingReservationEntry[]> {
  if (!cachedExistingReservations) {
    cachedExistingReservations = (async () => {
      const authToken = getRequiredEnv('AUTH_TOKEN');
      const response = await axios.request<ExistingReservationsResponse>(
        buildExistingReservationsRequest(authToken),
      );
      return response.data.reservations ?? [];
    })().catch((error: unknown) => {
      logAxiosError(error);
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
  const formData = new FormData();

  formData.append('struct_payment_method', JSON.stringify({ id: paymentId }));
  formData.append('book_token', bookToken);
  formData.append('source_id', 'resy.com-venue-details');

  try {
    const response = await axios.post<BookingResponse>(
      config.url as string,
      formData,
      buildPostConfig(config, formData),
    );

    return response.data;
  } catch (error: unknown) {
    logAxiosError(error);
    return null;
  }
}

async function fetchSlotsForTarget(
  venueId: string,
  date: string,
  partySize: string,
): Promise<SlotSearchResponse | null> {
  try {
    const response = await axios.request<SlotSearchResponse>(
      buildFindSlotsRequest(venueId, date, partySize),
    );

    return response.data;
  } catch (error: unknown) {
    logAxiosError(error);
    return null;
  }
}

async function getBookingToken(selection: SearchSelection): Promise<string | null> {
  try {
    const response = await axios.request<BookingTokenResponse>(
      buildBookingDetailsRequest(
        selection.slotToken,
        selection.date,
        getRequiredEnv('PARTY_SIZE'),
      ),
    );

    return response.data.book_token.value;
  } catch (error: unknown) {
    logAxiosError(error);
    return null;
  }
}

function buildPostConfig(
  config: AxiosRequestConfig,
  formData: FormData,
): AxiosRequestConfig {
  return {
    headers: {
      ...(config.headers ?? {}),
      ...formData.getHeaders(),
    },
    maxBodyLength: config.maxBodyLength,
  };
}
