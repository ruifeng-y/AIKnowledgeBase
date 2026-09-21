import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_EMBEDDING_CONFIG, MockEmbeddingProvider } from '@akb/ai';
import { AppModule } from '../../app.module';
import { APP_CONFIG } from '../../common/config/app-config';
import { DocumentProcessingService } from '../../../../worker/src/services/document-processing.service';
import { WorkerMinioObjectStorage } from '../../../../worker/src/api-storage/worker-minio-storage';
import { EmbeddingService } from '../../../../worker/src/embedding/embedding.service';
import { VECTOR_SEARCH_SERVICE_TEST_CONFIG } from './vector-search.test.config';

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;

describe('V0.4-J Vector Retrieval integration', () => {
  let app: INestApplication;
  let processor: DocumentProcessingService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(VECTOR_SEARCH_SERVICE_TEST_CONFIG)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    const embedConfig = { ...DEFAULT_EMBEDDING_CONFIG, dimension: 384, batchSize: 32 };
    const embedding = new EmbeddingService(new MockEmbeddingProvider(embedConfig), embedConfig);
    processor = new DocumentProcessingService(
      new WorkerMinioObjectStorage({
        endPoint: 'http://127.0.0.1:9000',
        accessKey: 'minioadmin',
        secretKey: 'change_me',
        bucket: 'ai-knowledge-base',
      }),
      undefined,
      undefined,
      embedding,
    );
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('searches current version with cosine scores and tenant isolation', async () => {
    const server = () => app.getHttpServer();
    const userA = { email: `j-a-${suffix}@example.com`, password: 'password123', name: 'J A' };
    const userB = { email: `j-b-${suffix}@example.com`, password: 'password123', name: 'J B' };
    const regA = await request(server()).post('/api/v1/auth/register').send(userA).expect(201);
    const regB = await request(server()).post('/api/v1/auth/register').send(userB).expect(201);
    const tokenA = regA.body.tokens.accessToken as string;
    const tokenB = regB.body.tokens.accessToken as string;

    const wsA = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'WS A', slug: `ws-j-a-${suffix}` })
      .expect(201);
    const wsB = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'WS B', slug: `ws-j-b-${suffix}` })
      .expect(201);
    const spA = await request(server())
      .post(`/api/v1/workspaces/${wsA.body.id}/spaces`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Space A', slug: `space-j-a-${suffix}` })
      .expect(201);
    const spB = await request(server())
      .post(`/api/v1/workspaces/${wsB.body.id}/spaces`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Space B', slug: `space-j-b-${suffix}` })
      .expect(201);
    const spaceA = spA.body.id as string;
    const spaceB = spB.body.id as string;

    const mdA =
      '# JWT\n\nJWT authentication token content here.\n\n## Other\n\nunrelated topic words';
    const upA = await request(server())
      .post(`/api/v1/spaces/${spaceA}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .field('title', 'Auth doc')
      .attach('file', Buffer.from(mdA, 'utf8'), {
        filename: 'auth.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    const upB = await request(server())
      .post(`/api/v1/spaces/${spaceB}/documents/upload`)
      .set('Authorization', `Bearer ${tokenB}`)
      .field('title', 'B doc')
      .attach('file', Buffer.from('space b unique embedding content only', 'utf8'), {
        filename: 'b.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    await processor.process({
      documentId: upA.body.id as string,
      documentVersionId: upA.body.currentVersionId as string,
    });
    await processor.process({
      documentId: upB.body.id as string,
      documentVersionId: upB.body.currentVersionId as string,
    });

    const searchOk = await request(server())
      .post(`/api/v1/spaces/${spaceA}/search/vector`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ query: 'JWT authentication', topK: 10 })
      .expect(200);
    expect(searchOk.body.knowledgeSpaceId).toBe(spaceA);
    expect(searchOk.body.topK).toBe(10);
    expect(searchOk.body.threshold).toBe(0.3);
    expect(searchOk.body.total).toBeLessThanOrEqual(10);
    for (const item of searchOk.body.items) {
      expect(item.knowledgeSpaceId).toBe(spaceA);
      expect(item.score).toBeGreaterThanOrEqual(0.3);
    }
    // scores DESC, chunkId ASC
    for (let i = 1; i < searchOk.body.items.length; i += 1) {
      const prev = searchOk.body.items[i - 1];
      const cur = searchOk.body.items[i];
      expect(prev.score >= cur.score).toBe(true);
      if (prev.score === cur.score) {
        expect(prev.chunkId.localeCompare(cur.chunkId)).toBeLessThanOrEqual(0);
      }
    }

    // validation
    await request(server())
      .post(`/api/v1/spaces/${spaceA}/search/vector`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ query: '   ' })
      .expect(400);
    await request(server())
      .post(`/api/v1/spaces/${spaceA}/search/vector`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ query: 'x', topK: 51 })
      .expect(400);
    await request(server())
      .post(`/api/v1/spaces/${spaceA}/search/vector`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ query: 'x', threshold: 2 })
      .expect(400);

    // cross-tenant
    await request(server())
      .post(`/api/v1/spaces/${spaceA}/search/vector`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ query: 'JWT authentication' })
      .expect(404);
    await request(server())
      .post(`/api/v1/spaces/${spaceB}/search/vector`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ query: 'anything' })
      .expect(404);

    // foreign versionId
    await request(server())
      .post(`/api/v1/spaces/${spaceA}/search/vector`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ query: 'JWT', versionId: '00000000-0000-0000-0000-000000000001' })
      .expect(404);

    // empty result still 200
    const empty = await request(server())
      .post(`/api/v1/spaces/${spaceB}/search/vector`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ query: 'no embeddings for this random zzzz', threshold: 0.99 })
      .expect(200);
    expect(empty.body.total).toBe(0);
    expect(Array.isArray(empty.body.items)).toBe(true);

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
