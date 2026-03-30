import type { AxiosRequestConfig, Method } from 'axios';
import { getRequiredEnv } from './utils/runtime.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';

type ResyHeaders = Record<string, string>;

function createHeaders(origin: string, extraHeaders: ResyHeaders = {}): ResyHeaders {
  const resyApiKey = getRequiredEnv('RESY_API_KEY');

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
    ...extraHeaders,
  };
}

function createConfig(
  method: Method,
  url: string,
  headers: ResyHeaders,
): AxiosRequestConfig {
  return {
    method,
    maxBodyLength: Infinity,
    url,
    headers,
  };
}

export function existingReservationConfig(authToken: string): AxiosRequestConfig {
  return createConfig(
    'get',
    'https://api.resy.com/3/user/reservations?limit=10&offset=1&type=upcoming',
    createHeaders('https://resy.com', {
      'x-resy-auth-token': authToken,
      'x-resy-universal-auth': authToken,
    }),
  );
}

export function slotConfig(): AxiosRequestConfig {
  const date = getRequiredEnv('DATE');
  const partySize = getRequiredEnv('PARTY_SIZE');
  const venueId = getRequiredEnv('VENUE_ID');

  return createConfig(
    'get',
    `https://api.resy.com/4/find?lat=0&long=0&day=${date}&party_size=${partySize}&venue_id=${venueId}`,
    createHeaders('https://resy.com'),
  );
}

export function bookingConfig(token: string): AxiosRequestConfig {
  const date = getRequiredEnv('DATE');
  const partySize = getRequiredEnv('PARTY_SIZE');
  const slotId = encodeURIComponent(token);

  return createConfig(
    'get',
    `https://api.resy.com/3/details?&day=${date}&party_size=${partySize}&config_id=${slotId}`,
    createHeaders('https://resy.com'),
  );
}

export function finalConfig(authToken: string): AxiosRequestConfig {
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
