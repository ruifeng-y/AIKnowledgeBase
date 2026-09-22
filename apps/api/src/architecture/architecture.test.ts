import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiSrc = path.resolve(__dirname, '..');

function listFiles(dir: string, acc: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function importsOf(file: string): string[] {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
  return [...matches].map((m) => m[1] ?? '');
}

function relative(file: string): string {
  return path.relative(apiSrc, file).replace(/\\/g, '/');
}

const allFiles = listFiles(apiSrc);
const domainFiles = allFiles.filter((f) => relative(f).includes('/domain/'));
const applicationFiles = allFiles.filter((f) => relative(f).includes('/application/'));
const presentationFiles = allFiles.filter((f) => relative(f).includes('/presentation/'));

function hasForbidden(imports: string[], patterns: RegExp[]): boolean {
  return imports.some((imp) => patterns.some((p) => p.test(imp)));
}

describe('architecture rules', () => {
  it('has domain, application, and presentation files to inspect', () => {
    expect(domainFiles.length).toBeGreaterThan(0);
    expect(applicationFiles.length).toBeGreaterThan(0);
    expect(presentationFiles.length).toBeGreaterThan(0);
  });

  it('domain layer does not depend on NestJS, Prisma, or infrastructure SDKs', () => {
    const forbidden = [
      /^@nestjs\//,
      /@prisma\//,
      /(^|\/)prisma$/i,
      /@akb\/db/,
      /^minio$/,
      /^bullmq$/,
      /^ioredis$/,
    ];
    for (const file of domainFiles) {
      const imports = importsOf(file);
      expect(
        hasForbidden(imports, forbidden),
        `${relative(file)} has forbidden imports: ${imports.join(', ')}`,
      ).toBe(false);
    }
  });

  it('application layer does not depend on Prisma, MinIO, or AI SDKs', () => {
    const forbidden = [
      /@prisma\//,
      /(^|\/)prisma$/i,
      /^minio$/,
      /^bullmq$/,
      /^openai$/,
      /^@anthropic-ai\//,
      /^@akb\/db/,
      /ai-provider\.ports/,
      /mock-ai-providers/,
    ];
    for (const file of applicationFiles) {
      const imports = importsOf(file);
      expect(
        hasForbidden(imports, forbidden),
        `${relative(file)} has forbidden imports: ${imports.join(', ')}`,
      ).toBe(false);
    }
  });

  it('presentation layer does not depend on Prisma or storage/queue SDKs', () => {
    const forbidden = [/@prisma\//, /(^|\/)prisma$/i, /^minio$/, /^bullmq$/, /@akb\/db/];
    for (const file of presentationFiles) {
      const imports = importsOf(file);
      expect(
        hasForbidden(imports, forbidden),
        `${relative(file)} has forbidden imports: ${imports.join(', ')}`,
      ).toBe(false);
    }
  });

  it('presentation does not import infrastructure adapters directly from modules health controller', () => {
    const healthController = allFiles.find((f) =>
      relative(f).includes('modules/health/health.controller.ts'),
    );
    if (!healthController) {
      return;
    }
    const imports = importsOf(healthController);
    expect(hasForbidden(imports, [/@prisma\//, /^minio$/, /^bullmq$/, /@akb\/db/])).toBe(false);
  });

  it('no legacy ai-provider scaffolding remains', () => {
    const legacy = allFiles.filter((f) => {
      const r = relative(f);
      return (
        r.includes('ai-provider.ports') ||
        r.includes('mock-ai-providers') ||
        r.includes('ai-providers.module')
      );
    });
    expect(legacy, `legacy AI scaffolding still present: ${legacy.join(', ')}`).toEqual([]);
  });

  it('evaluation layer does not import Prisma or write production repositories', () => {
    const evalRoot = path.resolve(__dirname, '..', '..', '..', 'evaluation');
    if (!fs.existsSync(evalRoot)) {
      return;
    }
    const evalFiles: string[] = [];
    listFiles(evalRoot, evalFiles);
    for (const file of evalFiles) {
      const imports = importsOf(file);
      expect(
        hasForbidden(imports, [/@prisma\//, /(^|\/)prisma$/i, /@akb\/db/]),
        `${file} evaluation import violates boundary: ${imports.join(', ')}`,
      ).toBe(false);
    }
  });

  it('domain does not import provider HTTP transport or concrete adapters', () => {
    for (const file of domainFiles) {
      const imports = importsOf(file);
      expect(
        hasForbidden(imports, [
          /infrastructure\/providers/,
          /openai-compatible/,
          /http-transport/,
          /^node-fetch$/,
          /^undici$/,
        ]),
        `${relative(file)} domain must not import provider transport`,
      ).toBe(false);
    }
  });

  it('application does not import provider adapters or HTTP transport', () => {
    for (const file of applicationFiles) {
      const imports = importsOf(file);
      expect(
        hasForbidden(imports, [
          /infrastructure\/providers/,
          /openai-compatible/,
          /http-transport/,
          /provider\.registry/,
        ]),
        `${relative(file)} application must not import provider adapters`,
      ).toBe(false);
    }
  });
});
