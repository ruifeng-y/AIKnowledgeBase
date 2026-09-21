import { describe, expect, it } from 'vitest';
import { ApproxTokenEstimator } from './token-estimator';
import { StructureAwareChunkingStrategy } from './structure-aware-chunking.strategy';
import { ChunkingError, DEFAULT_CHUNKING_CONFIG } from './chunking.types';

const estimator = new ApproxTokenEstimator();

function section(
  id: string,
  content: string,
  order: number,
  extra: Partial<{ title: string; level: number; version: string }> = {},
) {
  return {
    id,
    documentVersionId: extra.version ?? 'ver-1',
    title: extra.title,
    level: extra.level,
    content,
    order,
  };
}

const baseInput = {
  documentId: 'doc-1',
  documentVersionId: 'ver-1',
  knowledgeSpaceId: 'space-1',
};

describe('StructureAwareChunkingStrategy', () => {
  const strategy = new StructureAwareChunkingStrategy(estimator);

  it('handles small, normal, large, empty sections', () => {
    const large = 'word '.repeat(2000);
    const result = strategy.chunk({
      ...baseInput,
      sections: [
        section('s0', 'tiny section', 0),
        section('s1', 'para one.\n\npara two about documents and services.', 1),
        section('s2', large, 2),
        section('s3', '   \n\n ', 3),
      ],
    });
    expect(result.chunks.every((c) => c.content.length > 0)).toBe(true);
    expect(result.chunks.every((c) => c.tokenCount > 0)).toBe(true);
    expect(result.chunks.some((c) => c.tokenCount < DEFAULT_CHUNKING_CONFIG.minTokens)).toBe(true);
    expect(result.chunks.some((c) => c.sectionId === 's3')).toBe(false);
    const indexes = result.chunks.map((c) => c.chunkIndex);
    expect(indexes).toEqual(indexes.map((_, i) => i));
  });

  it('does not merge across sections', () => {
    const result = strategy.chunk({
      ...baseInput,
      sections: [
        section('s0', 'section zero content that is short', 0, { title: 'S0', level: 1 }),
        section('s1', 'section one content that is short', 1, { title: 'S1', level: 1 }),
      ],
    });
    expect(new Set(result.chunks.map((c) => c.sectionId)).size).toBe(2);
  });

  it('preserves heading path', () => {
    const result = strategy.chunk({
      ...baseInput,
      sections: [
        section('h1', 'Backend overview text', 0, { title: 'Backend', level: 1 }),
        section('h2', 'Authentication details for backend system', 1, {
          title: 'Authentication',
          level: 2,
        }),
        section('h3', 'JWT token explanation content', 2, { title: 'JWT', level: 3 }),
      ],
    });
    const jwt = result.chunks.find((c) => c.sectionId === 'h3');
    expect(jwt?.metadata.headingPath).toEqual(['Backend', 'Authentication', 'JWT']);
  });

  it('keeps code blocks intact when possible', () => {
    const code = '```python\ndef login():\n    return authenticate()\n```';
    const result = strategy.chunk({
      ...baseInput,
      sections: [section('code', code, 0)],
    });
    expect(result.chunks.some((c) => c.metadata.isCode === true)).toBe(true);
    expect(result.chunks.map((c) => c.content).join('\n')).toContain('def login');
  });

  it('supports Chinese/English mixed content', () => {
    const text =
      '系统架构说明 Architecture uses PostgreSQL and Redis.\n\n订单服务 OrderService handles orders.';
    const result = strategy.chunk({ ...baseInput, sections: [section('zh', text, 0)] });
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.map((c) => c.content).join(' ')).toContain('OrderService');
  });

  it('throws on version mismatch', () => {
    expect(() =>
      strategy.chunk({
        ...baseInput,
        sections: [section('bad', 'content', 0, { version: 'other' })],
      }),
    ).toThrow(ChunkingError);
  });

  it('is deterministic / idempotent', () => {
    const sections = [
      section('a', 'alpha content '.repeat(80), 0, { title: 'A', level: 1 }),
      section('b', 'beta content '.repeat(80), 1, { title: 'B', level: 2 }),
    ];
    const r1 = strategy.chunk({ ...baseInput, sections });
    const r2 = strategy.chunk({ ...baseInput, sections });
    expect(r1.chunks.length).toBe(r2.chunks.length);
    expect(r1.chunks.map((c) => [c.content, c.chunkIndex, c.sectionId, c.tokenCount])).toEqual(
      r2.chunks.map((c) => [c.content, c.chunkIndex, c.sectionId, c.tokenCount]),
    );
  });

  it('estimates tokens deterministically', () => {
    const t = estimator.count('hello world hello');
    expect(estimator.count('hello world hello')).toBe(t);
    expect(t).toBeGreaterThan(0);
  });

  it('produces 10+ sections / 100+ chunks stably', () => {
    const sections = Array.from({ length: 12 }, (_, i) =>
      section(`sec-${i}`, `Section ${i} introduction. ${'content token sample '.repeat(40)}`, i, {
        title: `S${i}`,
        level: 1,
      }),
    );
    const result = strategy.chunk({ ...baseInput, sections });
    expect(result.stats.sectionCount).toBe(12);
    expect(result.chunks.length).toBeGreaterThanOrEqual(12);
    expect(result.chunks.every((c) => c.tokenCount > 0)).toBe(true);
  });
});
