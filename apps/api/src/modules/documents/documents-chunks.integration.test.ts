import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { APP_CONFIG } from '../../common/config/app-config';
import { DocumentProcessingService } from '../../../../worker/src/services/document-processing.service';
import { WorkerMinioObjectStorage } from '../../../../worker/src/api-storage/worker-minio-storage';
import { knowledgeChunkRepository } from '@akb/db';

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
      endpoint: process.env['S3_ENDPOINT'] ?? 'http://localhost:9000',
      accessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? 'minioadmin',
      secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? 'change_me',
      bucket: process.env['S3_BUCKET'] ?? 'ai-knowledge-base',
      region: 'us-east-1',
    },
    auth: {
      jwtSecret: process.env['JWT_SECRET'] ?? 'test-secret-v04h',
      accessTokenTtl: '15m',
      refreshTokenTtl: '7d',
    },
    documents: {
      maxFileSizeBytes: 1024 * 1024,
      allowedMimeTypes: ['text/plain', 'text/markdown', 'application/json'],
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

describe('V0.4-H Chunking integration', () => {
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

  it('upload → process → chunks → ready; rechunk idempotent; tenant 404', async () => {
    const server = () => app.getHttpServer();
    const userA = { email: `h-a-${suffix}@example.com`, password: 'password123', name: 'H A' };
    const userB = { email: `h-b-${suffix}@example.com`, password: 'password123', name: 'H B' };

    const regA = await request(server()).post('/api/v1/auth/register').send(userA).expect(201);
    const regB = await request(server()).post('/api/v1/auth/register').send(userB).expect(201);
    const tokenA = regA.body.tokens.accessToken as string;
    const tokenB = regB.body.tokens.accessToken as string;

    const wsA = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'WS A', slug: `ws-h-a-${suffix}` })
      .expect(201);
    const spA = await request(server())
      .post(`/api/v1/workspaces/${wsA.body.id}/spaces`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Space A', slug: `space-h-a-${suffix}` })
      .expect(201);

    const md = [
      '# Backend',
      '',
      'Backend overview with PostgreSQL.',
      '',
      '## Authentication',
      '',
      'Authentication allows users to log in using JWT tokens. '.repeat(15),
      '',
      '## JWT',
      '',
      'JWT contains access token payload. '.repeat(15),
      '',
      '```js',
      'function login() { return token(); }',
      '```',
    ].join('\n');

    const upload = await request(server())
      .post(`/api/v1/spaces/${spA.body.id}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .field('title', 'Chunk source')
      .attach('file', Buffer.from(md, 'utf8'), {
        filename: 'chunk.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    const docId = upload.body.id as string;
    const versionId = upload.body.currentVersionId as string;
    expect(upload.body.status).toBe('PENDING');

    await processor.process({ documentId: docId, documentVersionId: versionId });

    const status = await request(server())
      .get(`/api/v1/documents/${docId}/processing`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(status.body.documentStatus).toBe('READY');

    const chunksRes = await request(server())
      .get(`/api/v1/documents/${docId}/chunks`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(chunksRes.body.total).toBeGreaterThan(0);
    expect(chunksRes.body.versionId).toBe(versionId);
    const indexes = chunksRes.body.items.map((i: { chunkIndex: number }) => i.chunkIndex);
    expect(indexes).toEqual(indexes.map((_: number, i: number) => i));

    const count1 = chunksRes.body.total as number;
    await processor.process({ documentId: docId, documentVersionId: versionId });
    const chunksRes2 = await request(server())
      .get(`/api/v1/documents/${docId}/chunks`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(chunksRes2.body.total).toBe(count1);

    // version 2 isolation
    const v2 = await request(server())
      .post(`/api/v1/spaces/${spA.body.id}/documents/${docId}/versions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('# V2\n\nversion two content only', 'utf8'), {
        filename: 'v2.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    const version2 = v2.body.currentVersionId as string;
    await processor.process({ documentId: docId, documentVersionId: version2 });
    const v2Chunks = await knowledgeChunkRepository.listByVersion(version2);
    const v1Chunks = await knowledgeChunkRepository.listByVersion(versionId);
    expect(v2Chunks.every((c) => c.documentVersionId === version2)).toBe(true);
    expect(v1Chunks.every((c) => c.documentVersionId === versionId)).toBe(true);
    expect(v1Chunks.length).toBe(count1);

    // tenant isolation
    const wsB = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'WS B', slug: `ws-h-b-${suffix}` })
      .expect(201);
    await request(server())
      .get(`/api/v1/documents/${docId}/chunks`)
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
  }, 90_000);
});
