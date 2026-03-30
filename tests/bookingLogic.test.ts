import test from 'node:test';
import assert from 'node:assert/strict';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import {
  fetchDataAndParseSlots,
  resetBookingState,
} from '../utils/bookingLogic.js';
import { deserializeSearchSelection } from '../utils/searchTargets.js';
import { withEnv } from './testUtils.js';

type MockResponse = Pick<AxiosResponse, 'data'>;

function createSlot(token: string, start: string, type = 'Dining Room') {
  return {
    date: { start },
    config: { token, type },
  };
}

function withMockedAxiosRequest<T>(
  handler: (config: AxiosRequestConfig) => Promise<MockResponse>,
  run: () => Promise<T>,
): Promise<T> {
  const originalRequest = axios.request;
  axios.request = handler as typeof axios.request;

  return run().finally(() => {
    axios.request = originalRequest;
  });
}

test('fetchDataAndParseSlots picks the configured venue from venue search hits', async () => {
  const requests: AxiosRequestConfig[] = [];

  await withEnv(
    {
      AUTH_TOKEN: 'auth-token',
      RESY_API_KEY: 'api-key',
      VENUE_IDS: '94741',
      DATES: '2026-04-10',
      PARTY_SIZE: '2',
      EARLIEST: '17:00',
      LATEST: '20:30',
      ANY_SATURDAY: undefined,
      DISCOVERY_MODE: undefined,
    },
    async () => {
      await withMockedAxiosRequest(async (config) => {
        requests.push(config);

        if (config.url?.includes('/3/user/reservations')) {
          return { data: { reservations: [] } };
        }

        if (config.url === 'https://api.resy.com/3/venue?id=94741') {
          return {
            data: {
              name: 'Ambassadors Clubhouse New York',
              location: {
                latitude: 40.7476,
                longitude: -73.9886,
              },
            },
          };
        }

        if (config.url === 'https://api.resy.com/3/venuesearch/search') {
          return {
            data: {
              search: {
                hits: [
                  {
                    id: { resy: 11111 },
                    name: 'Other Venue',
                    availability: {
                      slots: [createSlot('wrong-token', '2026-04-10 18:00:00')],
                    },
                  },
                  {
                    id: { resy: 94741 },
                    name: 'Ambassadors Clubhouse New York',
                    availability: {
                      slots: [
                        createSlot('too-early', '2026-04-10 16:30:00'),
                        createSlot('target-token', '2026-04-10 18:30:00'),
                      ],
                    },
                  },
                ],
              },
            },
          };
        }

        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      }, async () => {
        resetBookingState();
        const selection = await fetchDataAndParseSlots();

        assert.ok(selection);
        assert.deepEqual(deserializeSearchSelection(selection), {
          venueId: '94741',
          date: '2026-04-10',
          slotToken: 'target-token',
          venueName: 'Ambassadors Clubhouse New York',
        });
      });
    },
  );

  const searchRequest = requests.find(
    (config) => config.url === 'https://api.resy.com/3/venuesearch/search',
  );
  assert.ok(searchRequest);
  assert.deepEqual(searchRequest.data, {
    availability: true,
    page: 1,
    per_page: 20,
    slot_filter: {
      day: '2026-04-10',
      party_size: 2,
    },
    types: ['venue'],
    order_by: 'availability',
    query: 'Ambassadors Clubhouse New York',
    geo: {
      latitude: 40.7476,
      longitude: -73.9886,
      radius: 1_000,
    },
  });
});

test('fetchDataAndParseSlots falls back to normalized venue-name matching and reuses venue details cache', async () => {
  let venueDetailsRequests = 0;

  await withEnv(
    {
      AUTH_TOKEN: 'auth-token',
      RESY_API_KEY: 'api-key',
      VENUE_IDS: '94741',
      DATES: '2026-04-10,2026-04-11',
      PARTY_SIZE: '2',
      EARLIEST: '17:00',
      LATEST: '20:30',
      ANY_SATURDAY: undefined,
      DISCOVERY_MODE: undefined,
    },
    async () => {
      await withMockedAxiosRequest(async (config) => {
        if (config.url?.includes('/3/user/reservations')) {
          return { data: { reservations: [] } };
        }

        if (config.url === 'https://api.resy.com/3/venue?id=94741') {
          venueDetailsRequests += 1;
          return {
            data: {
              name: 'Ambassadors Clubhouse New York',
              location: {
                latitude: 40.7476,
                longitude: -73.9886,
              },
            },
          };
        }

        if (config.url === 'https://api.resy.com/3/venuesearch/search') {
          const day = (config.data as { slot_filter: { day: string } }).slot_filter.day;

          return {
            data: {
              search: {
                hits:
                  day === '2026-04-10'
                    ? [
                        {
                          name: 'Ambassadors   Clubhouse New York',
                          availability: { slots: [] },
                        },
                      ]
                    : [],
              },
            },
          };
        }

        throw new Error(`Unexpected request: ${config.method} ${config.url}`);
      }, async () => {
        resetBookingState();
        const selection = await fetchDataAndParseSlots();

        assert.equal(selection, null);
      });
    },
  );

  assert.equal(venueDetailsRequests, 1);
});
