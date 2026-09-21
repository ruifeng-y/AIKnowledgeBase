/** Lexical Retrieval via PostgreSQL Full-Text Search — not BM25. */

export interface LexicalSearchParams {
  knowledgeSpaceId: string;
  documentVersionId?: string | null;
  query: string;
  candidateK: number;
}

export interface LexicalSearchRow {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  knowledgeSpaceId: string;
  content: string;
  chunkIndex: number;
  score: number;
  metadata: Record<string, unknown>;
}

export const LEXICAL_SEARCH_REPOSITORY = Symbol('LEXICAL_SEARCH_REPOSITORY');

export interface LexicalSearchRepositoryPort {
  search(params: LexicalSearchParams): Promise<LexicalSearchRow[]>;
}

export function sortLexicalSearchRows(rows: LexicalSearchRow[]): LexicalSearchRow[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.chunkId.localeCompare(b.chunkId);
  });
}
