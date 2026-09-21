import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { APP_CONFIG } from '../../common/config/app-config';
import { DocumentProcessingService } from '../../../../worker/src/services/document-processing.service';
import { WorkerMinioObjectStorage } from '../../../../worker/src/api-storage/worker-minio-storage';

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;

function testConfig() {
  return {
    app: { nodeEnv: 'test', port: 0, apiPrefix: 'api/v1', corsOrigins: ['http://localhost:3000'] },
    database: {
      url:
        process.env['DATABASE_URL'] ??
        'postgresql://akb:change_me@localhost:5432/ai_knowledge_base',
    },
    redis: { host: 'localhost', port: 6379, url: 'redis://localhost:6379' },
    storage: {
      endpoint: 'http://127.0.0.1:9000',
      accessKeyId: 'minioadmin',
      secretAccessKey: 'change_me',
      bucket: 'ai-knowledge-base',
      region: 'us-east-1',
    },
    auth: {
      jwtSecret: process.env['JWT_SECRET'] ?? 'test-secret-v04h-p1',
      accessTokenTtl: '15m',
      refreshTokenTtl: '7d',
    },
    documents: {
      maxFileSizeBytes: 1024 * 1024,
      allowedMimeTypes: ['text/plain', 'text/markdown'],
    },
    ai: {
      llmProvider: 'mock',
      llmModel: 'mock-llm',
      embeddingProvider: 'mock',
      embeddingModel: 'mock-embedding',
      embeddingDimensions: 8,
      rerankerProvider: 'mock',
      rerankerModel: 'mock-reranker',
    },
    queue: { defaultQueue: 'akb-default' },
    logging: { level: 'error' },
  };
}

describe('V0.4-H-P1 chunk API version filtering', () => {
  let app: INestApplication;
  let processor: DocumentProcessingService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(testConfig())
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    processor = new DocumentProcessingService(
      new WorkerMinioObjectStorage({
        endPoint: 'http://127.0.0.1:9000',
        accessKey: 'minioadmin',
        secretKey: 'change_me',
        bucket: 'ai-knowledge-base',
      }),
    );
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('filters by versionId, validates ownership, and isolates tenants', async () => {
    const server = () => app.getHttpServer();
    const userA = { email: `p1-a-${suffix}@example.com`, password: 'password123', name: 'P1 A' };
    const userB = { email: `p1-b-${suffix}@example.com`, password: 'password123', name: 'P1 B' };

    const regA = await request(server()).post('/api/v1/auth/register').send(userA).expect(201);
    const regB = await request(server()).post('/api/v1/auth/register').send(userB).expect(201);
    const tokenA = regA.body.tokens.accessToken as string;
    const tokenB = regB.body.tokens.accessToken as string;

    const wsA = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'WS A', slug: `ws-p1-a-${suffix}` })
      .expect(201);
    const spA = await request(server())
      .post(`/api/v1/workspaces/${wsA.body.id}/spaces`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Space A', slug: `space-p1-a-${suffix}` })
      .expect(201);

    const md1 = [
      '# V1',
      '',
      'v1 alpha content '.repeat(30),
      '',
      '## Extra',
      '',
      'v1 beta content '.repeat(30),
    ].join('\n');
    const md2 = ['v2 only content ', 'for second version document'].join('\n').repeat(20);

    const uploadV1 = await request(server())
      .post(`/api/v1/spaces/${spA.body.id}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .field('title', 'Versioned doc')
      .attach('file', Buffer.from(md1, 'utf8'), {
        filename: 'v1.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    const docId = uploadV1.body.id as string;
    const version1 = uploadV1.body.currentVersionId as string;
    await processor.process({ documentId: docId, documentVersionId: version1 });

    const uploadV2 = await request(server())
      .post(`/api/v1/spaces/${spA.body.id}/documents/${docId}/versions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(md2, 'utf8'), {
        filename: 'v2.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    const version2 = uploadV2.body.currentVersionId as string;
    await processor.process({ documentId: docId, documentVersionId: version2 });

    // Default query → current version only (V2)
    const defaultRes = await request(server())
      .get(`/api/v1/documents/${docId}/chunks`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(defaultRes.body.versionId).toBe(version2);
    expect(defaultRes.body.total).toBeGreaterThan(0);
    expect(
      defaultRes.body.items.every((item: { documentVersionId: string }) => {
        return item.documentVersionId === version2;
      }),
    ).toBe(true);
    const v1Marker = defaultRes.body.items.some((item: { content: string }) =>
      item.content.includes('v1 alpha content'),
    );
    expect(v1Marker).toBe(false);

    // Explicit V1
    const v1Res = await request(server())
      .get(`/api/v1/documents/${docId}/chunks?versionId=${version1}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(v1Res.body.versionId).toBe(version1);
    expect(v1Res.body.total).toBeGreaterThan(0);
    expect(
      v1Res.body.items.every((item: { documentVersionId: string }) => {
        return item.documentVersionId === version1;
      }),
    ).toBe(true);

    // Explicit V2
    const v2Res = await request(server())
      .get(`/api/v1/documents/${docId}/chunks?versionId=${version2}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(v2Res.body.versionId).toBe(version2);
    expect(
      v2Res.body.items.every((item: { documentVersionId: string }) => {
        return item.documentVersionId === version2;
      }),
    ).toBe(true);
    expect(v2Res.body.total).toBe(defaultRes.body.total);

    // Foreign version (other document) → 404
    const wsB = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'WS B', slug: `ws-p1-b-${suffix}` })
      .expect(201);
    const spB = await request(server())
      .post(`/api/v1/workspaces/${wsB.body.id}/spaces`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Space B', slug: `space-p1-b-${suffix}` })
      .expect(201);
    const uploadB = await request(server())
      .post(`/api/v1/spaces/${spB.body.id}/documents/upload`)
      .set('Authorization', `Bearer ${tokenB}`)
      .attach('file', Buffer.from('tenant b doc', 'utf8'), {
        filename: 'b.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    const versionB = uploadB.body.currentVersionId as string;
    await processor.process({
      documentId: uploadB.body.id as string,
      documentVersionId: versionB,
    });

    const foreignVersion = await request(server())
      .get(`/api/v1/documents/${docId}/chunks?versionId=${versionB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    expect(foreignVersion.body.error.code).toBe('DOCUMENT_NOT_FOUND');

    const missingVersion = await request(server())
      .get(`/api/v1/documents/${docId}/chunks?versionId=00000000-0000-0000-0000-000000000099`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    // Tenant isolation
    await request(server())
      .get(`/api/v1/documents/${docId}/chunks`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(server())
      .get(`/api/v1/documents/${docId}/chunks?versionId=${version1}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    await request(server())
      .delete(`/api/v1/workspaces/${wsA.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(server())
      .delete(`/api/v1/workspaces/${wsB.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(missingVersion.status).toBe(404);
  }, 90_000);
});
