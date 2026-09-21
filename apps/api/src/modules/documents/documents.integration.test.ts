import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { APP_CONFIG } from '../../common/config/app-config';
import { MinioObjectStorage } from '../../infrastructure/storage/minio-object-storage';
import { OBJECT_STORAGE } from '../../infrastructure/storage/object-storage.port';

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
      jwtSecret: process.env['JWT_SECRET'] ?? 'test-secret-v04f',
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

describe('V0.4-F Document + MinIO integration', () => {
  let app: INestApplication;

  const userA = { email: `doc-a-${suffix}@example.com`, password: 'password123', name: 'Doc A' };
  const userB = { email: `doc-b-${suffix}@example.com`, password: 'password123', name: 'Doc B' };

  let tokenA = '';
  let tokenB = '';
  let wsA = '';
  let wsB = '';
  let spaceA = '';
  let spaceB = '';
  let docA = '';
  let docB = '';
  let uploadedDoc = '';
  let uploadedKey = '';

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
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('covers document CRUD, upload/download/delete, versions, and tenant isolation', async () => {
    const server = () => app.getHttpServer();

    const regA = await request(server()).post('/api/v1/auth/register').send(userA).expect(201);
    const regB = await request(server()).post('/api/v1/auth/register').send(userB).expect(201);
    tokenA = regA.body.tokens.accessToken as string;
    tokenB = regB.body.tokens.accessToken as string;

    wsA = (
      await request(server())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'WS A', slug: `ws-a-${suffix}` })
        .expect(201)
    ).body.id as string;
    wsB = (
      await request(server())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'WS B', slug: `ws-b-${suffix}` })
        .expect(201)
    ).body.id as string;
    spaceA = (
      await request(server())
        .post(`/api/v1/workspaces/${wsA}/spaces`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Space A', slug: `space-a-${suffix}` })
        .expect(201)
    ).body.id as string;
    spaceB = (
      await request(server())
        .post(`/api/v1/workspaces/${wsB}/spaces`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Space B', slug: `space-b-${suffix}` })
        .expect(201)
    ).body.id as string;

    // create metadata-only documents
    docA = (
      await request(server())
        .post(`/api/v1/spaces/${spaceA}/documents`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Architecture notes' })
        .expect(201)
    ).body.id as string;

    // metadata-only document has no stored content
    const metaOnly = await request(server())
      .get(`/api/v1/documents/${docA}/content`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    expect(metaOnly.body.error.code).toBe('DOCUMENT_CONTENT_NOT_FOUND');

    docB = (
      await request(server())
        .post(`/api/v1/spaces/${spaceB}/documents`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'B notes' })
        .expect(201)
    ).body.id as string;

    // list/get own
    await request(server())
      .get(`/api/v1/spaces/${spaceA}/documents`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(server())
      .get(`/api/v1/documents/${docA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    // update
    await request(server())
      .patch(`/api/v1/documents/${docA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Architecture notes v2', description: 'desc' })
      .expect(200);

    // upload file to space A
    const content = `hello-minio-${suffix}`;
    const uploadRes = await request(server())
      .post(`/api/v1/spaces/${spaceA}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .field('title', 'Uploaded note')
      .attach('file', Buffer.from(content, 'utf8'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    uploadedDoc = uploadRes.body.id as string;
    uploadedKey = uploadRes.body.metadata?.storageKey as string;
    expect(uploadRes.body.status).toBe('READY');
    expect(uploadedKey).toContain('documents/');

    // MinIO real object exists
    const storage = app.get(OBJECT_STORAGE) as MinioObjectStorage;
    await expect(storage.exists(uploadedKey)).resolves.toBe(true);
    const raw = await storage.get(uploadedKey);
    expect(raw.toString('utf8')).toBe(content);

    // download
    const dl = await request(server())
      .get(`/api/v1/documents/${uploadedDoc}/content`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(dl.text).toBe(content);
    expect(dl.headers['content-disposition']).toContain('filename=');

    // version 2
    const v2 = `hello-minio-v2-${suffix}`;
    const verRes = await request(server())
      .post(`/api/v1/spaces/${spaceA}/documents/${uploadedDoc}/versions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from(v2, 'utf8'), {
        filename: 'note-v2.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    expect(verRes.body.status).toBe('READY');
    const dl2 = await request(server())
      .get(`/api/v1/documents/${uploadedDoc}/content`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(dl2.text).toBe(v2);

    // object missing from storage → 404 DOCUMENT_CONTENT_NOT_FOUND
    const orphanUpload = await request(server())
      .post(`/api/v1/spaces/${spaceA}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .field('title', 'Orphan object')
      .attach('file', Buffer.from('orphan-content', 'utf8'), {
        filename: 'orphan.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    const orphanKey = String(orphanUpload.body.metadata?.storageKey ?? '');
    await storage.delete(orphanKey);
    const missingObj = await request(server())
      .get(`/api/v1/documents/${orphanUpload.body.id}/content`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    expect(missingObj.body.error.code).toBe('DOCUMENT_CONTENT_NOT_FOUND');

    // missing file
    await request(server())
      .post(`/api/v1/spaces/${spaceA}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(400);

    // unsupported mime
    await request(server())
      .post(`/api/v1/spaces/${spaceA}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('x'), {
        filename: 'x.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(400);

    // unsafe filename still uploads with sanitized name in metadata
    const unsafe = await request(server())
      .post(`/api/v1/spaces/${spaceA}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('safe-content', 'utf8'), {
        filename: '../../evil.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    expect(unsafe.body.metadata.originalFilename).toBe('evil.txt');
    expect(String(unsafe.body.metadata.storageKey)).not.toContain('..');

    // tenant matrix
    const expect404 = async (method: string, path: string, token: string) => {
      const res = await request(server()).get(path).set('Authorization', `Bearer ${token}`);
      expect(method).toBe('get');
      expect(res.status).toBe(404);
    };

    await expect404('get', `/api/v1/documents/${docB}`, tokenA);
    await expect404('get', `/api/v1/documents/${docA}`, tokenB);
    await expect404('get', `/api/v1/spaces/${spaceB}/documents`, tokenA);
    await expect404('get', `/api/v1/spaces/${spaceA}/documents`, tokenB);
    await request(server())
      .post(`/api/v1/spaces/${spaceB}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('x', 'utf8'), { filename: 'x.txt', contentType: 'text/plain' })
      .expect(404);
    await request(server())
      .patch(`/api/v1/documents/${docB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'hacked' })
      .expect(404);
    await request(server())
      .delete(`/api/v1/documents/${docB}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await request(server())
      .get(`/api/v1/documents/${docB}/content`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await request(server())
      .patch(`/api/v1/documents/${docA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'hacked' })
      .expect(404);
    await request(server())
      .delete(`/api/v1/documents/${docA}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(server())
      .get(`/api/v1/documents/${docA}/content`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    // delete uploaded doc removes storage object
    const unsafeDocId = unsafe.body.id as string;
    const keys = [uploadedKey, String(unsafe.body.metadata.storageKey ?? '')].filter(Boolean);
    await request(server())
      .delete(`/api/v1/documents/${uploadedDoc}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(server())
      .delete(`/api/v1/documents/${unsafeDocId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    for (const key of keys) {
      await expect(storage.exists(key)).resolves.toBe(false);
    }

    // cleanup remaining
    await request(server())
      .delete(`/api/v1/documents/${docA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(server())
      .delete(`/api/v1/workspaces/${wsA}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(server())
      .delete(`/api/v1/workspaces/${wsB}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
  }, 90_000);
});
