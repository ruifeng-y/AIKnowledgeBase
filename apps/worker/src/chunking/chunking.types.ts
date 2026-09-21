export class ChunkingError extends Error {
  constructor(
    readonly code:
      | 'DOCUMENT_CHUNKING_ERROR'
      | 'DOCUMENT_CHUNK_VERSION_MISMATCH'
      | 'DOCUMENT_CHUNK_INVALID_INPUT'
      | 'DOCUMENT_CHUNK_EMPTY_CONTENT'
      | 'DOCUMENT_CHUNK_SIZE_ERROR',
    message: string,
  ) {
    super(message);
    this.name = 'ChunkingError';
  }
}

export interface ChunkMetadata {
  heading?: string;
  headingPath?: string[];
  sectionTitle?: string;
  sectionLevel?: number;
  pageNumber?: number;
  sourceType?: string;
  language?: string;
  isCode?: boolean;
  codeLanguage?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface KnowledgeChunkDraft {
  id: string;
  knowledgeSpaceId: string;
  documentId: string;
  documentVersionId: string;
  sectionId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: ChunkMetadata;
}

export interface ChunkingSection {
  id: string;
  documentVersionId: string;
  title?: string;
  level?: number;
  content: string;
  order: number;
  metadata?: Record<string, unknown>;
}

export interface ChunkingInput {
  documentId: string;
  documentVersionId: string;
  knowledgeSpaceId: string;
  sections: ChunkingSection[];
}

export interface ChunkingConfig {
  minTokens: number;
  targetTokens: number;
  maxTokens: number;
  overlapTokens: number;
}

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  minTokens: 200,
  targetTokens: 600,
  maxTokens: 800,
  overlapTokens: 100,
};

export interface ChunkingStats {
  sectionCount: number;
  chunkCount: number;
  minTokenCount: number;
  maxTokenCount: number;
  averageTokenCount: number;
  totalTokenCount: number;
  codeChunkCount: number;
  smallChunkCount: number;
  largeChunkCount: number;
}

export interface ChunkingResult {
  chunks: KnowledgeChunkDraft[];
  stats: ChunkingStats;
}

export interface ChunkingStrategy {
  chunk(input: ChunkingInput): ChunkingResult;
}

export function normalizeChunkText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
    .trim();
}

export function buildHeadingPath(
  section: { title?: string; level?: number; metadata?: Record<string, unknown> },
  stack: string[],
): string[] {
  const level = section.level ?? 1;
  const title = section.title?.trim();
  const path = stack.slice(0, Math.max(0, level - 1));
  if (title) {
    path.push(title);
  }
  return path;
}
