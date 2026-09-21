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
import { VECTOR_SEARCH_SERVICE_TEST_CONFIG } from './vector-search.test.config';

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`;
const embedConfig = { ...DEFAULT_EMBEDDING_CONFIG, dimension: 384, batchSize: 32 };
const mockProvider = new MockEmbeddingProvider(embedConfig);

describe('V0.4-L Reranked Retrieval integration', () => {
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
        email: `rr-${tag}-${suffix}@example.com`,
        password: 'password123',
        name: `RR ${tag}`,
      })
      .expect(201);
    return { token: reg.body.tokens.accessToken as string };
  }

  async function createSpace(token: string, tag: string) {
    const ws = await request(server())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `WS ${tag}`, slug: `rr-ws-${tag}-${suffix}` })
      .expect(201);
    const sp = await request(server())
      .post(`/api/v1/workspaces/${ws.body.id}/spaces`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Space ${tag}`, slug: `rr-sp-${tag}-${suffix}` })
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

  function reranked(token: string, spaceId: string, body: Record<string, unknown>) {
    return request(server())
      .post(`/api/v1/spaces/${spaceId}/search/reranked`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
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

  it('full pipeline: parse → chunk → embed → retrieve → RRF → rerank → final', async () => {
    const user = await registerUser('pipe');
    const { workspaceId, spaceId } = await createSpace(user.token, 'pipe');

    const sections: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      sections.push(
        `# Doc ${i}\n\njwt authentication token content number ${i} unique marker m${i}`,
      );
    }
    const up = await uploadAndProcess(user.token, spaceId, 'many.md', sections.join('\n\n'));
    const versionId = up.body.currentVersionId as string;
    const chunks = await knowledgeChunkRepository.listByVersion(versionId);
    expect(chunks.length).toBeGreaterThan(0);

    const query = 'jwt authentication token';
    const vector = (await mockProvider.embed({ text: query })).vector;
    for (const chunk of chunks) {
      await embeddingRecordRepository.upsertForChunk({
        chunkId: chunk.id,
        provider: embedConfig.provider,
        model: embedConfig.model,
        dimension: embedConfig.dimension,
        vector,
      });
    }

    const res = await reranked(user.token, spaceId, {
      query,
      topK: 10,
      retrievalCandidateK: 50,
      rerankCandidateK: 20,
      threshold: 0.3,
    }).expect(200);

    expect(res.body.knowledgeSpaceId).toBe(spaceId);
    expect(res.body.topK).toBe(10);
    expect(res.body.retrievalCandidateK).toBe(50);
    expect(res.body.rerankCandidateK).toBe(20);
    expect(res.body.threshold).toBe(0.3);
    expect(res.body.provider).toBe('mock');
    expect(res.body.model).toBeTruthy();
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.total).toBeLessThanOrEqual(10);

    for (const item of res.body.items) {
      expect(item.knowledgeSpaceId).toBe(spaceId);
      expect(Number.isFinite(item.score)).toBe(true);
      expect(item).not.toHaveProperty('rrfScore');
      expect(item).not.toHaveProperty('vectorScore');
      expect(item).not.toHaveProperty('lexicalScore');
    }

    for (let i = 1; i < res.body.items.length; i += 1) {
      const prev = res.body.items[i - 1];
      const cur = res.body.items[i];
      expect(prev.score >= cur.score).toBe(true);
      if (prev.score === cur.score) {
        expect(prev.chunkId.localeCompare(cur.chunkId)).toBeLessThanOrEqual(0);
      }
    }

    // backward compat
    await vectorSearch(user.token, spaceId, { query, topK: 5 }).expect(200);
    await hybrid(user.token, spaceId, { query, topK: 5, candidateK: 20 }).expect(200);

    await deleteWorkspace(user.token, workspaceId);
  }, 90_000);

  it('validation matrix for topK / retrievalCandidateK / rerankCandidateK / threshold', async () => {
    const user = await registerUser('val');
    const { workspaceId, spaceId } = await createSpace(user.token, 'val');
    await uploadAndProcess(user.token, spaceId, 'v.txt', 'jwt authentication validation content');

    const cases: Array<{ body: Record<string, unknown>; status: number; code?: string }> = [
      { body: { query: '' }, status: 400 },
      { body: { query: '   ' }, status: 400 },
      { body: { query: 'jwt', topK: 0 }, status: 400 },
      { body: { query: 'jwt', topK: 51 }, status: 400 },
      { body: { query: 'jwt', topK: 1 }, status: 200 },
      {
        body: { query: 'jwt', topK: 50, rerankCandidateK: 50, retrievalCandidateK: 50 },
        status: 200,
      },
      { body: { query: 'jwt', topK: 50 }, status: 400, code: 'INVALID_RERANK_CANDIDATE_K' },
      { body: { query: 'jwt', retrievalCandidateK: 0 }, status: 400 },
      { body: { query: 'jwt', retrievalCandidateK: 101 }, status: 400 },
      { body: { query: 'jwt', retrievalCandidateK: 100 }, status: 200 },
      { body: { query: 'jwt', rerankCandidateK: 0 }, status: 400 },
      { body: { query: 'jwt', rerankCandidateK: 51 }, status: 400 },
      { body: { query: 'jwt', rerankCandidateK: 50, topK: 10 }, status: 200 },
      {
        body: { query: 'jwt', topK: 20, rerankCandidateK: 10 },
        status: 400,
        code: 'INVALID_RERANK_CANDIDATE_K',
      },
      {
        body: { query: 'jwt', topK: 5, rerankCandidateK: 10, retrievalCandidateK: 8 },
        status: 400,
        code: 'INVALID_RERANK_CANDIDATE_K',
      },
      { body: { query: 'jwt', threshold: -1 }, status: 200 },
      { body: { query: 'jwt', threshold: 1 }, status: 200 },
      { body: { query: 'jwt', threshold: -1.1 }, status: 400 },
      { body: { query: 'jwt', threshold: 1.1 }, status: 400 },
    ];

    for (const c of cases) {
      const res = await reranked(user.token, spaceId, c.body);
      expect(res.status, JSON.stringify(c.body)).toBe(c.status);
      if (c.code) {
        expect(res.body.error?.code).toBe(c.code);
      }
    }

    const defaults = await reranked(user.token, spaceId, { query: 'jwt' }).expect(200);
    expect(defaults.body.topK).toBe(10);
    expect(defaults.body.retrievalCandidateK).toBe(50);
    expect(defaults.body.rerankCandidateK).toBe(20);
    expect(defaults.body.threshold).toBe(0.3);

    await deleteWorkspace(user.token, workspaceId);
  }, 90_000);

  it('version / tenant isolation / empty / missing embedding still lexical', async () => {
    const userA = await registerUser('iso-a');
    const userB = await registerUser('iso-b');
    const a = await createSpace(userA.token, 'iso-a');
    const b = await createSpace(userB.token, 'iso-b');
    const empty = await createSpace(userA.token, 'iso-empty');

    const upA = await uploadAndProcess(
      userA.token,
      a.spaceId,
      'a.md',
      '# A\n\nzqxkeyword jwt authentication only here',
    );
    const documentId = upA.body.id as string;
    const version1 = upA.body.currentVersionId as string;

    const ok = await reranked(userA.token, a.spaceId, {
      query: 'zqxkeyword',
      threshold: 0.99,
    }).expect(200);
    expect(ok.body.total).toBeGreaterThan(0);

    // missing embedding still searchable via lexical + rerank
    const chunks = await knowledgeChunkRepository.listByVersion(version1);
    for (const chunk of chunks) {
      await embeddingRecordRepository.upsertForChunk({
        chunkId: chunk.id,
        provider: embedConfig.provider,
        model: embedConfig.model,
        dimension: embedConfig.dimension,
        vector: new Array(embedConfig.dimension).fill(0),
      });
      // leave embeddings but high threshold excludes vector; lexical still works
    }
    const lexicalOnly = await reranked(userA.token, a.spaceId, {
      query: 'zqxkeyword',
      threshold: 0.99,
    }).expect(200);
    expect(lexicalOnly.body.total).toBeGreaterThan(0);

    // historical version
    const up2 = await request(server())
      .post(`/api/v1/spaces/${a.spaceId}/documents/${documentId}/versions`)
      .set('Authorization', `Bearer ${userA.token}`)
      .attach('file', Buffer.from('# B\n\nbetakeyword second version', 'utf8'), {
        filename: 'v2.md',
        contentType: 'text/markdown',
      })
      .expect(201);
    const version2 = up2.body.currentVersionId as string;
    await processor.process({ documentId, documentVersionId: version2 });

    const current = await reranked(userA.token, a.spaceId, {
      query: 'betakeyword',
      threshold: -1,
    }).expect(200);
    expect(current.body.total).toBeGreaterThan(0);
    for (const item of current.body.items) {
      expect(item.documentVersionId).toBe(version2);
    }

    const historical = await reranked(userA.token, a.spaceId, {
      query: 'zqxkeyword',
      versionId: version1,
      threshold: -1,
    }).expect(200);
    expect(historical.body.versionId).toBe(version1);
    expect(historical.body.total).toBeGreaterThan(0);

    await reranked(userA.token, a.spaceId, {
      query: 'x',
      versionId: '00000000-0000-0000-0000-000000000077',
    }).expect(404);

    await reranked(userB.token, a.spaceId, { query: 'zqxkeyword' }).expect(404);
    await reranked(userA.token, b.spaceId, { query: 'zqxkeyword' }).expect(404);

    const emptyRes = await reranked(userA.token, empty.spaceId, {
      query: 'zqxkeyword',
      threshold: -1,
    }).expect(200);
    expect(emptyRes.body.total).toBe(0);
    expect(emptyRes.body.items).toEqual([]);

    await deleteWorkspace(userA.token, a.workspaceId);
    await deleteWorkspace(userA.token, empty.workspaceId);
    await deleteWorkspace(userB.token, b.workspaceId);
  }, 90_000);
});
