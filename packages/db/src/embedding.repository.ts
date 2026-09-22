import { prisma } from './client';

export interface EmbeddingUpsertInput {
  chunkId: string;
  provider: string;
  model: string;
  dimension: number;
  vector: number[];
}

export interface EmbeddingRecordRow {
  id: string;
  chunkId: string;
  provider: string;
  model: string;
  dimensions: number;
}

function mapRow(row: {
  id: string;
  chunk_id: string;
  provider: string;
  model: string;
  dimensions: number;
}): EmbeddingRecordRow {
  return {
    id: row.id,
    chunkId: row.chunk_id,
    provider: row.provider,
    model: row.model,
    dimensions: Number(row.dimensions),
  };
}

export const embeddingRecordRepository = {
  /**
   * Database-native upsert on EmbeddingRecordIdentity (chunkId, provider, model, dimensions).
   * Concurrency enforced by UNIQUE constraint + ON CONFLICT DO UPDATE.
   */
  async upsertForChunk(input: EmbeddingUpsertInput): Promise<EmbeddingRecordRow> {
    const vectorLiteral = `[${input.vector.join(',')}]`;
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        chunk_id: string;
        provider: string;
        model: string;
        dimensions: number;
      }>
    >`
      INSERT INTO embedding_records (id, chunk_id, provider, model, dimensions, embedding, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${input.chunkId}::uuid,
        ${input.provider},
        ${input.model},
        ${input.dimension},
        ${vectorLiteral}::vector,
        NOW(),
        NOW()
      )
      ON CONFLICT (chunk_id, provider, model, dimensions)
      DO UPDATE SET
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
      RETURNING id, chunk_id, provider, model, dimensions
    `;
    const row = rows[0];
    if (!row) {
      throw new Error('EMBEDDING_PERSIST_ERROR');
    }
    return mapRow(row);
  },

  async listByChunkId(
    chunkId: string,
  ): Promise<Array<{ id: string; provider: string; model: string; dimensions: number }>> {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; provider: string; model: string; dimensions: number }>
    >`
      SELECT id::text AS id, provider, model, dimensions
      FROM embedding_records
      WHERE chunk_id = ${chunkId}::uuid
      ORDER BY created_at ASC
    `;
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      model: row.model,
      dimensions: Number(row.dimensions),
    }));
  },

  async countByVersionId(documentVersionId: string): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM embedding_records e
      INNER JOIN knowledge_chunks c ON c.id = e.chunk_id
      WHERE c.document_version_id = ${documentVersionId}::uuid
    `;
    return Number(rows[0]?.count ?? 0);
  },

  async countByChunkAndModel(chunkId: string, provider: string, model: string): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM embedding_records
      WHERE chunk_id = ${chunkId}::uuid AND provider = ${provider} AND model = ${model}
    `;
    return Number(rows[0]?.count ?? 0);
  },

  async countByIdentity(
    chunkId: string,
    provider: string,
    model: string,
    dimensions: number,
  ): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM embedding_records
      WHERE chunk_id = ${chunkId}::uuid
        AND provider = ${provider}
        AND model = ${model}
        AND dimensions = ${dimensions}
    `;
    return Number(rows[0]?.count ?? 0);
  },
};
