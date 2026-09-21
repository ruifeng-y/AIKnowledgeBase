import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_EMBEDDING_CONFIG, MockEmbeddingProvider } from '@akb/ai';
import { embeddingRecordRepository, knowledgeChunkRepository, prisma } from '@akb/db';
import { AppModule } from '../../app.module';
import { APP_CONFIG } from '../../common/config/app-config';
import { DocumentProcessingService } from '../../../../worker/src/services/document-processing.service';
import { WorkerMinioObjectStorage } from '../../../../worker/src/api-storage/worker-minio-storage';
import { EmbeddingService } from '../../../../worker/src/embedding/embedding.service';
import { VECTOR_SEARCH_SERVICE_TEST_CONFIG } from './vector-search.test.config';

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
const embedConfig = { ...DEFAULT_EMBEDDING_CONFIG, dimension: 384, batchSize: 32 };
const mockProvider = new MockEmbeddingProvider(embedConfig);

describe('V0.4-J Vector Retrieval integration', () => {
  let app: INestApplication;
  let processor: DocumentProcessingService;
  const server = () => app.getHttpServer();

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
    const embedding = new EmbeddingService(mockProvider, embedConfig);
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

  async function registerUser(tag: string) {
    const email = `vs-${tag}-${suffix}@example.com`;
    const reg = await request(server())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', name: `VS ${tag}` })
      .expect(201);
    const token = reg.body.tokens.accessToken as string;
    return { email, token, userId: reg.body.user?.id as string };
  }

  async function createSpace(token: string, tag: string) {
    const ws = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `WS ${tag}`, slug: `vs-ws-${tag}-${suffix}` })
      .expect(201);
    const sp = await request(server())
      .post(`/api/v1/workspaces/${ws.body.id}/spaces`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Space ${tag}`, slug: `vs-sp-${tag}-${suffix}` })
      .expect(201);
    return { workspaceId: ws.body.id as string, spaceId: sp.body.id as string };
  }

  async function uploadFile(
    token: string,
    spaceId: string,
    filename: string,
    content: string,
    title = filename,
  ) {
    return request(server())
      .post(`/api/v1/spaces/${spaceId}/documents/upload`)
      .set('Authorization', `Bearer ${token}`)
      .field('title', title)
      .attach('file', Buffer.from(content, 'utf8'), {
        filename,
        contentType: filename.endsWith('.md') ? 'text/markdown' : 'text/plain',
      })
      .expect(201);
  }

  async function appendVersion(
    token: string,
    spaceId: string,
    documentId: string,
    content: string,
  ) {
    return request(server())
      .post(`/api/v1/spaces/${spaceId}/documents/${documentId}/versions`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(content, 'utf8'), {
        filename: 'v.md',
        contentType: 'text/markdown',
      })
      .expect(201);
  }

  async function processVersion(documentId: string, documentVersionId: string) {
    await processor.process({ documentId, documentVersionId });
  }

  function searchVector(token: string, spaceId: string, body: Record<string, unknown>) {
    return request(server())
      .post(`/api/v1/spaces/${spaceId}/search/vector`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function deleteWorkspace(token: string, workspaceId: string) {
    await request(server())
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  async function deleteEmbeddings(
    versionId: string,
    provider: string,
    model: string,
  ): Promise<number> {
    const chunks = await knowledgeChunkRepository.listByVersion(versionId);
    let deleted = 0;
    for (const chunk of chunks) {
      const result = await prisma.$executeRaw`
        DELETE FROM embedding_records
        WHERE chunk_id = ${chunk.id}::uuid
          AND provider = ${provider}
          AND model = ${model}
      `;
      deleted += result;
    }
    return deleted;
  }

  it('full pipeline: document → parse → chunk → embed → vector search API', async () => {
    const user = await registerUser('pipe');
    const { workspaceId, spaceId } = await createSpace(user.token, 'pipe');
    const content = [
      '# Auth Guide',
      '',
      'JWT authentication token explanation for enterprise knowledge base.',
      '',
      '## Details',
      '',
      'Bearer tokens protect API routes after login.',
    ].join('\n');
    const up = await uploadFile(user.token, spaceId, 'auth.md', content, 'Auth guide');
    const documentId = up.body.id as string;
    const versionId = up.body.currentVersionId as string;
    expect(up.body.status).toBe('PENDING');

    await processVersion(documentId, versionId);
    const chunks = await knowledgeChunkRepository.listByVersion(versionId);
    expect(chunks.length).toBeGreaterThan(0);
    const embCount = await embeddingRecordRepository.countByVersionId(versionId);
    expect(embCount).toBeGreaterThanOrEqual(chunks.length);

    // Mock embeddings are not semantic; use threshold -1 to assert scoped DB hits.
    const res = await searchVector(user.token, spaceId, {
      query: 'JWT authentication',
      topK: 10,
      threshold: -1,
    }).expect(200);

    expect(res.body.knowledgeSpaceId).toBe(spaceId);
    expect(res.body.topK).toBe(10);
    expect(res.body.threshold).toBe(-1);
    expect(res.body.provider).toBe(embedConfig.provider);
    expect(res.body.model).toBe(embedConfig.model);
    expect(res.body.dimension).toBe(embedConfig.dimension);
    expect(res.body.versionId).toBeNull();
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.total).toBeLessThanOrEqual(10);
    expect(res.body.total).toBe(res.body.items.length);

    for (const item of res.body.items) {
      expect(item.knowledgeSpaceId).toBe(spaceId);
      expect(item.documentId).toBe(documentId);
      expect(item.documentVersionId).toBe(versionId);
      expect(item.score).toBeGreaterThanOrEqual(-1);
      expect(item.embedding.provider).toBe(embedConfig.provider);
      expect(item.embedding.model).toBe(embedConfig.model);
      expect(item.embedding.dimension).toBe(embedConfig.dimension);
    }

    for (let i = 1; i < res.body.items.length; i += 1) {
      const prev = res.body.items[i - 1];
      const cur = res.body.items[i];
      expect(prev.score >= cur.score).toBe(true);
      if (prev.score === cur.score) {
        expect(prev.chunkId.localeCompare(cur.chunkId)).toBeLessThanOrEqual(0);
      }
    }

    // Exact chunk text → deterministic mock identity → score ≈ 1
    const chunkText = chunks[0]!.content;
    const exact = await searchVector(user.token, spaceId, {
      query: chunkText,
      topK: 5,
      threshold: 0.99,
    }).expect(200);
    expect(exact.body.total).toBeGreaterThan(0);
    expect(exact.body.items[0].score).toBeGreaterThan(0.99);

    // Default threshold contract still applies
    const defaults = await searchVector(user.token, spaceId, {
      query: 'JWT authentication',
    }).expect(200);
    expect(defaults.body.threshold).toBe(0.3);
    expect(defaults.body.topK).toBe(10);
    for (const item of defaults.body.items) {
      expect(item.score).toBeGreaterThanOrEqual(0.3);
    }

    await deleteWorkspace(user.token, workspaceId);
  }, 90_000);

  it('validation matrix: query / topK / threshold bounds', async () => {
    const user = await registerUser('val');
    const { workspaceId, spaceId } = await createSpace(user.token, 'val');
    const up = await uploadFile(user.token, spaceId, 'v.txt', 'validation content jwt');
    await processVersion(up.body.id as string, up.body.currentVersionId as string);

    const cases: Array<{ body: Record<string, unknown>; status: number }> = [
      { body: { query: '' }, status: 400 },
      { body: { query: '   ' }, status: 400 },
      { body: { query: '\n\t ' }, status: 400 },
      { body: { query: 'jwt', topK: 0 }, status: 400 },
      { body: { query: 'jwt', topK: 51 }, status: 400 },
      { body: { query: 'jwt', topK: -1 }, status: 400 },
      { body: { query: 'jwt', threshold: -1.1 }, status: 400 },
      { body: { query: 'jwt', threshold: 1.1 }, status: 400 },
      { body: { query: 'jwt', topK: 1 }, status: 200 },
      { body: { query: 'jwt', topK: 50 }, status: 200 },
      { body: { query: 'jwt', threshold: -1 }, status: 200 },
      { body: { query: 'jwt', threshold: 0 }, status: 200 },
      { body: { query: 'jwt', threshold: 1 }, status: 200 },
    ];
    for (const c of cases) {
      const res = await searchVector(user.token, spaceId, c.body);
      expect(res.status, JSON.stringify(c.body)).toBe(c.status);
    }

    const defaultRes = await searchVector(user.token, spaceId, { query: 'jwt' }).expect(200);
    expect(defaultRes.body.topK).toBe(10);
    expect(defaultRes.body.threshold).toBe(0.3);

    const one = await searchVector(user.token, spaceId, {
      query: 'jwt',
      topK: 1,
      threshold: -1,
    }).expect(200);
    expect(one.body.topK).toBe(1);
    expect(one.body.total).toBeLessThanOrEqual(1);
    expect(one.body.items.length).toBeLessThanOrEqual(1);

    const many = await searchVector(user.token, spaceId, {
      query: 'jwt',
      topK: 50,
      threshold: -1,
    }).expect(200);
    expect(many.body.topK).toBe(50);
    expect(many.body.total).toBeLessThanOrEqual(50);

    const th0 = await searchVector(user.token, spaceId, {
      query: 'jwt',
      threshold: -1,
    }).expect(200);
    expect(th0.body.threshold).toBe(-1);
    expect(th0.body.total).toBeGreaterThan(0);
    for (const item of th0.body.items) {
      expect(item.score).toBeGreaterThanOrEqual(-1);
    }

    const th1 = await searchVector(user.token, spaceId, {
      query: 'jwt',
      threshold: 1,
    }).expect(200);
    expect(th1.body.threshold).toBe(1);
    for (const item of th1.body.items) {
      expect(item.score).toBeGreaterThanOrEqual(1);
    }

    await deleteWorkspace(user.token, workspaceId);
  }, 90_000);

  it('version scope: currentVersion default, explicit versionId, foreign 404, stale isolation', async () => {
    const user = await registerUser('ver');
    const { workspaceId, spaceId } = await createSpace(user.token, 'ver');
    const v1Content = '# V1\n\nJWT authentication alpha secret content v1';
    const v2Content = '# V2\n\nCompletely different beta product notes v2';

    const up1 = await uploadFile(user.token, spaceId, 'doc.md', v1Content, 'Versioned doc');
    const docId = up1.body.id as string;
    const version1 = up1.body.currentVersionId as string;
    await processVersion(docId, version1);

    const searchV1Default = await searchVector(user.token, spaceId, {
      query: 'JWT authentication alpha',
      threshold: -1,
    }).expect(200);
    expect(searchV1Default.body.total).toBeGreaterThan(0);
    for (const item of searchV1Default.body.items) {
      expect(item.documentVersionId).toBe(version1);
    }

    const up2 = await appendVersion(user.token, spaceId, docId, v2Content);
    const version2 = up2.body.currentVersionId as string;
    expect(version2).not.toBe(version1);
    await processVersion(docId, version2);

    const v1Emb = await embeddingRecordRepository.countByVersionId(version1);
    expect(v1Emb).toBeGreaterThan(0);

    const searchCurrent = await searchVector(user.token, spaceId, {
      query: 'JWT authentication alpha',
      threshold: -1,
    }).expect(200);
    expect(searchCurrent.body.total).toBeGreaterThan(0);
    for (const item of searchCurrent.body.items) {
      expect(item.documentVersionId).toBe(version2);
      expect(item.documentVersionId).not.toBe(version1);
    }

    const searchExplicitV1 = await searchVector(user.token, spaceId, {
      query: 'JWT authentication alpha',
      versionId: version1,
      threshold: -1,
    }).expect(200);
    expect(searchExplicitV1.body.versionId).toBe(version1);
    expect(searchExplicitV1.body.total).toBeGreaterThan(0);
    for (const item of searchExplicitV1.body.items) {
      expect(item.documentVersionId).toBe(version1);
    }

    const searchExplicitV2 = await searchVector(user.token, spaceId, {
      query: 'beta product notes',
      versionId: version2,
      threshold: -1,
    }).expect(200);
    expect(searchExplicitV2.body.versionId).toBe(version2);
    for (const item of searchExplicitV2.body.items) {
      expect(item.documentVersionId).toBe(version2);
    }

    // exact v1 text with high threshold against explicit v1
    const v1Exact = await searchVector(user.token, spaceId, {
      query: 'JWT authentication alpha secret content v1',
      versionId: version1,
      threshold: 0.99,
    }).expect(200);
    expect(v1Exact.body.total).toBeGreaterThan(0);

    await searchVector(user.token, spaceId, {
      query: 'jwt',
      versionId: '00000000-0000-0000-0000-000000000001',
    }).expect(404);

    await deleteWorkspace(user.token, workspaceId);
  }, 90_000);

  it('tenant isolation: cross-tenant 404, cross-space isolation, empty 200', async () => {
    const userA = await registerUser('iso-a');
    const userB = await registerUser('iso-b');
    const a = await createSpace(userA.token, 'iso-a');
    const b = await createSpace(userB.token, 'iso-b');
    const aSpaceB = await createSpace(userA.token, 'iso-a2');

    const upA = await uploadFile(userA.token, a.spaceId, 'a.md', 'JWT authentication only in A');
    await processVersion(upA.body.id as string, upA.body.currentVersionId as string);
    const upB = await uploadFile(
      userB.token,
      b.spaceId,
      'b.txt',
      'space b unique embedding content',
    );
    await processVersion(upB.body.id as string, upB.body.currentVersionId as string);

    const okA = await searchVector(userA.token, a.spaceId, {
      query: 'JWT authentication',
      threshold: -1,
    }).expect(200);
    expect(okA.body.total).toBeGreaterThan(0);
    for (const item of okA.body.items) {
      expect(item.knowledgeSpaceId).toBe(a.spaceId);
    }

    await searchVector(userB.token, a.spaceId, { query: 'JWT authentication' }).expect(404);
    await searchVector(userA.token, b.spaceId, { query: 'anything' }).expect(404);

    const emptySpace = await searchVector(userA.token, aSpaceB.spaceId, {
      query: 'JWT authentication',
      threshold: -1,
    }).expect(200);
    expect(emptySpace.body.total).toBe(0);
    expect(emptySpace.body.items).toEqual([]);

    const high = await searchVector(userA.token, a.spaceId, {
      query: 'zzzz no matching embeddings at all',
      threshold: 0.999,
    }).expect(200);
    expect(Array.isArray(high.body.items)).toBe(true);
    expect(high.body.total).toBeLessThanOrEqual(high.body.topK);

    await deleteWorkspace(userA.token, a.workspaceId);
    await deleteWorkspace(userA.token, aSpaceB.workspaceId);
    await deleteWorkspace(userB.token, b.workspaceId);
  }, 90_000);

  it('embedding identity: different provider/model/dimension excluded; missing embedding excluded', async () => {
    const user = await registerUser('idn');
    const { workspaceId, spaceId } = await createSpace(user.token, 'idn');
    const up = await uploadFile(
      user.token,
      spaceId,
      'idn.md',
      '# IDN\n\nJWT authentication identity content',
    );
    const documentId = up.body.id as string;
    const versionId = up.body.currentVersionId as string;
    await processVersion(documentId, versionId);

    const before = await searchVector(user.token, spaceId, {
      query: 'JWT authentication',
      threshold: -1,
    }).expect(200);
    expect(before.body.total).toBeGreaterThan(0);
    expect(before.body.provider).toBe(embedConfig.provider);
    expect(before.body.model).toBe(embedConfig.model);

    const chunks = await knowledgeChunkRepository.listByVersion(versionId);
    expect(chunks.length).toBeGreaterThan(0);
    const chunksAfter = await knowledgeChunkRepository.listByVersion(versionId);
    expect(chunksAfter.length).toBeGreaterThan(0);
    const firstAfter = chunksAfter[0]!;

    // different provider
    await embeddingRecordRepository.upsertForChunk({
      chunkId: firstAfter.id,
      provider: 'other-provider',
      model: embedConfig.model,
      dimension: embedConfig.dimension,
      vector: new Array(embedConfig.dimension).fill(0.2),
    });
    await deleteEmbeddings(versionId, embedConfig.provider, embedConfig.model);
    const afterOtherProvider = await searchVector(user.token, spaceId, {
      query: 'JWT authentication',
      threshold: -1,
    }).expect(200);
    expect(afterOtherProvider.body.total).toBe(0);

    // restore mock, then different model
    await processVersion(documentId, versionId);
    const chunksModel = await knowledgeChunkRepository.listByVersion(versionId);
    const firstModel = chunksModel[0]!;
    await embeddingRecordRepository.upsertForChunk({
      chunkId: firstModel.id,
      provider: embedConfig.provider,
      model: 'other-model',
      dimension: embedConfig.dimension,
      vector: new Array(embedConfig.dimension).fill(0.3),
    });
    await deleteEmbeddings(versionId, embedConfig.provider, embedConfig.model);
    const afterOtherModel = await searchVector(user.token, spaceId, {
      query: 'JWT authentication',
      threshold: -1,
    }).expect(200);
    expect(afterOtherModel.body.total).toBe(0);

    // restore mock, then different dimension on same provider+model
    await processVersion(documentId, versionId);
    const chunksDim = await knowledgeChunkRepository.listByVersion(versionId);
    for (const chunk of chunksDim) {
      await embeddingRecordRepository.upsertForChunk({
        chunkId: chunk.id,
        provider: embedConfig.provider,
        model: embedConfig.model,
        dimension: 768,
        vector: new Array(768).fill(0.05),
      });
    }
    const afterOtherDim = await searchVector(user.token, spaceId, {
      query: 'JWT authentication',
      threshold: -1,
    }).expect(200);
    expect(afterOtherDim.body.total).toBe(0);

    // missing embedding entirely
    await processVersion(documentId, versionId);
    const deleted = await deleteEmbeddings(versionId, embedConfig.provider, embedConfig.model);
    expect(deleted).toBeGreaterThan(0);
    const missing = await searchVector(user.token, spaceId, {
      query: 'JWT authentication',
      threshold: -1,
    }).expect(200);
    expect(missing.body.total).toBe(0);
    expect(missing.body.items).toEqual([]);

    await deleteWorkspace(user.token, workspaceId);
  }, 90_000);

  it('deleted document excluded; deterministic tie-breaking when scores equal', async () => {
    const user = await registerUser('del');
    const { workspaceId, spaceId } = await createSpace(user.token, 'del');

    const upKeep = await uploadFile(user.token, spaceId, 'keep.md', 'JWT authentication keep doc');
    const upDel = await uploadFile(user.token, spaceId, 'del.md', 'JWT authentication delete doc');
    const keepId = upKeep.body.id as string;
    const delId = upDel.body.id as string;
    const keepVer = upKeep.body.currentVersionId as string;
    const delVer = upDel.body.currentVersionId as string;
    await processVersion(keepId, keepVer);
    await processVersion(delId, delVer);

    const both = await searchVector(user.token, spaceId, {
      query: 'JWT authentication',
      threshold: -1,
      topK: 50,
    }).expect(200);
    const docIds = new Set(both.body.items.map((i: { documentId: string }) => i.documentId));
    expect(docIds.has(keepId)).toBe(true);
    expect(docIds.has(delId)).toBe(true);

    await request(server())
      .delete(`/api/v1/documents/${delId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const afterDelete = await searchVector(user.token, spaceId, {
      query: 'JWT authentication',
      threshold: -1,
      topK: 50,
    }).expect(200);
    for (const item of afterDelete.body.items) {
      expect(item.documentId).not.toBe(delId);
    }
    expect(
      afterDelete.body.items.some((i: { documentId: string }) => i.documentId === keepId),
    ).toBe(true);

    const keepChunks = await knowledgeChunkRepository.listByVersion(keepVer);
    expect(keepChunks.length).toBeGreaterThan(0);
    const query = 'JWT authentication';
    const vector = (await mockProvider.embed({ text: query })).vector;

    let chunkIds = keepChunks.map((c) => c.id);
    if (chunkIds.length < 2) {
      const up2 = await uploadFile(
        user.token,
        spaceId,
        'tie2.md',
        'JWT authentication tie breaking second document content for chunking',
      );
      const id2 = up2.body.id as string;
      const ver2 = up2.body.currentVersionId as string;
      await processVersion(id2, ver2);
      const more = await knowledgeChunkRepository.listByVersion(ver2);
      chunkIds = [...chunkIds, ...more.map((c) => c.id)];
    }
    expect(chunkIds.length).toBeGreaterThanOrEqual(2);
    const pair = chunkIds.slice(0, 2);
    for (const chunkId of pair) {
      await embeddingRecordRepository.upsertForChunk({
        chunkId,
        provider: embedConfig.provider,
        model: embedConfig.model,
        dimension: embedConfig.dimension,
        vector,
      });
    }
    const tied = await searchVector(user.token, spaceId, { query, topK: 50 }).expect(200);
    const tiedItems = tied.body.items.filter((i: { chunkId: string }) => pair.includes(i.chunkId));
    expect(tiedItems.length).toBe(2);
    const expectedOrder = [...pair].sort((a, b) => a.localeCompare(b));
    expect(tiedItems.map((i: { chunkId: string }) => i.chunkId)).toEqual(expectedOrder);
    expect(tiedItems[0].score).toBeCloseTo(tiedItems[1].score, 6);
    for (const item of tiedItems) {
      expect(item.score).toBeGreaterThanOrEqual(0.99);
    }

    await deleteWorkspace(user.token, workspaceId);
  }, 90_000);
});
