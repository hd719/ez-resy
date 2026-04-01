import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export interface MockFetchCall {
  input: string;
  init?: RequestInit;
}

export interface MockFetchResponse {
  ok?: boolean;
  status?: number;
  body?: unknown;
}

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

export function withMockedFetch<T>(
  handler: (call: MockFetchCall) => Promise<MockFetchResponse>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = global.fetch;

  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const response = await handler({ input: url, init });
    const status = response.status ?? (response.ok === false ? 500 : 200);

    return new Response(
      response.body === undefined
        ? null
        : typeof response.body === 'string'
          ? response.body
          : JSON.stringify(response.body),
      {
        status,
        headers: {
          'content-type':
            response.body === undefined || typeof response.body === 'string'
              ? 'text/plain'
              : 'application/json',
        },
      },
    );
  }) as typeof fetch;

  return run().finally(() => {
    global.fetch = originalFetch;
  });
}
