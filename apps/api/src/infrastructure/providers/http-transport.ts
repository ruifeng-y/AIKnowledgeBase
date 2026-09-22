import { mapHttpStatusToProviderCode, ProviderError, redactSecrets } from './provider-error';

export interface ProviderRequestOptions {
  provider: string;
  model?: string;
  operation: string;
  endpoint: string;
  apiKey?: string;
  body: unknown;
  timeoutMs: number;
  maxRetries: number;
  requestId?: string;
  headers?: Record<string, string>;
}

export interface ProviderHttpResult {
  status: number;
  json: unknown;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 60_000);
  }
  const date = Date.parse(header);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    return delta > 0 ? Math.min(delta, 60_000) : 0;
  }
  return undefined;
}

function backoffMs(attempt: number): number {
  const base = Math.min(250 * 2 ** attempt, 4_000);
  const jitter = Math.floor(Math.random() * 100);
  return base + jitter;
}

/**
 * HTTP transport with timeout, bounded retries, and error normalization.
 * Vendor-specific payloads stay in adapter callers.
 */
export async function providerHttpPost(
  options: ProviderRequestOptions,
): Promise<ProviderHttpResult> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: ProviderError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      };
      if (options.apiKey) {
        headers['authorization'] = `Bearer ${options.apiKey}`;
      }
      if (options.requestId) {
        headers['x-request-id'] = options.requestId;
      }

      const response = await fetch(options.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(options.body),
        signal: controller.signal,
      });

      const text = await response.text();
      let json: unknown = null;
      try {
        json = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'provider returned malformed JSON', {
          provider: options.provider,
          model: options.model,
          operation: options.operation,
          requestId: options.requestId,
          httpStatus: response.status,
          retryable: false,
        });
      }

      if (!response.ok) {
        const code = mapHttpStatusToProviderCode(response.status);
        const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
        const err = new ProviderError(code, redactSecrets(`provider HTTP ${response.status}`), {
          provider: options.provider,
          model: options.model,
          operation: options.operation,
          requestId: options.requestId,
          httpStatus: response.status,
          retryAfterMs,
          retryable: response.status === 429 || response.status >= 500 || response.status === 408,
        });
        if (err.retryable && attempt < maxRetries) {
          lastError = err;
          await sleep(err.retryAfterMs ?? backoffMs(attempt));
          continue;
        }
        throw err;
      }

      return { status: response.status, json };
    } catch (error) {
      if (error instanceof ProviderError) {
        if (error.retryable && attempt < maxRetries) {
          lastError = error;
          await sleep(error.retryAfterMs ?? backoffMs(attempt));
          continue;
        }
        throw error;
      }

      const aborted = error instanceof Error && error.name === 'AbortError';
      const code = aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK_ERROR';
      const err = new ProviderError(
        code,
        redactSecrets(aborted ? 'provider timeout' : 'provider network error'),
        {
          provider: options.provider,
          model: options.model,
          operation: options.operation,
          requestId: options.requestId,
          retryable: true,
          cause: error,
        },
      );
      if (attempt < maxRetries) {
        lastError = err;
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw (
    lastError ??
    new ProviderError('PROVIDER_NETWORK_ERROR', 'provider request failed', {
      provider: options.provider,
      model: options.model,
      operation: options.operation,
    })
  );
}
