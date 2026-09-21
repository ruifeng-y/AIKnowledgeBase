import { Injectable } from '@nestjs/common';
import { knowledgeChunkRepository } from '@akb/db';
import type {
  KnowledgeChunkItem,
  KnowledgeChunkRepositoryPort,
} from '../../modules/documents/domain/knowledge-chunk.repository.port';

function mapChunk(row: {
  id: string;
  sectionId: string | null;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  documentVersionId: string;
  metadata: Record<string, unknown>;
}): KnowledgeChunkItem {
  return {
    id: row.id,
    sectionId: row.sectionId,
    chunkIndex: row.chunkIndex,
    content: row.content,
    tokenCount: row.tokenCount,
    documentVersionId: row.documentVersionId,
    metadata: row.metadata,
  };
}

@Injectable()
export class KnowledgeChunkRepositoryAdapter implements KnowledgeChunkRepositoryPort {
  async listByDocumentId(documentId: string): Promise<KnowledgeChunkItem[]> {
    const rows = await knowledgeChunkRepository.listByDocumentId(documentId);
    return rows.map(mapChunk);
  }

  async listByVersionId(documentVersionId: string): Promise<KnowledgeChunkItem[]> {
    const rows = await knowledgeChunkRepository.listByVersion(documentVersionId);
    return rows.map(mapChunk);
  }

  async countByVersionId(documentVersionId: string): Promise<number> {
    return knowledgeChunkRepository.countByVersion(documentVersionId);
  }
}
