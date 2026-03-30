import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_ENV_KEYS = [
  'AUTH_TOKEN',
  'EARLIEST',
  'LATEST',
  'PARTY_SIZE',
  'PAYMENT_ID',
  'RESY_API_KEY',
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

export function getRequiredEnv(key: string): string {
  const value = process.env[key];

  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value.trim();
}

export function getOptionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim() ? value.trim() : undefined;
}

export function getBooleanEnv(key: string, defaultValue = false): boolean {
  const value = getOptionalEnv(key);

  if (!value) {
    return defaultValue;
  }

  return /^(1|true|yes|on)$/i.test(value);
}

export function getPositiveIntegerEnv(key: string, defaultValue: number): number {
  const value = getOptionalEnv(key);

  if (!value) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Environment variable ${key} must be a positive integer.`);
  }

  return parsedValue;
}

export function parseDelimitedEnvList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getOptionalEnvList(key: string): string[] {
  return parseDelimitedEnvList(getOptionalEnv(key));
}

export function readLinesFile(filePath: string): string[] {
  const resolvedFilePath = resolve(filePath);

  if (!existsSync(resolvedFilePath)) {
    return [];
  }

  return readFileSync(resolvedFilePath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.replace(/#.*/u, '').trim())
    .filter(Boolean);
}
