import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeDiscoveryConfig,
  getDiscoveryConfig,
  runCalendarDiscovery,
} from '../utils/discovery.js';
import { withEnv, withMockedFetch } from './testUtils.js';

test('getDiscoveryConfig requires a venue when discovery mode is enabled', () => {
  withEnv(
    {
      DISCOVERY_MODE: 'true',
      DISCOVERY_VENUE_ID: undefined,
    },
    () => {
      assert.throws(() => getDiscoveryConfig(), /DISCOVERY_VENUE_ID is required/);
    },
  );
});

test('getDiscoveryConfig derives defaults and horizon end date', () => {
  withEnv(
    {
      DISCOVERY_MODE: 'true',
      DISCOVERY_VENUE_ID: '94741',
      DISCOVERY_START_DATE: '2026-03-30',
      DISCOVERY_PARTY_SIZE: undefined,
      PARTY_SIZE: '2',
      DISCOVERY_HORIZON_DAYS: '5',
      DISCOVERY_POLL_INTERVAL_SECONDS: '9',
      DISCOVERY_TIMEZONE: 'America/New_York',
      DISCOVERY_TRIGGER_BOOKING: 'true',
    },
    () => {
      assert.deepEqual(getDiscoveryConfig(), {
        enabled: true,
        venueId: '94741',
        startDate: '2026-03-30',
        endDate: '2026-04-04',
        partySize: '2',
        intervalSeconds: 9,
        timezone: 'America/New_York',
        triggerBooking: true,
      });
    },
  );
});

test('describeDiscoveryConfig summarizes the watcher settings', () => {
  assert.equal(
    describeDiscoveryConfig({
      enabled: true,
      venueId: '94741',
      startDate: '2026-03-30',
      endDate: '2026-07-28',
      partySize: '2',
      intervalSeconds: 15,
      timezone: 'America/New_York',
      triggerBooking: false,
    }),
    'Discovery mode enabled for venue 94741. Polling the calendar every 15 seconds from 2026-03-30 through 2026-07-28 for party size 2 (America/New_York).',
  );
});

test('runCalendarDiscovery waits for bookable inventory after the horizon advances', async () => {
  const requests: string[] = [];

  const discoveredDate = await withEnv(
    {
      RESY_API_KEY: 'api-key',
      AUTH_TOKEN: 'auth-token',
    },
    () =>
      withMockedFetch(async (call) => {
        requests.push(call.input);

        if (call.input === 'https://api.resy.com/2/config?venue_id=94741') {
          return {
            body: {
              calendar_date_to:
                requests.filter((url) => url === 'https://api.resy.com/2/config?venue_id=94741')
                  .length === 1
                  ? '2026-04-15'
                  : '2026-04-16',
            },
          };
        }

        if (call.input === 'https://api.resy.com/3/venue?id=94741') {
          return {
            body: {
              name: 'Ambassadors Clubhouse New York',
              location: {
                latitude: 40.7476,
                longitude: -73.9886,
              },
            },
          };
        }

        if (call.input === 'https://api.resy.com/3/venuesearch/search') {
          const searchCallCount = requests.filter(
            (url) => url === 'https://api.resy.com/3/venuesearch/search',
          ).length;

          return {
            body: {
              search: {
                hits: [
                  {
                    id: { resy: 94741 },
                    name: 'Ambassadors Clubhouse New York',
                    availability: {
                      slots:
                        searchCallCount === 1
                          ? []
                          : [
                              {
                                date: { start: '2026-04-16 17:00:00' },
                                config: {
                                  token: 'slot-token',
                                  type: 'Dining Room',
                                },
                              },
                            ],
                    },
                  },
                ],
              },
            },
          };
        }

        throw new Error(`Unexpected request: ${call.init?.method} ${call.input}`);
      }, async () =>
        runCalendarDiscovery({
          enabled: true,
          venueId: '94741',
          startDate: '2026-04-01',
          endDate: '2026-07-30',
          partySize: '2',
          intervalSeconds: 0,
          timezone: 'America/New_York',
          triggerBooking: false,
        }, {
          stopAfterFirstBookableDate: true,
        }),
      ),
  );

  assert.equal(discoveredDate, '2026-04-16');
  assert.equal(
    requests.filter((url) => url === 'https://api.resy.com/3/venuesearch/search').length,
    2,
  );
});
