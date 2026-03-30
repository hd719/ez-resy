import {
  getBooleanEnv,
  getOptionalEnv,
  getPositiveIntegerEnv,
} from './runtime.js';

export interface PollingAttemptOutcome {
  success: boolean;
  shouldContinue: boolean;
}

export interface PollingConfig {
  enabled: boolean;
  startTime?: string;
  endTime?: string;
  intervalSeconds: number;
  timezone: string;
}

interface ZonedClock {
  date: string;
  time: string;
}

const DEFAULT_POLL_TIMEZONE = 'America/New_York';
const DEFAULT_POLL_INTERVAL_SECONDS = 5;

export function getPollingConfig(): PollingConfig {
  const enabled = getBooleanEnv('POLL_ENABLED', false);
  const startTime = normalizeTimeValue(getOptionalEnv('POLL_START_TIME'));
  const endTime = normalizeTimeValue(getOptionalEnv('POLL_END_TIME'));
  const intervalSeconds = getPositiveIntegerEnv(
    'POLL_INTERVAL_SECONDS',
    DEFAULT_POLL_INTERVAL_SECONDS,
  );
  const timezone = getOptionalEnv('POLL_TIMEZONE') ?? DEFAULT_POLL_TIMEZONE;

  if (enabled) {
    if (!startTime || !endTime) {
      throw new Error(
        'POLL_START_TIME and POLL_END_TIME are required when POLL_ENABLED=true.',
      );
    }

    if (compareTimes(startTime, endTime) >= 0) {
      throw new Error('POLL_END_TIME must be later than POLL_START_TIME.');
    }
  }

  return {
    enabled,
    startTime,
    endTime,
    intervalSeconds,
    timezone,
  };
}

export function describePollingConfig(config: PollingConfig): string {
  if (!config.enabled) {
    return 'Polling disabled; running a single booking pass.';
  }

  return `Polling every ${config.intervalSeconds} seconds between ${formatDisplayTime(
    config.startTime as string,
  )} and ${formatDisplayTime(config.endTime as string)} (${config.timezone}).`;
}

export async function runWithPolling(
  action: () => Promise<PollingAttemptOutcome>,
  config = getPollingConfig(),
): Promise<boolean> {
  if (!config.enabled) {
    const outcome = await action();
    return outcome.success;
  }

  console.log(describePollingConfig(config));

  let waitLogged = false;
  let attempt = 0;

  while (true) {
    const now = getZonedClock(config.timezone);

    if (compareTimes(now.time, config.startTime as string) < 0) {
      if (!waitLogged) {
        console.log(
          `Current time is ${now.time} in ${config.timezone}; waiting for ${config.startTime}.`,
        );
        waitLogged = true;
      }

      const waitSeconds = Math.max(
        1,
        Math.min(
          config.intervalSeconds,
          secondsBetween(now.time, config.startTime as string),
        ),
      );
      await sleep(waitSeconds * 1000);
      continue;
    }

    if (compareTimes(now.time, config.endTime as string) > 0) {
      console.log(
        `Polling window closed at ${config.endTime} (${config.timezone}) with no reservation booked.`,
      );
      return false;
    }

    attempt += 1;
    console.log(
      `Polling attempt ${attempt} at ${now.date} ${now.time} (${config.timezone}).`,
    );

    const outcome = await action();
    if (outcome.success) {
      return true;
    }

    if (!outcome.shouldContinue) {
      return false;
    }

    const afterAttempt = getZonedClock(config.timezone);
    if (compareTimes(afterAttempt.time, config.endTime as string) >= 0) {
      console.log(
        `Polling window closed at ${config.endTime} (${config.timezone}) with no reservation booked.`,
      );
      return false;
    }

    await sleep(config.intervalSeconds * 1000);
  }
}

function getZonedClock(timezone: string): ZonedClock {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date());
  const lookup = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((part) => part.type === type)?.value;

    if (!value) {
      throw new Error(`Unable to resolve ${type} for timezone ${timezone}.`);
    }

    return value;
  };

  return {
    date: `${lookup('year')}-${lookup('month')}-${lookup('day')}`,
    time: `${lookup('hour')}:${lookup('minute')}:${lookup('second')}`,
  };
}

function normalizeTimeValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u);
  if (!match) {
    throw new Error(`Invalid time value "${value}". Expected HH:MM or HH:MM:SS.`);
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3] ?? '0', 10);

  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error(`Invalid time value "${value}".`);
  }

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
}

function compareTimes(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function secondsBetween(start: string, end: string): number {
  return toSeconds(end) - toSeconds(start);
}

function toSeconds(time: string): number {
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDisplayTime(time: string): string {
  return time.slice(0, 5);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
