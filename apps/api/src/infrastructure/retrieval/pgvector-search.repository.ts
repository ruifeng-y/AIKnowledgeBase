import { Injectable } from '@nestjs/common';
import { prisma } from '@akb/db';
import type {
  VectorSearchParams,
  VectorSearchRepositoryPort,
  VectorSearchRow,
} from '../../modules/retrieval/domain/vector-search.port';

@Injectable()
export class PgVectorSearchRepository implements VectorSearchRepositoryPort {
  async search(params: VectorSearchParams): Promise<VectorSearchRow[]> {
    const vectorLiteral = `[${params.queryVector.join(',')}]`;
    const threshold = params.threshold;
    const topK = params.topK;
    const versionFilter = params.documentVersionId
      ? prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT
            c.id::text AS chunk_id,
            c.document_id::text AS document_id,
            c.document_version_id::text AS document_version_id,
            c.knowledge_space_id::text AS knowledge_space_id,
            c.content AS content,
            c.chunk_index AS chunk_index,
            c.metadata AS metadata,
            e.provider AS embedding_provider,
            e.model AS embedding_model,
            e.dimensions AS embedding_dimension,
            1 - (e.embedding <=> ${vectorLiteral}::vector) AS score
          FROM embedding_records e
          INNER JOIN knowledge_chunks c ON c.id = e.chunk_id
          INNER JOIN documents d ON d.id = c.document_id
          WHERE c.knowledge_space_id = ${params.knowledgeSpaceId}::uuid
            AND c.document_version_id = ${params.documentVersionId}::uuid
            AND e.provider = ${params.provider}
            AND e.model = ${params.model}
            AND e.dimensions = ${params.dimension}
            AND (1 - (e.embedding <=> ${vectorLiteral}::vector)) >= ${threshold}
          ORDER BY score DESC, c.id ASC
          LIMIT ${topK}
        `
      : prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT
            c.id::text AS chunk_id,
            c.document_id::text AS document_id,
            c.document_version_id::text AS document_version_id,
            c.knowledge_space_id::text AS knowledge_space_id,
            c.content AS content,
            c.chunk_index AS chunk_index,
            c.metadata AS metadata,
            e.provider AS embedding_provider,
            e.model AS embedding_model,
            e.dimensions AS embedding_dimension,
            1 - (e.embedding <=> ${vectorLiteral}::vector) AS score
          FROM embedding_records e
          INNER JOIN knowledge_chunks c ON c.id = e.chunk_id
          INNER JOIN documents d ON d.id = c.document_id
          WHERE c.knowledge_space_id = ${params.knowledgeSpaceId}::uuid
            AND c.document_version_id = d.current_version_id
            AND e.provider = ${params.provider}
            AND e.model = ${params.model}
            AND e.dimensions = ${params.dimension}
            AND (1 - (e.embedding <=> ${vectorLiteral}::vector)) >= ${threshold}
          ORDER BY score DESC, c.id ASC
          LIMIT ${topK}
        `;

    const rows = await versionFilter;
    return rows.map((row) => ({
      chunkId: String(row['chunk_id']),
      documentId: String(row['document_id']),
      documentVersionId: String(row['document_version_id']),
      knowledgeSpaceId: String(row['knowledge_space_id']),
      content: String(row['content'] ?? ''),
      chunkIndex: Number(row['chunk_index'] ?? 0),
      score: Number(row['score'] ?? 0),
      metadata:
        row['metadata'] && typeof row['metadata'] === 'object'
          ? (row['metadata'] as Record<string, unknown>)
          : {},
      embeddingProvider: String(row['embedding_provider']),
      embeddingModel: String(row['embedding_model']),
      embeddingDimension: Number(row['embedding_dimension'] ?? 0),
    }));
  }

  async resolveCurrentVersionIds(knowledgeSpaceId: string): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ version_id: string | null }>>`
      SELECT d.current_version_id::text AS version_id
      FROM documents d
      WHERE d.knowledge_space_id = ${knowledgeSpaceId}::uuid
        AND d.current_version_id IS NOT NULL
    `;
    return rows.map((r) => String(r.version_id)).filter(Boolean);
  }

  async versionBelongsToSpace(versionId: string, knowledgeSpaceId: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ exists_flag: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM document_versions v
        INNER JOIN documents d ON d.id = v.document_id
        WHERE v.id = ${versionId}::uuid
          AND d.knowledge_space_id = ${knowledgeSpaceId}::uuid
      ) AS exists_flag
    `;
    return rows[0]?.exists_flag === true;
  }
}
