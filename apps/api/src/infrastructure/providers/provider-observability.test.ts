import { describe, expect, it } from 'vitest';
import { logProviderMetric, logProviderStarted, redactSecrets } from './provider-error';
import { logProviderEvent } from '@akb/ai';

const SECRET_VALUE = 'SECRET_VALUE_ABC123';

function captureLogs(fn: () => void): string {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

describe('provider observability and redaction', () => {
  it('started / completed / failed events use expected names', () => {
    const started = captureLogs(() =>
      logProviderStarted({ operation: 'embedding', provider: 'mock', model: 'm' }),
    );
    expect(started).toContain('provider.request.started');

    const completed = captureLogs(() =>
      logProviderMetric({
        provider: 'mock',
        model: 'm',
        operation: 'embedding',
        latencyMs: 5,
        success: true,
        retryCount: 0,
      }),
    );
    expect(completed).toContain('provider.request.completed');

    const failed = captureLogs(() =>
      logProviderMetric({
        provider: 'mock',
        model: 'm',
        operation: 'llm',
        latencyMs: 5,
        success: false,
        errorCode: 'PROVIDER_TIMEOUT',
        retryCount: 2,
      }),
    );
    expect(failed).toContain('provider.request.failed');
    expect(failed).toContain('PROVIDER_TIMEOUT');
  });

  it('metrics payload has no high-cardinality business fields', () => {
    const line = captureLogs(() =>
      logProviderMetric({
        provider: 'mock',
        model: 'm',
        operation: 'reranker',
        latencyMs: 1,
        success: true,
        retryCount: 0,
      }),
    );
    for (const forbidden of [
      'workspaceId',
      'spaceId',
      'documentId',
      'chunkId',
      'query',
      'prompt',
      'answer',
      'apiKey',
    ]) {
      expect(line).not.toContain(forbidden);
    }
  });

  it('redacts Bearer tokens, sk- keys, and apiKey= values', () => {
    const samples = [
      `Authorization: Bearer ${SECRET_VALUE}`,
      `apiKey=${SECRET_VALUE}`,
      `api_key: ${SECRET_VALUE}`,
      `sk-${SECRET_VALUE}`,
    ];
    for (const sample of samples) {
      const redacted = redactSecrets(sample);
      expect(redacted).not.toContain(SECRET_VALUE);
    }
  });

  it('observability logger does not throw when JSON stringify is stressed', () => {
    expect(() =>
      logProviderEvent('provider.request.completed', {
        operation: 'embedding',
        provider: 'mock',
        model: 'm',
        big: 'x'.repeat(10),
      }),
    ).not.toThrow();
  });

  it('failure path secrets stay redacted in message helper', () => {
    const text = redactSecrets(`provider HTTP 401 Bearer ${SECRET_VALUE}`);
    expect(text).not.toContain(SECRET_VALUE);
  });
});
