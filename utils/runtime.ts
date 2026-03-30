const REQUIRED_ENV_KEYS = [
  'AUTH_TOKEN',
  'DATE',
  'EARLIEST',
  'LATEST',
  'PARTY_SIZE',
  'PAYMENT_ID',
  'VENUE_ID',
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

export function getRequiredEnv(key: RequiredEnvKey): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
