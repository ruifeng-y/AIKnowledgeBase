/** Retrieval domain port — no RAG pipeline implementation in V0.4-D. */

export const RETRIEVAL_SERVICE = Symbol('RETRIEVAL_SERVICE');

export interface RetrievalQuery {
  knowledgeSpaceId: string;
  query: string;
  topK?: number;
}

export interface RetrievalHit {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
}

export interface RetrievalServicePort {
  search(query: RetrievalQuery): Promise<RetrievalHit[]>;
}
