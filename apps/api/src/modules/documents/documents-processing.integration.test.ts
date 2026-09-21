import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { APP_CONFIG } from '../../common/config/app-config';
import { DocumentProcessingService } from '../../../../worker/src/services/document-processing.service';
import { WorkerMinioObjectStorage } from '../../../../worker/src/api-storage/worker-minio-storage';
import { OBJECT_STORAGE } from '../../infrastructure/storage/object-storage.port';
import type { ObjectStoragePort } from '../../infrastructure/storage/object-storage.port';

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;

function testConfig() {
  return {
    app: {
      nodeEnv: 'test',
      port: 0,
      apiPrefix: 'api/v1',
      corsOrigins: ['http://localhost:3000'],
    },
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
      jwtSecret: process.env['JWT_SECRET'] ?? 'test-secret-v04g',
      accessTokenTtl: '15m',
      refreshTokenTtl: '7d',
    },
    documents: {
      maxFileSizeBytes: 1024 * 1024,
      allowedMimeTypes: [
        'text/plain',
        'text/markdown',
        'application/json',
        'application/pdf',
        'text/html',
      ],
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

describe('V0.4-G Document Processing integration', () => {
  let app: INestApplication;
  let processor: DocumentProcessingService;

  const userA = { email: `g-a-${suffix}@example.com`, password: 'password123', name: 'G A' };
  const userB = { email: `g-b-${suffix}@example.com`, password: 'password123', name: 'G B' };

  let tokenA = '';
  let tokenB = '';
  let spaceA = '';
  let spaceB = '';
  let docA = '';
  let docB = '';

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

    const cfg = testConfig();
    const minioOptions = {
      endPoint: cfg.storage.endpoint,
      accessKey: cfg.storage.accessKeyId,
      secretKey: cfg.storage.secretAccessKey,
      bucket: cfg.storage.bucket,
    };
    const apiStorage = app.get(OBJECT_STORAGE) as ObjectStoragePort;
    processor = new DocumentProcessingService(new WorkerMinioObjectStorage(minioOptions));
    void apiStorage;
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('upload → process → sections → ready; reprocess idempotent; tenant isolation', async () => {
    const server = () => app.getHttpServer();
    const regA = await request(server()).post('/api/v1/auth/register').send(userA).expect(201);
    const regB = await request(server()).post('/api/v1/auth/register').send(userB).expect(201);
    tokenA = regA.body.tokens.accessToken as string;
    tokenB = regB.body.tokens.accessToken as string;

    const wsA = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'WS A', slug: `ws-g-a-${suffix}` })
      .expect(201);
    const wsB = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'WS B', slug: `ws-g-b-${suffix}` })
      .expect(201);
    spaceA = (
      await request(server())
        .post(`/api/v1/workspaces/${wsA.body.id}/spaces`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Space A', slug: `space-g-a-${suffix}` })
        .expect(201)
    ).body.id as string;
    spaceB = (
      await request(server())
        .post(`/api/v1/workspaces/${wsB.body.id}/spaces`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Space B', slug: `space-g-b-${suffix}` })
        .expect(201)
    ).body.id as string;

    const uploadA = await request(server())
      .post(`/api/v1/spaces/${spaceA}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .field('title', 'Process me')
      .attach('file', Buffer.from('# Title\n\nbody content here\n\n## Sec\n\nmore', 'utf8'), {
        filename: 'note.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    docA = uploadA.body.id as string;
    expect(uploadA.body.status).toBe('PENDING');

    const status1 = await request(server())
      .get(`/api/v1/documents/${docA}/processing`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(status1.body.documentId).toBe(docA);

    await processor.process({
      documentId: docA,
      documentVersionId: uploadA.body.currentVersionId as string,
    });

    const status2 = await request(server())
      .get(`/api/v1/documents/${docA}/processing`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(status2.body.documentStatus).toBe('READY');

    // idempotent reprocess
    await processor.process({
      documentId: docA,
      documentVersionId: uploadA.body.currentVersionId as string,
    });
    const status3 = await request(server())
      .get(`/api/v1/documents/${docA}/processing`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(status3.body.documentStatus).toBe('READY');

    // reprocess API
    const repro = await request(server())
      .post(`/api/v1/documents/${docA}/reprocess`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);
    expect(repro.body.documentId).toBe(docA);

    // tenant B document + isolation
    const uploadB = await request(server())
      .post(`/api/v1/spaces/${spaceB}/documents/upload`)
      .set('Authorization', `Bearer ${tokenB}`)
      .attach('file', Buffer.from('tenant b content', 'utf8'), {
        filename: 'b.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    docB = uploadB.body.id as string;

    await request(server())
      .get(`/api/v1/documents/${docB}/processing`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await request(server())
      .post(`/api/v1/documents/${docB}/reprocess`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await request(server())
      .get(`/api/v1/documents/${docA}/processing`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(server())
      .post(`/api/v1/documents/${docA}/reprocess`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    // invalid JSON → FAILED
    const bad = await request(server())
      .post(`/api/v1/spaces/${spaceA}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('{bad', 'utf8'), {
        filename: 'bad.json',
        contentType: 'application/json',
      })
      .expect(201);
    await processor.process({
      documentId: bad.body.id as string,
      documentVersionId: bad.body.currentVersionId as string,
    });
    const badStatus = await request(server())
      .get(`/api/v1/documents/${bad.body.id}/processing`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(badStatus.body.documentStatus).toBe('FAILED');
    expect(String(badStatus.body.errorCode)).toContain('DOCUMENT_PARSE_ERROR');

    // cleanup
    for (const [token, wsId] of [
      [tokenA, wsA.body.id],
      [tokenB, wsB.body.id],
    ] as const) {
      await request(server())
        .delete(`/api/v1/workspaces/${wsId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
  }, 90_000);
});
