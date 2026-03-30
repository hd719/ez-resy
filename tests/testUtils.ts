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

  const restoreEnv = () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  try {
    const result = run();

    if (result && typeof (result as unknown as PromiseLike<unknown>).then === 'function') {
      return Promise.resolve(result).finally(restoreEnv) as T;
    }

    restoreEnv();
    return result;
  } catch (error) {
    restoreEnv();
    throw error;
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
