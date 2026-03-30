import test from 'node:test';
import assert from 'node:assert/strict';
import { getPollingConfig, runWithPolling } from '../utils/polling.js';
import { withEnv } from './testUtils.js';

test('getPollingConfig validates enabled polling windows', () => {
  withEnv(
    {
      POLL_ENABLED: 'true',
      POLL_START_TIME: '11:05',
      POLL_END_TIME: '10:59',
    },
    () => {
      assert.throws(() => getPollingConfig(), /must be later/);
    },
  );
});

test('getPollingConfig normalizes time strings', () => {
  withEnv(
    {
      POLL_ENABLED: 'true',
      POLL_START_TIME: '10:59',
      POLL_END_TIME: '11:05:30',
      POLL_INTERVAL_SECONDS: '7',
      POLL_TIMEZONE: 'America/New_York',
    },
    () => {
      assert.deepEqual(getPollingConfig(), {
        enabled: true,
        startTime: '10:59:00',
        endTime: '11:05:30',
        intervalSeconds: 7,
        timezone: 'America/New_York',
      });
    },
  );
});

test('runWithPolling returns the first success when polling is disabled', async () => {
  let attempts = 0;

  const booked = await runWithPolling(
    async () => {
      attempts += 1;
      return {
        success: true,
        shouldContinue: false,
      };
    },
    {
      enabled: false,
      intervalSeconds: 5,
      timezone: 'America/New_York',
    },
  );

  assert.equal(booked, true);
  assert.equal(attempts, 1);
});
