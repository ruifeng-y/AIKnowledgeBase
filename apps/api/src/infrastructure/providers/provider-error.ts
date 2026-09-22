/** Normalized provider errors — no vendor SDK types leak to Application/Domain. */

export type ProviderErrorCode =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_BAD_REQUEST'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_SERVER_ERROR'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'PROVIDER_NETWORK_ERROR'
  | 'PROVIDER_NOT_CONFIGURED';

export interface ProviderErrorOptions {
  provider: string;
  model?: string;
  operation?: string;
  requestId?: string;
  retryable?: boolean;
  retryAfterMs?: number;
  httpStatus?: number;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly provider: string;
  readonly model: string | undefined;
  readonly operation: string | undefined;
  readonly requestId: string | undefined;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly httpStatus: number | undefined;

  constructor(code: ProviderErrorCode, message: string, options: ProviderErrorOptions) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.provider = options.provider;
    this.model = options.model;
    this.operation = options.operation;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? defaultRetryable(code);
    this.retryAfterMs = options.retryAfterMs;
    this.httpStatus = options.httpStatus;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export function defaultRetryable(code: ProviderErrorCode): boolean {
  switch (code) {
    case 'PROVIDER_TIMEOUT':
    case 'PROVIDER_RATE_LIMITED':
    case 'PROVIDER_SERVER_ERROR':
    case 'PROVIDER_NETWORK_ERROR':
      return true;
    default:
      return false;
  }
}

export function mapHttpStatusToProviderCode(status: number): ProviderErrorCode {
  if (status === 400) return 'PROVIDER_BAD_REQUEST';
  if (status === 401 || status === 403) return 'PROVIDER_AUTH_FAILED';
  if (status === 404) return 'PROVIDER_NOT_FOUND';
  if (status === 408) return 'PROVIDER_TIMEOUT';
  if (status === 429) return 'PROVIDER_RATE_LIMITED';
  if (status >= 500) return 'PROVIDER_SERVER_ERROR';
  return 'PROVIDER_BAD_REQUEST';
}

export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9]{4,}/g, 'sk-[redacted]')
    .replace(/api[_-]?key['"]?\s*[:=]\s*['"]?[^'"\s,}]+/gi, 'api_key=[redacted]');
}

export interface ProviderMetric {
  provider: string;
  model: string;
  operation: string;
  latencyMs: number;
  success: boolean;
  errorCode?: string;
  retryCount: number;
  requestId?: string;
  inputCount?: number;
  outputCount?: number;
  dimensions?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}

export function logProviderMetric(metric: ProviderMetric): void {
  // metadata only — never logs secrets, prompts, or full provider payloads
  console.log(JSON.stringify({ event: 'provider_metric', ...metric }));
}
