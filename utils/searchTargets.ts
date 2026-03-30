import { convertDateToLongFormat, formatDateForEnv } from './helpers.js';
import {
  getBooleanEnv,
  getOptionalEnv,
  getPositiveIntegerEnv,
  readLinesFile,
} from './runtime.js';
import type {
  ResolvedSearchPlan,
  SearchSelection,
  SearchTarget,
} from './types.js';

const SEARCH_SELECTION_PREFIX = 'selection:';

export interface SearchPlan {
  dates: string[];
  venueIds: string[];
}

export function buildSearchPlan(): SearchPlan {
  const dates = resolveDates();
  const venueIds = resolveVenueIds();

  if (dates.length === 0) {
    throw new Error('No target dates were resolved from DATE, DATES, DATES_FILE, or ANY_SATURDAY.');
  }

  if (venueIds.length === 0) {
    throw new Error(
      'No venue IDs were resolved from VENUE_ID, VENUE_IDS, VENUE_IDS_FILE, or venue_ids.txt.',
    );
  }

  return {
    dates,
    venueIds,
  };
}

export function resolveSearchPlan(): ResolvedSearchPlan {
  const searchPlan = buildSearchPlan();
  const targets = searchPlan.dates.flatMap((date, dateIndex) =>
    rotateVenueIds(searchPlan.venueIds, dateIndex).map(
      (venueId): SearchTarget => ({
        venueId,
        date,
      }),
    ),
  );

  return {
    dates: searchPlan.dates,
    venueIds: searchPlan.venueIds,
    targets,
  };
}

export function rotateVenueIds(venueIds: string[], rotationIndex: number): string[] {
  if (venueIds.length <= 1) {
    return venueIds;
  }

  const startIndex = rotationIndex % venueIds.length;
  return venueIds.slice(startIndex).concat(venueIds.slice(0, startIndex));
}

export function describeSearchPlan(searchPlan: SearchPlan): string {
  return `Searching ${searchPlan.dates.length} date(s): ${searchPlan.dates
    .map((date) => convertDateToLongFormat(date))
    .join(', ')} across ${searchPlan.venueIds.length} venue(s).`;
}

export function serializeSearchSelection(selection: SearchSelection): string {
  const payload = Buffer.from(JSON.stringify(selection), 'utf8').toString('base64url');
  return `${SEARCH_SELECTION_PREFIX}${payload}`;
}

export function deserializeSearchSelection(value: string): SearchSelection | null {
  if (!value.startsWith(SEARCH_SELECTION_PREFIX)) {
    return null;
  }

  try {
    const payload = value.slice(SEARCH_SELECTION_PREFIX.length);
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded) as SearchSelection;
  } catch {
    return null;
  }
}

function resolveVenueIds(): string[] {
  const inlineVenueIds = getOptionalEnv('VENUE_IDS');
  if (inlineVenueIds) {
    return dedupeValues(
      inlineVenueIds
        .split(',')
        .map((venueId) => venueId.trim())
        .filter(Boolean),
    );
  }

  const venueIdsFile = getOptionalEnv('VENUE_IDS_FILE');
  const fileVenueIds = venueIdsFile
    ? readLinesFile(venueIdsFile)
    : readLinesFile('venue_ids.txt');

  if (fileVenueIds.length > 0) {
    return dedupeValues(flattenCsvLines(fileVenueIds));
  }

  const singleVenueId = getOptionalEnv('VENUE_ID');
  return singleVenueId ? [singleVenueId] : [];
}

function resolveDates(): string[] {
  if (getBooleanEnv('ANY_SATURDAY')) {
    return getUpcomingSaturdays(
      getPositiveIntegerEnv(
        'SATURDAY_LOOKAHEAD_COUNT',
        getPositiveIntegerEnv('SATURDAY_LOOKAHEAD_WEEKS', 8),
      ),
      getOptionalEnv('SEARCH_START_DATE'),
    );
  }

  const inlineDates = getOptionalEnv('DATES');
  if (inlineDates) {
    return dedupeValues(
      inlineDates
        .split(',')
        .map((date) => date.trim())
        .filter(Boolean),
    );
  }

  const datesFile = getOptionalEnv('DATES_FILE');
  if (datesFile) {
    const fileDates = flattenCsvLines(readLinesFile(datesFile));
    if (fileDates.length > 0) {
      return dedupeValues(fileDates);
    }
  }

  const singleDate = getOptionalEnv('DATE');
  return singleDate ? [singleDate] : [];
}

function getUpcomingSaturdays(lookaheadCount: number, startDate?: string): string[] {
  const dates: string[] = [];
  const cursor = startDate ? new Date(`${startDate}T12:00:00`) : new Date();
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getDay() !== 6) {
    cursor.setDate(cursor.getDate() + 1);
  }

  for (let index = 0; index < lookaheadCount; index += 1) {
    dates.push(formatDateForEnv(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }

  return dates;
}

function flattenCsvLines(values: string[]): string[] {
  return values.flatMap((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function dedupeValues(values: string[]): string[] {
  return [...new Set(values)];
}
