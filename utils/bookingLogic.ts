import axios, { type AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import {
  bookingConfig,
  existingReservationConfig,
  finalConfig,
  slotConfig,
} from '../config.js';
import { convertDateToLongFormat } from './helpers.js';
import { getRequiredEnv } from './runtime.js';
import { slotParser } from './slotParser.js';
import type {
  BookingResponse,
  BookingTokenResponse,
  ExistingReservationsResponse,
  SlotSearchResponse,
} from './types.js';

function logAxiosError(error: unknown): void {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    console.error(responseData ?? error.message);
    return;
  }

  console.error(error);
}

export async function checkForExistingBooking(): Promise<boolean> {
  const authToken = getRequiredEnv('AUTH_TOKEN');
  const venueId = getRequiredEnv('VENUE_ID');
  const config = existingReservationConfig(authToken);

  try {
    const response = await axios.request<ExistingReservationsResponse>(config);
    const existingVenueId = response.data.reservations[0]?.venue?.id;

    if (String(existingVenueId) === venueId) {
      console.log('You already have a reservation for tonight!');
      return true;
    }

    return false;
  } catch (error: unknown) {
    logAxiosError(error);
    return false;
  }
}

export async function fetchDataAndParseSlots(): Promise<string | null> {
  const config = slotConfig();

  try {
    const response = await axios.request<SlotSearchResponse>(config);
    const venueEntry = response.data.results.venues[0];

    if (!venueEntry) {
      console.log('No slots available. Please run again after reservations open.');
      return null;
    }

    console.log(
      `Checking for reservations at ${venueEntry.venue.name} on ${convertDateToLongFormat(
        getRequiredEnv('DATE'),
      )} for ${getRequiredEnv('PARTY_SIZE')} people...`,
    );

    return slotParser(venueEntry.slots);
  } catch (error: unknown) {
    logAxiosError(error);
    return null;
  }
}

export async function getBookingConfig(slotId: string): Promise<string | null> {
  try {
    const response = await axios.request<BookingTokenResponse>(bookingConfig(slotId));
    return response.data.book_token.value;
  } catch (error: unknown) {
    logAxiosError(error);
    return null;
  }
}

export async function makeBooking(bookToken: string): Promise<BookingResponse | null> {
  const authToken = getRequiredEnv('AUTH_TOKEN');
  const paymentId = getRequiredEnv('PAYMENT_ID');
  const config = finalConfig(authToken);
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
