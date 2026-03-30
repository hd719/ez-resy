import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBooleanEnv,
  getPositiveIntegerEnv,
  parseDelimitedEnvList,
  readLinesFile,
} from '../utils/runtime.js';
import { createTempFile, removeTempFile, withEnv } from './testUtils.js';

test('parseDelimitedEnvList trims values and ignores empties', () => {
  assert.deepEqual(
    parseDelimitedEnvList(' 80201,\n94741, , 80444 '),
    ['80201', '94741', '80444'],
  );
});

test('getBooleanEnv recognizes truthy values and defaults', () => {
  withEnv({ TEST_BOOL: 'yes', MISSING_BOOL: undefined }, () => {
    assert.equal(getBooleanEnv('TEST_BOOL'), true);
    assert.equal(getBooleanEnv('MISSING_BOOL', true), true);
  });
});

test('getPositiveIntegerEnv rejects non-positive values', () => {
  withEnv({ TEST_INT: '0' }, () => {
    assert.throws(
      () => getPositiveIntegerEnv('TEST_INT', 5),
      /must be a positive integer/,
    );
  });
});

test('readLinesFile strips comments and blank lines', () => {
  const filePath = createTempFile('80201\n# comment\n94741, 80444 # trailing\n\n');

  try {
    assert.deepEqual(readLinesFile(filePath), ['80201', '94741, 80444']);
  } finally {
    removeTempFile(filePath);
  }
});
