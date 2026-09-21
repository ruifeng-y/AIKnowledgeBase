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

describe('V0.4-K Hybrid Retrieval integration', () => {
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
    const reg = await request(server())
      .post('/api/v1/auth/register')
      .send({
        email: `hy-${tag}-${suffix}@example.com`,
        password: 'password123',
        name: `HY ${tag}`,
      })
      .expect(201);
    return { token: reg.body.tokens.accessToken as string };
  }

  async function createSpace(token: string, tag: string) {
    const ws = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `WS ${tag}`, slug: `hy-ws-${tag}-${suffix}` })
      .expect(201);
    const sp = await request(server())
      .post(`/api/v1/workspaces/${ws.body.id}/spaces`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Space ${tag}`, slug: `hy-sp-${tag}-${suffix}` })
      .expect(201);
    return { workspaceId: ws.body.id as string, spaceId: sp.body.id as string };
  }

  async function uploadAndProcess(
    token: string,
    spaceId: string,
    filename: string,
    content: string,
  ) {
    const up = await request(server())
      .post(`/api/v1/spaces/${spaceId}/documents/upload`)
      .set('Authorization', `Bearer ${token}`)
      .field('title', filename)
      .attach('file', Buffer.from(content, 'utf8'), {
        filename,
        contentType: filename.endsWith('.md') ? 'text/markdown' : 'text/plain',
      })
      .expect(201);
    await processor.process({
      documentId: up.body.id as string,
      documentVersionId: up.body.currentVersionId as string,
    });
    return up;
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

  function hybrid(token: string, spaceId: string, body: Record<string, unknown>) {
    return request(server())
      .post(`/api/v1/spaces/${spaceId}/search/hybrid`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function vectorSearch(token: string, spaceId: string, body: Record<string, unknown>) {
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

  it('full pipeline: document → parse → chunk → embed → lexical + vector + hybrid RRF', async () => {
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
    const up = await uploadAndProcess(user.token, spaceId, 'auth.md', content);
    const versionId = up.body.currentVersionId as string;

    const chunks = await knowledgeChunkRepository.listByVersion(versionId);
    expect(chunks.length).toBeGreaterThan(0);

    // Make vector route also hit: embed the exact query text into first chunk
    const query = 'JWT authentication token explanation for enterprise knowledge base.';
    const vector = (await mockProvider.embed({ text: query })).vector;
    await embeddingRecordRepository.upsertForChunk({
      chunkId: chunks[0]!.id,
      provider: embedConfig.provider,
      model: embedConfig.model,
      dimension: embedConfig.dimension,
      vector,
    });

    const res = await hybrid(user.token, spaceId, {
      query,
      topK: 10,
      candidateK: 50,
      threshold: 0.3,
    }).expect(200);

    expect(res.body.knowledgeSpaceId).toBe(spaceId);
    expect(res.body.topK).toBe(10);
    expect(res.body.candidateK).toBe(50);
    expect(res.body.threshold).toBe(0.3);
    expect(res.body.versionId).toBeNull();
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.total).toBeLessThanOrEqual(10);

    // public items: score = rrfScore, no diagnostic ranks
    for (const item of res.body.items) {
      expect(item.knowledgeSpaceId).toBe(spaceId);
      expect(typeof item.score).toBe('number');
      expect(item.score).toBeGreaterThan(0);
      expect(item).not.toHaveProperty('vectorRank');
      expect(item).not.toHaveProperty('lexicalRank');
      expect(item).not.toHaveProperty('vectorScore');
      expect(item).not.toHaveProperty('lexicalScore');
    }

    // ordering: rrfScore DESC, chunkId ASC
    for (let i = 1; i < res.body.items.length; i += 1) {
      const prev = res.body.items[i - 1];
      const cur = res.body.items[i];
      expect(prev.score >= cur.score).toBe(true);
      if (prev.score === cur.score) {
        expect(prev.chunkId.localeCompare(cur.chunkId)).toBeLessThanOrEqual(0);
      }
    }

    // dual-route hit: chunk that is both exact-embed and lexical match has highest rrf
    const top = res.body.items[0];
    expect(top.chunkId).toBe(chunks[0]!.id);
    // dual contribution ≈ 1/61 + 1/61 if both routes rank it first
    expect(top.score).toBeGreaterThan(1 / 61);

    // lexical-only keyword still findable
    const lexOnly = await hybrid(user.token, spaceId, {
      query: 'Bearer tokens protect',
      threshold: 1,
    }).expect(200);
    expect(lexOnly.body.total).toBeGreaterThan(0);

    // V0.4-J vector API still works
    const vec = await vectorSearch(user.token, spaceId, { query, topK: 10 }).expect(200);
    expect(vec.body.topK).toBe(10);
    expect(vec.body.threshold).toBe(0.3);

    await deleteWorkspace(user.token, workspaceId);
  }, 90_000);

  it('validation matrix: topK / candidateK / threshold / query', async () => {
    const user = await registerUser('val');
    const { workspaceId, spaceId } = await createSpace(user.token, 'val');
    await uploadAndProcess(user.token, spaceId, 'v.txt', 'JWT authentication validation content');

    const cases: Array<{ body: Record<string, unknown>; status: number; code?: string }> = [
      { body: { query: '' }, status: 400 },
      { body: { query: '   ' }, status: 400 },
      { body: { query: 'jwt', topK: 0 }, status: 400 },
      { body: { query: 'jwt', topK: 51 }, status: 400 },
      { body: { query: 'jwt', topK: 1 }, status: 200 },
      { body: { query: 'jwt', topK: 50 }, status: 200 },
      { body: { query: 'jwt', candidateK: 0 }, status: 400 },
      { body: { query: 'jwt', candidateK: 101 }, status: 400 },
      { body: { query: 'jwt', candidateK: 1, topK: 1 }, status: 200 },
      { body: { query: 'jwt', candidateK: 100 }, status: 200 },
      {
        body: { query: 'jwt', topK: 20, candidateK: 10 },
        status: 400,
        code: 'INVALID_SEARCH_CANDIDATE_K',
      },
      { body: { query: 'jwt', threshold: -1 }, status: 200 },
      { body: { query: 'jwt', threshold: 0 }, status: 200 },
      { body: { query: 'jwt', threshold: 1 }, status: 200 },
      { body: { query: 'jwt', threshold: -1.1 }, status: 400 },
      { body: { query: 'jwt', threshold: 1.1 }, status: 400 },
    ];

    for (const c of cases) {
      const res = await hybrid(user.token, spaceId, c.body);
      expect(res.status, JSON.stringify(c.body)).toBe(c.status);
      if (c.code) {
        expect(res.body.error?.code).toBe(c.code);
      }
    }

    const defaults = await hybrid(user.token, spaceId, { query: 'jwt' }).expect(200);
    expect(defaults.body.topK).toBe(10);
    expect(defaults.body.candidateK).toBe(50);
    expect(defaults.body.threshold).toBe(0.3);

    const topK1 = await hybrid(user.token, spaceId, {
      query: 'jwt',
      topK: 1,
      candidateK: 50,
      threshold: -1,
    }).expect(200);
    expect(topK1.body.total).toBeLessThanOrEqual(1);

    await deleteWorkspace(user.token, workspaceId);
  }, 90_000);

  it('lexical retrieval: keywords, missing embedding, version scope, isolation', async () => {
    const user = await registerUser('lex');
    const { workspaceId, spaceId } = await createSpace(user.token, 'lex');
    const up = await uploadAndProcess(
      user.token,
      spaceId,
      'lex.md',
      '# Unique\n\nzqxkeyword appears in this unique knowledge chunk only',
    );
    const documentId = up.body.id as string;
    const version1 = up.body.currentVersionId as string;

    // exact keyword via hybrid (lexical will hit; vector may miss with default threshold)
    const keyword = await hybrid(user.token, spaceId, {
      query: 'zqxkeyword',
      threshold: 0.99,
    }).expect(200);
    expect(keyword.body.total).toBeGreaterThan(0);
    expect(
      keyword.body.items.some((i: { content: string }) => i.content.includes('zqxkeyword')),
    ).toBe(true);

    // missing embedding still lexical searchable
    const chunks = await knowledgeChunkRepository.listByVersion(version1);
    for (const chunk of chunks) {
      await prisma.$executeRaw`
        DELETE FROM embedding_records WHERE chunk_id = ${chunk.id}::uuid
      `;
    }
    const noEmb = await hybrid(user.token, spaceId, {
      query: 'zqxkeyword',
      threshold: -1,
    }).expect(200);
    expect(noEmb.body.total).toBeGreaterThan(0);

    // restore embeddings for version tests
    await processor.process({ documentId, documentVersionId: version1 });

    const up2 = await appendVersion(
      user.token,
      spaceId,
      documentId,
      '# V2\n\nbetakeyword second version content only',
    );
    const version2 = up2.body.currentVersionId as string;
    await processor.process({ documentId, documentVersionId: version2 });

    // current version only
    const current = await hybrid(user.token, spaceId, {
      query: 'betakeyword',
      threshold: -1,
    }).expect(200);
    expect(current.body.total).toBeGreaterThan(0);
    for (const item of current.body.items) {
      expect(item.documentVersionId).toBe(version2);
    }

    // historical version explicit
    const historical = await hybrid(user.token, spaceId, {
      query: 'zqxkeyword',
      versionId: version1,
      threshold: -1,
    }).expect(200);
    expect(historical.body.versionId).toBe(version1);
    expect(historical.body.total).toBeGreaterThan(0);
    for (const item of historical.body.items) {
      expect(item.documentVersionId).toBe(version1);
    }

    // foreign version 404
    await hybrid(user.token, spaceId, {
      query: 'x',
      versionId: '00000000-0000-0000-0000-000000000099',
    }).expect(404);

    // deleted document excluded
    const upDel = await uploadAndProcess(
      user.token,
      spaceId,
      'del.md',
      'zqxkeyword delete me soon content',
    );
    const delId = upDel.body.id as string;
    await request(server())
      .delete(`/api/v1/documents/${delId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const afterDel = await hybrid(user.token, spaceId, {
      query: 'zqxkeyword',
      versionId: version1,
      threshold: -1,
    }).expect(200);
    for (const item of afterDel.body.items) {
      expect(item.documentId).not.toBe(delId);
    }

    await deleteWorkspace(user.token, workspaceId);
  }, 90_000);

  it('tenant and space isolation: cross-tenant 404, cross-space empty', async () => {
    const userA = await registerUser('iso-a');
    const userB = await registerUser('iso-b');
    const a = await createSpace(userA.token, 'iso-a');
    const b = await createSpace(userB.token, 'iso-b');
    const emptySpace = await createSpace(userA.token, 'iso-empty');

    await uploadAndProcess(userA.token, a.spaceId, 'a.md', 'JWT authentication only in A');
    await uploadAndProcess(userB.token, b.spaceId, 'b.txt', 'space b unique content');

    const ok = await hybrid(userA.token, a.spaceId, {
      query: 'JWT authentication',
      threshold: -1,
    }).expect(200);
    expect(ok.body.total).toBeGreaterThan(0);
    for (const item of ok.body.items) {
      expect(item.knowledgeSpaceId).toBe(a.spaceId);
    }

    await hybrid(userB.token, a.spaceId, { query: 'JWT' }).expect(404);
    await hybrid(userA.token, b.spaceId, { query: 'JWT' }).expect(404);

    const empty = await hybrid(userA.token, emptySpace.spaceId, {
      query: 'JWT authentication',
      threshold: -1,
    }).expect(200);
    expect(empty.body.total).toBe(0);
    expect(empty.body.items).toEqual([]);

    await deleteWorkspace(userA.token, a.workspaceId);
    await deleteWorkspace(userA.token, emptySpace.workspaceId);
    await deleteWorkspace(userB.token, b.workspaceId);
  }, 90_000);
});
