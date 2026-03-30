import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
  const previousEnv: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(values)) {
    previousEnv[key] = process.env[key];

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export function createTempFile(contents: string, filename = 'fixture.txt'): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'ez-resy-tests-'));
  const filePath = join(tempDir, filename);
  writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

export function removeTempPath(pathToRemove: string): void {
  rmSync(pathToRemove, { recursive: true, force: true });
}

export function removeTempFile(filePath: string): void {
  rmSync(filePath, { force: true });
  rmSync(dirname(filePath), { recursive: true, force: true });
}
