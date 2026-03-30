import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import {
  buildSearchPlan,
  deserializeSearchSelection,
  resolveSearchPlan,
  serializeSearchSelection,
} from '../utils/searchTargets.js';
import { createTempFile, removeTempPath, withEnv } from './testUtils.js';

test('buildSearchPlan prefers VENUE_IDS and DATES from env', () => {
  withEnv(
    {
      VENUE_IDS: '80201, 94741',
      DATES: '2026-04-04, 2026-04-11',
      VENUE_ID: '11111',
      DATE: '2026-01-01',
      ANY_SATURDAY: undefined,
    },
    () => {
      assert.deepEqual(buildSearchPlan(), {
        venueIds: ['80201', '94741'],
        dates: ['2026-04-04', '2026-04-11'],
      });
    },
  );
});

test('buildSearchPlan resolves Saturdays from SEARCH_START_DATE', () => {
  withEnv(
    {
      VENUE_ID: '80201',
      ANY_SATURDAY: 'true',
      SATURDAY_LOOKAHEAD_COUNT: '3',
      SEARCH_START_DATE: '2026-03-30',
      DATE: undefined,
      DATES: undefined,
    },
    () => {
      assert.deepEqual(buildSearchPlan().dates, [
        '2026-04-04',
        '2026-04-11',
        '2026-04-18',
      ]);
    },
  );
});

test('resolveSearchPlan rotates venue order across dates', () => {
  withEnv(
    {
      VENUE_IDS: '80201,94741',
      DATES: '2026-04-04,2026-04-11',
      ANY_SATURDAY: undefined,
    },
    () => {
      assert.deepEqual(resolveSearchPlan().targets, [
        { venueId: '80201', date: '2026-04-04' },
        { venueId: '94741', date: '2026-04-04' },
        { venueId: '94741', date: '2026-04-11' },
        { venueId: '80201', date: '2026-04-11' },
      ]);
    },
  );
});

test('buildSearchPlan can load venue IDs from file', () => {
  const filePath = createTempFile('80201\n94741, 80444\n', 'venues.txt');

  try {
    withEnv(
      {
        VENUE_IDS_FILE: filePath,
        VENUE_IDS: undefined,
        VENUE_ID: undefined,
        DATE: '2026-04-04',
      },
      () => {
        assert.deepEqual(buildSearchPlan().venueIds, ['80201', '94741', '80444']);
      },
    );
  } finally {
    removeTempPath(dirname(filePath));
  }
});

test('search selection serialization round-trips', () => {
  const selection = {
    venueId: '94741',
    date: '2026-04-18',
    slotToken: 'abc123',
    venueName: "Ambassador's Clubhouse",
  };

  assert.deepEqual(
    deserializeSearchSelection(serializeSearchSelection(selection)),
    selection,
  );
  assert.equal(deserializeSearchSelection('not-a-selection'), null);
});
