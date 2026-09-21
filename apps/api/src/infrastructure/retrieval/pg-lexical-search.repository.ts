import { Injectable } from '@nestjs/common';
import { prisma } from '@akb/db';
import type {
  LexicalSearchParams,
  LexicalSearchRepositoryPort,
  LexicalSearchRow,
} from '../../modules/retrieval/domain/lexical-search.port';

/**
 * PostgreSQL Full-Text Search lexical retrieval.
 * Uses ts_rank_cd — this is NOT BM25.
 */
@Injectable()
export class PgLexicalSearchRepository implements LexicalSearchRepositoryPort {
  async search(params: LexicalSearchParams): Promise<LexicalSearchRow[]> {
    const query = params.query;
    const candidateK = params.candidateK;

    const rows = params.documentVersionId
      ? await prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT
            c.id::text AS chunk_id,
            c.document_id::text AS document_id,
            c.document_version_id::text AS document_version_id,
            c.knowledge_space_id::text AS knowledge_space_id,
            c.content AS content,
            c.chunk_index AS chunk_index,
            c.metadata AS metadata,
            ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', ${query})) AS score
          FROM knowledge_chunks c
          INNER JOIN documents d ON d.id = c.document_id
          WHERE c.knowledge_space_id = ${params.knowledgeSpaceId}::uuid
            AND c.document_version_id = ${params.documentVersionId}::uuid
            AND c.search_vector @@ websearch_to_tsquery('simple', ${query})
          ORDER BY score DESC, c.id ASC
          LIMIT ${candidateK}
        `
      : await prisma.$queryRaw<Array<Record<string, unknown>>>`
          SELECT
            c.id::text AS chunk_id,
            c.document_id::text AS document_id,
            c.document_version_id::text AS document_version_id,
            c.knowledge_space_id::text AS knowledge_space_id,
            c.content AS content,
            c.chunk_index AS chunk_index,
            c.metadata AS metadata,
            ts_rank_cd(c.search_vector, websearch_to_tsquery('simple', ${query})) AS score
          FROM knowledge_chunks c
          INNER JOIN documents d ON d.id = c.document_id
          WHERE c.knowledge_space_id = ${params.knowledgeSpaceId}::uuid
            AND c.document_version_id = d.current_version_id
            AND c.search_vector @@ websearch_to_tsquery('simple', ${query})
          ORDER BY score DESC, c.id ASC
          LIMIT ${candidateK}
        `;

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
    }));
  }
}
