import type { HttpMethod, ResyRequestConfig } from './http.js';
import { getOptionalEnv, getRequiredEnv } from './runtime.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';

type ResyHeaders = Record<string, string>;

function createHeaders(
  origin: string,
  extraHeaders: ResyHeaders = {},
): ResyHeaders {
  const resyApiKey = getRequiredEnv('RESY_API_KEY');
  const authToken = getOptionalEnv('AUTH_TOKEN');

  return {
    authority: 'api.resy.com',
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9,la;q=0.8',
    authorization: `ResyAPI api_key="${resyApiKey}"`,
    'cache-control': 'no-cache',
    origin,
    referer: `${origin}/`,
    'sec-ch-ua': '"Chromium";v="118", "Google Chrome";v="118", "Not=A?Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': USER_AGENT,
    'x-origin': origin,
    ...(authToken
      ? {
          'x-resy-auth-token': authToken,
          'x-resy-universal-auth': authToken,
        }
      : {}),
    ...extraHeaders,
  };
}

function createConfig(
  method: HttpMethod,
  url: string,
  headers: ResyHeaders,
  data?: unknown,
): ResyRequestConfig {
  return {
    method,
    url,
    headers,
    ...(data === undefined ? {} : { data }),
  };
}

export function buildExistingReservationsRequest(authToken: string): ResyRequestConfig {
  return createConfig(
    'get',
    'https://api.resy.com/3/user/reservations?limit=10&offset=1&type=upcoming',
    createHeaders('https://resy.com', {
      'x-resy-auth-token': authToken,
      'x-resy-universal-auth': authToken,
    }),
  );
}

export function buildFindSlotsRequest(
  venueName: string,
  date: string,
  partySize: string,
  latitude?: number,
  longitude?: number,
): ResyRequestConfig {
  const geo =
    latitude !== undefined && longitude !== undefined
      ? {
          geo: {
            latitude,
            longitude,
            radius: 1_000,
          },
        }
      : {};

  return createConfig(
    'post',
    'https://api.resy.com/3/venuesearch/search',
    createHeaders('https://resy.com', {
      'content-type': 'application/json',
    }),
    {
      availability: true,
      page: 1,
      per_page: 20,
      slot_filter: {
        day: date,
        party_size: Number.parseInt(partySize, 10),
      },
      types: ['venue'],
      order_by: 'availability',
      query: venueName,
      ...geo,
    },
  );
}

export function buildVenueDetailsRequest(venueId: string): ResyRequestConfig {
  return createConfig(
    'get',
    `https://api.resy.com/3/venue?id=${encodeURIComponent(venueId)}`,
    createHeaders('https://resy.com'),
  );
}

export function buildBookingDetailsRequest(
  token: string,
  date: string,
  partySize: string,
): ResyRequestConfig {
  return createConfig(
    'get',
    `https://api.resy.com/3/details?&day=${encodeURIComponent(date)}&party_size=${encodeURIComponent(partySize)}&config_id=${encodeURIComponent(token)}`,
    createHeaders('https://resy.com'),
  );
}

export function buildVenueCalendarRequest(
  venueId: string,
  startDate: string,
  endDate: string,
  partySize: string,
): ResyRequestConfig {
  return createConfig(
    'get',
    `https://api.resy.com/4/venue/calendar?venue_id=${encodeURIComponent(
      venueId,
    )}&num_seats=${encodeURIComponent(partySize)}&start_date=${encodeURIComponent(
      startDate,
    )}&end_date=${encodeURIComponent(endDate)}`,
    createHeaders('https://resy.com'),
  );
}

export function buildVenueConfigRequest(venueId: string): ResyRequestConfig {
  return createConfig(
    'get',
    `https://api.resy.com/2/config?venue_id=${encodeURIComponent(venueId)}`,
    createHeaders('https://resy.com'),
  );
}

export function buildFinalBookingRequest(
  authToken: string,
): ResyRequestConfig {
  return createConfig(
    'post',
    'https://api.resy.com/3/book',
    createHeaders('https://widgets.resy.com', {
      'content-type': 'application/x-www-form-urlencoded',
      'x-resy-auth-token': authToken,
      'x-resy-universal-auth': authToken,
    }),
  );
}
