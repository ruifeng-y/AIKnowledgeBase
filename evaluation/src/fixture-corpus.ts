import { mockVector } from '../../packages/ai/src/index';
import { contentHashOf } from './dataset.repository';
import type {
  LexicalSearchParams,
  LexicalSearchRow,
} from '../../apps/api/src/modules/retrieval/domain/lexical-search.port';
import type {
  VectorSearchParams,
  VectorSearchRow,
} from '../../apps/api/src/modules/retrieval/domain/vector-search.port';
import type { CorpusChunk, CorpusSnapshot } from './types';

/** In-memory fixture corpus — read-only, no production DB mutation. */
export class FixtureCorpus {
  constructor(private readonly snapshot: CorpusSnapshot) {}

  get chunks(): CorpusChunk[] {
    return this.snapshot.chunks;
  }

  byId(chunkId: string): CorpusChunk | undefined {
    return this.snapshot.chunks.find((c) => c.chunkId === chunkId);
  }
}

function cosineScore(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) {
    return -1;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class FixtureVectorSearchRepository {
  constructor(private readonly corpus: FixtureCorpus) {}

  async search(params: VectorSearchParams): Promise<VectorSearchRow[]> {
    const rows: VectorSearchRow[] = [];
    for (const chunk of this.corpus.chunks) {
      if (chunk.knowledgeSpaceId !== params.knowledgeSpaceId) {
        continue;
      }
      if (params.documentVersionId) {
        if (chunk.documentVersionId !== params.documentVersionId) {
          continue;
        }
      } else if (!chunk.isCurrentVersion) {
        continue;
      }
      // Must match MockEmbeddingProvider.mockVector(content, dimension, model)
      const vec = mockVector(chunk.content, params.dimension, params.model);
      const score = cosineScore(params.queryVector, vec);
      if (score < params.threshold) {
        continue;
      }
      rows.push({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentVersionId: chunk.documentVersionId,
        knowledgeSpaceId: chunk.knowledgeSpaceId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        score,
        metadata: chunk.metadata ?? {},
        embeddingProvider: params.provider,
        embeddingModel: params.model,
        embeddingDimension: params.dimension,
      });
    }
    rows.sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
    return rows.slice(0, params.topK);
  }

  async versionBelongsToSpace(versionId: string, knowledgeSpaceId: string): Promise<boolean> {
    return this.corpus.chunks.some(
      (c) => c.documentVersionId === versionId && c.knowledgeSpaceId === knowledgeSpaceId,
    );
  }

  async resolveCurrentVersionIds(knowledgeSpaceId: string): Promise<string[]> {
    return [
      ...new Set(
        this.corpus.chunks
          .filter((c) => c.knowledgeSpaceId === knowledgeSpaceId && c.isCurrentVersion)
          .map((c) => c.documentVersionId),
      ),
    ];
  }
}

/** Lexical rank stand-in for PostgreSQL FTS (contract eval only — not BM25). */
export class FixtureLexicalSearchRepository {
  constructor(private readonly corpus: FixtureCorpus) {}

  async search(params: LexicalSearchParams): Promise<LexicalSearchRow[]> {
    const terms = params.query
      .toLowerCase()
      .split(/[^a-z0-9_]+/i)
      .filter((t) => t.length > 0);
    const rows: LexicalSearchRow[] = [];
    for (const chunk of this.corpus.chunks) {
      if (chunk.knowledgeSpaceId !== params.knowledgeSpaceId) {
        continue;
      }
      if (params.documentVersionId) {
        if (chunk.documentVersionId !== params.documentVersionId) {
          continue;
        }
      } else if (!chunk.isCurrentVersion) {
        continue;
      }
      const text = chunk.content.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (text.includes(t)) {
          score += 1;
        }
      }
      if (score <= 0) {
        continue;
      }
      rows.push({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentVersionId: chunk.documentVersionId,
        knowledgeSpaceId: chunk.knowledgeSpaceId,
        content: chunk.content,
        chunkIndex: chunk.chunkIndex,
        score,
        metadata: chunk.metadata ?? {},
      });
    }
    rows.sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
    return rows.slice(0, params.candidateK);
  }
}

export class FixtureAuthorizationService {
  constructor(private readonly corpus: FixtureCorpus) {}

  async assertSpaceOwner(userId: string, spaceId: string) {
    const hit = this.corpus.chunks.find(
      (c) => c.knowledgeSpaceId === spaceId && c.ownerId === userId,
    );
    if (!hit) {
      throw Object.assign(new Error('KNOWLEDGE_SPACE_NOT_FOUND'), { httpStatus: 404 });
    }
    return { id: spaceId };
  }

  async assertWorkspaceOwner(userId: string, workspaceId: string) {
    const hit = this.corpus.chunks.find(
      (c) => c.workspaceId === workspaceId && c.ownerId === userId,
    );
    if (!hit) {
      throw Object.assign(new Error('WORKSPACE_NOT_FOUND'), { httpStatus: 404 });
    }
    return { id: workspaceId };
  }

  async assertDocumentOwner(userId: string, documentId: string) {
    const hit = this.corpus.chunks.find(
      (c) => c.documentId === documentId && c.ownerId === userId,
    );
    if (!hit) {
      throw Object.assign(new Error('DOCUMENT_NOT_FOUND'), { httpStatus: 404 });
    }
    return { id: documentId };
  }
}

export function hashContent(content: string): string {
  return contentHashOf(content);
}

export type { CorpusSnapshot, CorpusChunk };
