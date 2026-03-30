import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFindSlotsRequest,
  buildVenueDetailsRequest,
} from '../utils/resyRequests.js';
import { withEnv } from './testUtils.js';

test('buildVenueDetailsRequest targets the live venue details endpoint', () => {
  withEnv(
    {
      RESY_API_KEY: 'api-key',
      AUTH_TOKEN: 'auth-token',
    },
    () => {
      const request = buildVenueDetailsRequest('94741');

      assert.equal(request.method, 'get');
      assert.equal(request.url, 'https://api.resy.com/3/venue?id=94741');
    },
  );
});

test('buildFindSlotsRequest uses venue search payload with geo targeting', () => {
  withEnv(
    {
      RESY_API_KEY: 'api-key',
      AUTH_TOKEN: 'auth-token',
    },
    () => {
      const request = buildFindSlotsRequest(
        'Ambassadors Clubhouse New York',
        '2026-04-10',
        '2',
        40.7476,
        -73.9886,
      );

      assert.equal(request.method, 'post');
      assert.equal(request.url, 'https://api.resy.com/3/venuesearch/search');
      assert.deepEqual(request.data, {
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
    },
  );
});

test('buildFindSlotsRequest omits geo when coordinates are unavailable', () => {
  withEnv(
    {
      RESY_API_KEY: 'api-key',
      AUTH_TOKEN: 'auth-token',
    },
    () => {
      const request = buildFindSlotsRequest(
        'Ambassadors Clubhouse New York',
        '2026-04-10',
        '2',
      );

      assert.deepEqual(request.data, {
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
      });
    },
  );
});
