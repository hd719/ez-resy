import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDiscoveryConfig, getDiscoveryConfig } from '../utils/discovery.js';
import { withEnv } from './testUtils.js';

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
