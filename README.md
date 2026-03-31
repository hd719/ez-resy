# Lazy Resy

I'm hungry and like to eat well. What can I say? 🤷‍♂️

This script allows you to make a reservation at a restaurant on Resy. It's ideally run on a cron job, but can be run
manually as well. Imagine picking your day and ideal time, and then letting the script do the rest. It's that easy. No
more wait-lists, no more checking the app every 5 minutes. Just set it and forget it.

https://github.com/robertjdominguez/ez-resy/assets/24390149/68a8b7be-0ac8-454a-94b3-d84a6f1c3bd2

## Motivation

One day, [Highlands Bar & Grill](https://highlandsbarandgrill.com/) will reopen. And when it does, I want to be there. I
want to be there so bad that I wrote this script to make a reservation for me. Goddammit, I want that
[cornbread](https://thelocalpalate.com/recipes/highlands-cornbread/).

## Installation

Clone the repository:

```bash
git clone https://github.com/robertjdominguez/ez-resy.git
```

Install the dependencies:

```bash
npm i
```

## Configuration

You'll need a `.env` file that contains the following:

```env
VENUE_ID=
VENUE_IDS=
VENUE_IDS_FILE=
DATE=
DATES=
DATES_FILE=
ANY_SATURDAY=
SEARCH_START_DATE=
SATURDAY_LOOKAHEAD_COUNT=
SATURDAY_LOOKAHEAD_WEEKS=
POLL_ENABLED=
POLL_START_TIME=
POLL_END_TIME=
POLL_INTERVAL_SECONDS=
POLL_TIMEZONE=
DISCOVERY_MODE=
DISCOVERY_VENUE_ID=
DISCOVERY_START_DATE=
DISCOVERY_PARTY_SIZE=
DISCOVERY_POLL_INTERVAL_SECONDS=
EARLIEST=
LATEST=
PARTY_SIZE=
PAYMENT_ID=
AUTH_TOKEN=
RESY_API_KEY=
```

| Variable | Description |
| --- | --- |
| `VENUE_ID` | Single-venue fallback when no venue list file is present. |
| `VENUE_IDS` | Optional comma-separated venue list. If set, it overrides both `VENUE_ID` and `venue_ids.txt`. |
| `VENUE_IDS_FILE` | Optional path to a text file with one or more venue IDs. If set, it overrides `VENUE_ID`. |
| `DATE` | The `YYYY-MM-DD` reservation date for single-date mode. |
| `DATES` | Optional comma-separated list of `YYYY-MM-DD` dates to search. |
| `DATES_FILE` | Optional path to a text file with one or more dates. |
| `ANY_SATURDAY` | When `true`, ignore `DATE` and search upcoming Saturdays instead. |
| `SEARCH_START_DATE` | Optional `YYYY-MM-DD` anchor for any-Saturday mode. Defaults to today. |
| `SATURDAY_LOOKAHEAD_COUNT` | How many Saturdays to check. Takes precedence over `SATURDAY_LOOKAHEAD_WEEKS`. |
| `SATURDAY_LOOKAHEAD_WEEKS` | How many weeks of Saturdays to check in any-Saturday mode. Defaults to `8`. |
| `POLL_ENABLED` | When `true`, wait for the configured polling window and retry until it closes or a booking succeeds. |
| `POLL_START_TIME` | Required when polling is enabled. Use `HH:MM` or `HH:MM:SS` in 24-hour time. |
| `POLL_END_TIME` | Required when polling is enabled. Use `HH:MM` or `HH:MM:SS` in 24-hour time. |
| `POLL_INTERVAL_SECONDS` | Seconds between attempts while polling. Defaults to `5`. |
| `POLL_TIMEZONE` | IANA timezone used for the polling window. Defaults to `America/New_York`. |
| `DISCOVERY_MODE` | When `true`, run safe horizon discovery instead of booking mode. |
| `DISCOVERY_VENUE_ID` | Venue ID to monitor in discovery mode. |
| `DISCOVERY_START_DATE` | Optional `YYYY-MM-DD` anchor for discovery mode. |
| `DISCOVERY_PARTY_SIZE` | Optional party size used for discovery polling. |
| `DISCOVERY_POLL_INTERVAL_SECONDS` | Seconds between discovery checks. |
| `EARLIEST` | The earliest time, in 24-hr format, you're willing to eat. |
| `LATEST` | Same as above: how late is too late to sit down? |
| `PARTY_SIZE` | 🎵 All by myself... 🎵 (it's an `int`) |
| `PAYMENT_ID` | You'll need this from your account. More details below. |
| `AUTH_TOKEN` | Same as above — just a JWT you can easily find. |
| `RESY_API_KEY` | Resy's API key used in request headers. |

### Venue IDs

For a single restaurant, keep `VENUE_ID` in `.env`.

For multi-venue searches, either set `VENUE_IDS`, create a `venue_ids.txt` file in the repo root, or point
`VENUE_IDS_FILE` at another path. Each line may contain one venue ID, `#` comments are ignored, and commas are also
supported.

Example:

```txt
# One venue ID per line
80201
80444
```

The precedence is `VENUE_IDS`, then `VENUE_IDS_FILE`, then repo-root `venue_ids.txt`, then `VENUE_ID`.

The venue ID itself can be found by going to the Network tab in your browser's inspector and searching for
`venue?filter` after navigating to the restaurant's page.

### Payment ID

You'll need to find your payment ID. This is a little tricky, but not too bad. Again, in the Network tab, find the
request that's made after you authenticate. You can search for `user` in the requests and find the one that has your
user information. `payment_method` is in there as an object and has a field of `id`. That's what you want.

### Auth Token

This is easier to find. You can head to Application > Cookies > https://resy.com and find the `authToken` cookie. This
does expire after a while, so you'll need to update it every so often.

### Resy API Key

Keep this in `.env` rather than source. If Resy rotates the key, update `RESY_API_KEY` there without changing the code.

## Usage

After adding your configuration, you can run the script with:

```bash
npm run start
```

This will trigger `env_manager.sh` before the build. By default, it shifts `DATE` forward by `14` days for single-date
mode. Override that with `BOOKING_HORIZON_DAYS` if your target venue opens on a different rolling window. If
`ANY_SATURDAY=true`, the script leaves `DATE` alone.

If you want to run the script exactly as configured in `.env`, use:

```bash
npm run start:today
```

To search every Saturday in the configured lookahead window, set `ANY_SATURDAY=true` and optionally adjust
`SATURDAY_LOOKAHEAD_COUNT`, `SATURDAY_LOOKAHEAD_WEEKS`, or `SEARCH_START_DATE`. In that mode, `DATE` is ignored and the
script checks each Saturday against every configured venue, rotating the venue order each week and stopping at the first
successful booking.

To poll around a known release time, enable polling and define a bounded window. The script will wait until the start
time, rerun the full booking pass every `POLL_INTERVAL_SECONDS`, and stop when a booking succeeds or the polling window
ends.

Example for Bungalow's `11:00 AM` New York release:

```env
ANY_SATURDAY=true
POLL_ENABLED=true
POLL_START_TIME=10:59:00
POLL_END_TIME=11:05:00
POLL_INTERVAL_SECONDS=5
POLL_TIMEZONE=America/New_York
```

For safe release-window discovery, enable discovery mode instead of booking mode. Discovery mode polls the calendar
horizon for one venue, logs whenever `last_calendar_day` advances, and never attempts a booking.

```env
DISCOVERY_MODE=true
DISCOVERY_VENUE_ID=80201
DISCOVERY_START_DATE=2026-03-30
DISCOVERY_PARTY_SIZE=2
DISCOVERY_POLL_INTERVAL_SECONDS=5
```

### Persistent Discovery Logging

If you want to leave discovery mode running on a machine like a Mac mini and review the release time later, run it in
`tmux` and append output to a logfile:

```bash
tmux new -As resy
cd /Users/hd/Developer/ez-resy
mkdir -p logs
./node_modules/.bin/dotenv -e .env node dist/index.js 2>&1 | tee -a logs/discovery-94741.log
```

Detach from `tmux` with `Ctrl-b d`.

To inspect the logfile later over SSH:

```bash
cd /Users/hd/Developer/ez-resy
tail -f logs/discovery-94741.log
```

To see only the release event after it happens:

```bash
rg "Calendar advanced" logs/discovery-94741.log
```

This is useful for answering "what exact Eastern time did the next booking day open for this venue?"

The booking guard is date-based rather than venue-based. If you already hold a reservation on one of the candidate
dates, the script skips that date across every configured restaurant so it does not waste requests on dates you cannot
book again.

For Bungalow in New York, the live venue data currently indicates an `11:00 AM EST` release on a `20`-day rolling
window. For that setup, use `ANY_SATURDAY=true`, `PARTY_SIZE=2`, `EARLIEST=17:00`, `LATEST=20:30`, and either
`VENUE_ID=80201` or a `venue_ids.txt` list that includes `80201`.
