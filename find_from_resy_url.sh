#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOTENV_BIN="$ROOT_DIR/node_modules/.bin/dotenv"

if [[ $# -lt 1 ]]; then
  echo "Usage: ./find_from_resy_url.sh '<resy-url>'" >&2
  exit 1
fi

if [[ ! -x "$DOTENV_BIN" ]]; then
  echo "Missing $DOTENV_BIN. Run 'npm install' first." >&2
  exit 1
fi

RESY_URL="$1"

RESOLVED=()

while IFS= read -r line; do
  RESOLVED+=("$line")
done < <(
  "$DOTENV_BIN" -e "$ROOT_DIR/.env" -- env RESY_URL="$RESY_URL" node --input-type=module <<'NODE'
import axios from 'axios';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function extractResyId(value) {
  if (typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }

  if (value && typeof value === 'object' && 'resy' in value && value.resy != null) {
    return String(value.resy);
  }

  return null;
}

function humanizeSlug(slug) {
  return slug.replace(/-/g, ' ').trim();
}

const rawUrl = process.env.RESY_URL;
const authToken = process.env.AUTH_TOKEN;
const apiKey = process.env.RESY_API_KEY;

if (!rawUrl) {
  fail('Missing RESY_URL input.');
}

if (!authToken || !apiKey) {
  fail('Missing AUTH_TOKEN or RESY_API_KEY in .env.');
}

let parsedUrl;

try {
  parsedUrl = new URL(rawUrl);
} catch {
  fail(`Invalid URL: ${rawUrl}`);
}

if (parsedUrl.hostname !== 'resy.com' && parsedUrl.hostname !== 'www.resy.com') {
  fail(`Expected a resy.com URL, got: ${parsedUrl.hostname}`);
}

const pathMatch = parsedUrl.pathname.match(/^\/cities\/([^/]+)\/venues\/([^/]+)$/);

if (!pathMatch) {
  fail(
    'Expected a venue URL like https://resy.com/cities/<city>/venues/<venue>?date=YYYY-MM-DD&seats=2',
  );
}

const [, citySlug, venueSlug] = pathMatch;
const date = parsedUrl.searchParams.get('date');
const partySize = parsedUrl.searchParams.get('seats');

if (!date) {
  fail('The URL is missing a date query parameter.');
}

if (!partySize) {
  fail('The URL is missing a seats query parameter.');
}

const headers = {
  authority: 'api.resy.com',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9,la;q=0.8',
  authorization: `ResyAPI api_key="${apiKey}"`,
  'cache-control': 'no-cache',
  origin: 'https://resy.com',
  referer: 'https://resy.com/',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'x-origin': 'https://resy.com',
  'x-resy-auth-token': authToken,
  'x-resy-universal-auth': authToken,
  'content-type': 'application/json',
};

const response = await axios.post(
  'https://api.resy.com/3/venuesearch/search',
  {
    page: 1,
    per_page: 20,
    types: ['venue'],
    query: humanizeSlug(venueSlug),
  },
  { headers },
);

const hits = response.data.search?.hits ?? [];
const matchingHit = hits.find((hit) => hit?.url_slug === venueSlug);

if (!matchingHit) {
  fail(`Could not resolve venue slug '${venueSlug}' from Resy search results.`);
}

const venueId = extractResyId(matchingHit.id);

if (!venueId) {
  fail(`Resolved venue '${matchingHit.name}' but could not extract a Resy venue ID.`);
}

const venueDetailsResponse = await axios.get(
  `https://api.resy.com/3/venue?id=${encodeURIComponent(venueId)}`,
  { headers },
);

const locationSlug = venueDetailsResponse.data.location?.url_slug;

if (locationSlug && locationSlug !== citySlug) {
  fail(
    `Resolved venue '${matchingHit.name}' belongs to city '${locationSlug}', not '${citySlug}'.`,
  );
}

console.log(venueId);
console.log(matchingHit.name);
console.log(date);
console.log(partySize);
NODE
)

if [[ "${#RESOLVED[@]}" -ne 4 ]]; then
  echo "Failed to resolve the Resy URL." >&2
  exit 1
fi

VENUE_ID="${RESOLVED[0]}"
VENUE_NAME="${RESOLVED[1]}"
DATE_VALUE="${RESOLVED[2]}"
PARTY_SIZE_VALUE="${RESOLVED[3]}"

echo "Resolved $VENUE_NAME (venue $VENUE_ID) for $DATE_VALUE, party size $PARTY_SIZE_VALUE."
echo "Using EARLIEST/LATEST from .env unless you override them in the shell."

(
  cd "$ROOT_DIR"
  npm run build >/dev/null
)

"$DOTENV_BIN" -e "$ROOT_DIR/.env" -- env \
  DISCOVERY_MODE=false \
  POLL_ENABLED=false \
  ANY_SATURDAY=false \
  VENUE_IDS="$VENUE_ID" \
  DATES="$DATE_VALUE" \
  PARTY_SIZE="$PARTY_SIZE_VALUE" \
  node --input-type=module <<'NODE'
import { fetchDataAndParseSlots, resetBookingState } from './dist/utils/bookingLogic.js';
import { deserializeSearchSelection } from './dist/utils/searchTargets.js';

resetBookingState();
const selection = await fetchDataAndParseSlots();

if (!selection) {
  process.exit(0);
}

const parsedSelection = deserializeSearchSelection(selection);

console.log('');
console.log('Selected slot:');
console.log(JSON.stringify(parsedSelection, null, 2));
NODE
