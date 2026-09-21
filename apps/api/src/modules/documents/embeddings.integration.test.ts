import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_EMBEDDING_CONFIG, MockEmbeddingProvider } from '@akb/ai';
import { embeddingRecordRepository, knowledgeChunkRepository } from '@akb/db';
import { AppModule } from '../../app.module';
import { APP_CONFIG } from '../../common/config/app-config';
import { DocumentProcessingService } from '../../../../worker/src/services/document-processing.service';
import { WorkerMinioObjectStorage } from '../../../../worker/src/api-storage/worker-minio-storage';
import { EmbeddingService } from '../../../../worker/src/embedding/embedding.service';

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
      jwtSecret: process.env['JWT_SECRET'] ?? 'test-secret-v04i',
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
      embeddingModel: 'mock-embedding-v1',
      embeddingDimensions: 384,
      rerankerProvider: 'mock',
      rerankerModel: 'mock-reranker',
    },
    queue: { defaultQueue: 'akb-default' },
    logging: { level: 'error' },
  };
}

const embedConfig = { ...DEFAULT_EMBEDDING_CONFIG, dimension: 384, batchSize: 32 };

describe('V0.4-I Embedding foundation integration', () => {
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

  it('uploads, embeds, idempotent re-embed, multi-model, version isolation, tenant 404', async () => {
    const server = () => app.getHttpServer();
    const userA = { email: `i-a-${suffix}@example.com`, password: 'password123', name: 'I A' };
    const userB = { email: `i-b-${suffix}@example.com`, password: 'password123', name: 'I B' };

    const regA = await request(server()).post('/api/v1/auth/register').send(userA).expect(201);
    const regB = await request(server()).post('/api/v1/auth/register').send(userB).expect(201);
    const tokenA = regA.body.tokens.accessToken as string;
    const tokenB = regB.body.tokens.accessToken as string;

    const wsA = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'WS A', slug: `ws-i-a-${suffix}` })
      .expect(201);
    const spA = await request(server())
      .post(`/api/v1/workspaces/${wsA.body.id}/spaces`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Space A', slug: `space-i-a-${suffix}` })
      .expect(201);

    const md = [
      '# Title',
      '',
      'embedding target content here',
      '',
      '## More',
      '',
      'more text',
    ].join('\n');
    const up1 = await request(server())
      .post(`/api/v1/spaces/${spA.body.id}/documents/upload`)
      .set('Authorization', `Bearer ${tokenA}`)
      .field('title', 'Embed doc')
      .attach('file', Buffer.from(md, 'utf8'), {
        filename: 'emb.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    const docId = up1.body.id as string;
    const version1 = up1.body.currentVersionId as string;

    await processor.process({ documentId: docId, documentVersionId: version1 });
    const chunksV1 = await knowledgeChunkRepository.listByVersion(version1);
    expect(chunksV1.length).toBeGreaterThan(0);
    const count1 = await embeddingRecordRepository.countByVersionId(version1);
    expect(count1).toBe(chunksV1.length);

    // idempotent re-process: same version, no embedding explosion
    await processor.process({ documentId: docId, documentVersionId: version1 });
    const chunksV1b = await knowledgeChunkRepository.listByVersion(version1);
    const count2 = await embeddingRecordRepository.countByVersionId(version1);
    expect(count2).toBe(chunksV1b.length);
    expect(chunksV1b.length).toBe(chunksV1.length);

    const currentChunk = chunksV1b[0]!;
    const models1 = await embeddingRecordRepository.listByChunkId(currentChunk.id);
    expect(
      models1.filter((m) => m.model === embedConfig.model && m.provider === embedConfig.provider),
    ).toHaveLength(1);

    // multi-model coexistence
    const modelB = { ...embedConfig, model: 'mock-embedding-v1-b', provider: 'mock' };
    const serviceB = new EmbeddingService(new MockEmbeddingProvider(modelB), modelB);
    await serviceB.embedDocumentVersion({ documentId: docId, documentVersionId: version1 });
    const models2 = await embeddingRecordRepository.listByChunkId(currentChunk.id);
    expect(models2.filter((m) => m.model === modelB.model)).toHaveLength(1);
    expect(models2.length).toBeGreaterThanOrEqual(2);

    // version 2 isolation
    const up2 = await request(server())
      .post(`/api/v1/spaces/${spA.body.id}/documents/${docId}/versions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .attach('file', Buffer.from('v2 embedding content only', 'utf8'), {
        filename: 'v2.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    const version2 = up2.body.currentVersionId as string;
    await processor.process({ documentId: docId, documentVersionId: version2 });
    const v2Chunks = await knowledgeChunkRepository.listByVersion(version2);
    const v2Embeddings = await embeddingRecordRepository.countByVersionId(version2);
    expect(v2Embeddings).toBeGreaterThanOrEqual(v2Chunks.length);
    const v1Still = await embeddingRecordRepository.countByVersionId(version1);
    expect(v1Still).toBeGreaterThan(0);
    // V1 embeddings still belong to V1 chunks
    const v1ChunksAfter = await knowledgeChunkRepository.listByVersion(version1);
    expect(v1ChunksAfter.every((c) => c.documentVersionId === version1)).toBe(true);

    // tenant isolation: B cannot process/access A's document
    const statusB = await request(server())
      .get(`/api/v1/documents/${docId}/chunks`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    await request(server())
      .delete(`/api/v1/workspaces/${wsA.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const regOther = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'WS B', slug: `ws-i-b-${suffix}` })
      .expect(201);
    await request(server())
      .delete(`/api/v1/workspaces/${regOther.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(statusB.status).toBe(404);
  }, 90_000);
});
