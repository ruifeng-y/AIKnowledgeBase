/** Citation domain port — no CitationMapper in V0.4-D. */

export const CITATION_MAPPER = Symbol('CITATION_MAPPER');

export interface CitationReference {
  citationId: string;
  chunkId: string;
  rank: number;
}

export interface CitationMapperPort {
  /** Reserved for future message-source mapping. */
  listCitations(messageId: string): Promise<CitationReference[]>;
}
