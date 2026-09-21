export interface KnowledgeChunkItem {
  id: string;
  sectionId: string | null;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  documentVersionId: string;
  metadata: Record<string, unknown>;
}

export interface DocumentChunksView {
  documentId: string;
  versionId: string | null;
  items: KnowledgeChunkItem[];
  total: number;
}

export const KNOWLEDGE_CHUNK_REPOSITORY = Symbol('KNOWLEDGE_CHUNK_REPOSITORY');

export interface KnowledgeChunkRepositoryPort {
  listByDocumentId(documentId: string): Promise<KnowledgeChunkItem[]>;
  listByVersionId(documentVersionId: string): Promise<KnowledgeChunkItem[]>;
  countByVersionId(documentVersionId: string): Promise<number>;
}
