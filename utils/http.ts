export type HttpMethod = 'get' | 'post';

export interface ResyRequestConfig {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  data?: unknown;
}

export class HttpRequestError extends Error {
  code?: string;
  data?: unknown;
  status?: number;

  constructor(message: string, options: { code?: string; data?: unknown; status?: number } = {}) {
    super(message);
    this.name = 'HttpRequestError';
    this.code = options.code;
    this.data = options.data;
    this.status = options.status;
  }
}

export function isHttpRequestError(error: unknown): error is HttpRequestError {
  return error instanceof HttpRequestError;
}

export function getErrorDetail(error: unknown): unknown {
  if (isHttpRequestError(error)) {
    return error.data ?? error.code ?? error.message;
  }

  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    return code ?? error.message;
  }

  return error;
}

export async function requestJson<T>(config: ResyRequestConfig): Promise<T> {
  const response = await sendRequest(config);
  return parseJsonResponse<T>(response);
}

export async function requestRaw(config: ResyRequestConfig): Promise<Response> {
  return sendRequest(config);
}

async function sendRequest(config: ResyRequestConfig): Promise<Response> {
  const headers = new Headers(config.headers);
  const body = buildRequestBody(config.data, headers);

  let response: Response;

  try {
    response = await fetch(config.url, {
      method: config.method.toUpperCase(),
      headers,
      body,
    });
  } catch (error: unknown) {
    const causeCode =
      error instanceof Error && 'cause' in error && error.cause && typeof error.cause === 'object' && 'code' in error.cause
        ? String((error.cause as { code?: string }).code)
        : undefined;
    const errorCode =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : causeCode;

    throw new HttpRequestError(
      error instanceof Error ? error.message : 'Network request failed.',
      { code: errorCode },
    );
  }

  if (!response.ok) {
    const data = await parseResponseBody(response);
    throw new HttpRequestError(
      `Request failed with status ${response.status}.`,
      {
        status: response.status,
        data,
      },
    );
  }

  return response;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const data = await parseResponseBody(response);

  if (typeof data === 'string') {
    throw new HttpRequestError('Expected a JSON response body.', { data });
  }

  return data as T;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildRequestBody(
  data: unknown,
  headers: Headers,
): BodyInit | undefined {
  if (data === undefined) {
    return undefined;
  }

  if (
    typeof data === 'string' ||
    data instanceof URLSearchParams ||
    data instanceof FormData ||
    data instanceof Blob ||
    data instanceof ArrayBuffer
  ) {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    return data as unknown as BodyInit;
  }

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const contentType = headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return JSON.stringify(data);
  }

  return String(data);
}
