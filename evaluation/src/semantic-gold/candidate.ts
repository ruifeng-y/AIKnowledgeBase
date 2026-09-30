/**
 * Machine-generated Semantic Gold CANDIDATES only.
 * Output is always annotationStatus=DRAFT, provenance=machine_generated.
 * Never auto-promotes to GOLD.
 */

import type { CorpusSnapshotMeta, SemanticGoldCase, SemanticGoldChunkRef } from './schema';
import { stableCaseId } from './schema';
import type { RelevanceGrade } from '../types';

export interface CandidateOptions {
  datasetVersion: string;
  corpusVersion: string;
  startIndex?: number;
  maxCases?: number;
}

function chunkRef(chunk: CorpusSnapshotMeta['chunks'][number], grade: RelevanceGrade): SemanticGoldChunkRef {
  return {
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    documentVersionId: chunk.documentVersionId,
    chunkIndex: chunk.chunkIndex,
    contentHash: chunk.contentHash,
    relevanceGrade: grade,
  };
}

function deriveCategory(content: string, index: number): string[] {
  const cats: string[] = [];
  if (/\d{4}-\d{2}-\d{2}|\b20\d{2}\b/.test(content)) cats.push('date');
  if (/\b\d+(\.\d+)?%?\b/.test(content)) cats.push('numeric');
  if (/\b[A-Z]{2,}-\d+\b|\b[a-z]+_[a-z_]+\b/.test(content)) cats.push('identifier');
  if (index % 3 === 0) cats.push('exact_keyword');
  if (index % 3 === 1) cats.push('semantic_paraphrase');
  if (index % 3 === 2) cats.push('technical_term');
  if (cats.length === 0) cats.push('exact_keyword');
  return cats;
}

/**
 * Generate DRAFT candidate cases from a corpus snapshot.
 * These require human review before becoming GOLD.
 */
export function generateDraftCandidates(
  corpus: CorpusSnapshotMeta,
  options: CandidateOptions,
): SemanticGoldCase[] {
  const startIndex = options.startIndex ?? 1;
  const max = options.maxCases ?? corpus.chunks.length;
  const cases: SemanticGoldCase[] = [];
  const sorted = [...corpus.chunks].sort((a, b) => a.chunkId.localeCompare(b.chunkId));

  for (let i = 0; i < Math.min(max, sorted.length); i += 1) {
    const chunk = sorted[i]!;
    const titleish = chunk.content.trim().split(/\s+/).slice(0, 8).join(' ');
    cases.push({
      id: stableCaseId(startIndex + i),
      datasetVersion: options.datasetVersion,
      corpusVersion: options.corpusVersion,
      query: titleish.length > 0 ? titleish : `information about ${chunk.chunkId}`,
      category: deriveCategory(chunk.content, i),
      primaryCategory: deriveCategory(chunk.content, i)[0] ?? 'exact_keyword',
      answerability: 'answerable',
      expectedRelevantChunks: [chunkRef(chunk, 3)],
      relevanceGrades: { [chunk.chunkId]: 3 },
      referenceAnswer: chunk.content.slice(0, 240),
      expectedCitationSources: [chunk.chunkId],
      annotationStatus: 'DRAFT',
      provenance: 'machine_generated',
      annotationNotes: 'Machine-generated candidate. Requires human review before GOLD.',
      annotationTimestamp: new Date().toISOString(),
    });
  }

  // one no-answer draft near the end
  if (sorted.length > 0 && cases.length < max) {
    const chunk = sorted[sorted.length - 1]!;
    cases.push({
      id: stableCaseId(startIndex + cases.length),
      datasetVersion: options.datasetVersion,
      corpusVersion: options.corpusVersion,
      query: 'What is the office cafeteria menu for next Monday?',
      category: ['negative_query', 'no_answer'],
      primaryCategory: 'no_answer',
      answerability: 'unanswerable',
      expectedRelevantChunks: [chunkRef(chunk, 0)],
      relevanceGrades: { [chunk.chunkId]: 0 },
      referenceAnswer: null,
      expectedCitationSources: [],
      annotationStatus: 'DRAFT',
      provenance: 'machine_generated',
      annotationNotes: 'Unanswerable candidate. Human must confirm corpus lacks evidence.',
      annotationTimestamp: new Date().toISOString(),
    });
  }

  return cases;
}
