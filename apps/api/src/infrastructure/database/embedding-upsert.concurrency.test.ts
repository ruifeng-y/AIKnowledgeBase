import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { embeddingRecordRepository, knowledgeChunkRepository, prisma } from '@akb/db';
import { DocumentProcessingService } from '../../../../worker/src/services/document-processing.service';
import { WorkerMinioObjectStorage } from '../../../../worker/src/api-storage/worker-minio-storage';
import { EmbeddingService } from '../../../../worker/src/embedding/embedding.service';
import { DEFAULT_EMBEDDING_CONFIG, MockEmbeddingProvider } from '@akb/ai';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { APP_CONFIG } from '../../common/config/app-config';
import { VECTOR_SEARCH_SERVICE_TEST_CONFIG } from '../../modules/retrieval/vector-search.test.config';

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
const embedConfig = { ...DEFAULT_EMBEDDING_CONFIG, dimension: 384, batchSize: 32 };
const mockProvider = new MockEmbeddingProvider(embedConfig);

describe('P1-A embedding concurrency hardening (real PostgreSQL)', () => {
  let app: INestApplication;
  let processor: DocumentProcessingService;
  let chunkId: string;
  let token: string;

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
    processor = new DocumentProcessingService(
      new WorkerMinioObjectStorage({
        endPoint: 'http://127.0.0.1:9000',
        accessKey: 'minioadmin',
        secretKey: 'change_me',
        bucket: 'ai-knowledge-base',
      }),
      undefined,
      undefined,
      new EmbeddingService(mockProvider, embedConfig),
    );

    const server = app.getHttpServer();
    const reg = await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: `p1a-${suffix}@example.com`,
        password: 'password123',
        name: 'P1A',
      })
      .expect(201);
    token = reg.body.tokens.accessToken as string;
    const ws = await request(server)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P1A WS', slug: `p1a-ws-${suffix}` })
      .expect(201);
    const sp = await request(server)
      .post(`/api/v1/workspaces/${ws.body.id}/spaces`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'P1A SP', slug: `p1a-sp-${suffix}` })
      .expect(201);
    const up = await request(server)
      .post(`/api/v1/spaces/${sp.body.id}/documents/upload`)
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'P1A')
      .attach('file', Buffer.from('JWT authentication concurrency fixture', 'utf8'), {
        filename: 'p1a.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    await processor.process({
      documentId: up.body.id as string,
      documentVersionId: up.body.currentVersionId as string,
    });
    const chunks = await knowledgeChunkRepository.listByVersion(up.body.currentVersionId as string);
    expect(chunks.length).toBeGreaterThan(0);
    chunkId = chunks[0]!.id;
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('10 concurrent upserts same identity → exactly 1 row', async () => {
    const vector = new Array(embedConfig.dimension).fill(0.1);
    const writes = Array.from({ length: 10 }, () =>
      embeddingRecordRepository.upsertForChunk({
        chunkId,
        provider: embedConfig.provider,
        model: 'mock-embedding-v1',
        dimension: embedConfig.dimension,
        vector,
      }),
    );
    const results = await Promise.all(writes);
    expect(results).toHaveLength(10);
    const count = await embeddingRecordRepository.countByIdentity(
      chunkId,
      embedConfig.provider,
      'mock-embedding-v1',
      embedConfig.dimension,
    );
    expect(count).toBe(1);
  }, 30_000);

  it('10 concurrent re-embeddings same identity → still 1 row', async () => {
    const writes = Array.from({ length: 10 }, (_, i) =>
      embeddingRecordRepository.upsertForChunk({
        chunkId,
        provider: embedConfig.provider,
        model: 'mock-embedding-v1',
        dimension: embedConfig.dimension,
        vector: new Array(embedConfig.dimension).fill(0.2 + i * 0.001),
      }),
    );
    await Promise.all(writes);
    const count = await embeddingRecordRepository.countByIdentity(
      chunkId,
      embedConfig.provider,
      'mock-embedding-v1',
      embedConfig.dimension,
    );
    expect(count).toBe(1);
  }, 30_000);

  it('different identities coexist (model + dimension)', async () => {
    await embeddingRecordRepository.upsertForChunk({
      chunkId,
      provider: 'p1-provider',
      model: 'm1',
      dimension: 384,
      vector: new Array(384).fill(0.05),
    });
    await embeddingRecordRepository.upsertForChunk({
      chunkId,
      provider: 'p1-provider',
      model: 'm2',
      dimension: 384,
      vector: new Array(384).fill(0.06),
    });
    await embeddingRecordRepository.upsertForChunk({
      chunkId,
      provider: 'p1-provider',
      model: 'm1',
      dimension: 768,
      vector: new Array(768).fill(0.07),
    });
    expect(await embeddingRecordRepository.countByIdentity(chunkId, 'p1-provider', 'm1', 384)).toBe(
      1,
    );
    expect(await embeddingRecordRepository.countByIdentity(chunkId, 'p1-provider', 'm2', 384)).toBe(
      1,
    );
    expect(await embeddingRecordRepository.countByIdentity(chunkId, 'p1-provider', 'm1', 768)).toBe(
      1,
    );
  }, 30_000);

  it('sequential re-embed is idempotent (1 row)', async () => {
    for (let i = 0; i < 3; i += 1) {
      await embeddingRecordRepository.upsertForChunk({
        chunkId,
        provider: 'idem',
        model: 'idem-model',
        dimension: 8,
        vector: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      });
    }
    expect(await embeddingRecordRepository.countByIdentity(chunkId, 'idem', 'idem-model', 8)).toBe(
      1,
    );
  });

  it('concurrent mixed identities → 3 rows, no merge', async () => {
    await Promise.all([
      embeddingRecordRepository.upsertForChunk({
        chunkId,
        provider: 'mix',
        model: 'a',
        dimension: 16,
        vector: new Array(16).fill(0.1),
      }),
      embeddingRecordRepository.upsertForChunk({
        chunkId,
        provider: 'mix',
        model: 'b',
        dimension: 16,
        vector: new Array(16).fill(0.2),
      }),
      embeddingRecordRepository.upsertForChunk({
        chunkId,
        provider: 'mix',
        model: 'a',
        dimension: 32,
        vector: new Array(32).fill(0.3),
      }),
    ]);
    expect(await embeddingRecordRepository.countByIdentity(chunkId, 'mix', 'a', 16)).toBe(1);
    expect(await embeddingRecordRepository.countByIdentity(chunkId, 'mix', 'b', 16)).toBe(1);
    expect(await embeddingRecordRepository.countByIdentity(chunkId, 'mix', 'a', 32)).toBe(1);
  });

  it('unique constraint exists in PostgreSQL metadata', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'embedding_records'
        AND indexname = 'embedding_records_chunk_id_provider_model_dimensions_key'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0]!.indexdef).toContain('UNIQUE');
    expect(rows[0]!.indexdef).toContain('chunk_id');
    expect(rows[0]!.indexdef).toContain('dimensions');
  });
});
