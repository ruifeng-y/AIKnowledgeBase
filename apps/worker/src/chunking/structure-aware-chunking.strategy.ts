import { defaultTokenEstimator, type TokenEstimator } from './token-estimator';
import {
  buildHeadingPath,
  ChunkingError,
  DEFAULT_CHUNKING_CONFIG,
  normalizeChunkText,
  type ChunkingConfig,
  type ChunkingInput,
  type ChunkingResult,
  type ChunkingSection,
  type ChunkingStrategy,
  type KnowledgeChunkDraft,
} from './chunking.types';

interface Segment {
  text: string;
  isCode: boolean;
  codeLanguage?: string;
}

export class StructureAwareChunkingStrategy implements ChunkingStrategy {
  constructor(
    private readonly estimator: TokenEstimator = defaultTokenEstimator,
    private readonly config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
  ) {}

  chunk(input: ChunkingInput): ChunkingResult {
    const { documentId, documentVersionId, knowledgeSpaceId, sections } = input;
    if (!documentId || !documentVersionId || !knowledgeSpaceId) {
      throw new ChunkingError('DOCUMENT_CHUNK_INVALID_INPUT', 'Missing required ids');
    }
    for (const section of sections) {
      if (section.documentVersionId !== documentVersionId) {
        throw new ChunkingError(
          'DOCUMENT_CHUNK_VERSION_MISMATCH',
          `Section ${section.id} belongs to another document version`,
        );
      }
    }

    const sorted = [...sections].sort((a, b) => a.order - b.order);
    const headingStack: string[] = [];
    const chunks: KnowledgeChunkDraft[] = [];
    let globalIndex = 0;

    for (const section of sorted) {
      const content = normalizeChunkText(section.content);
      if (content.length === 0) {
        continue;
      }
      const headingPath = buildHeadingPath(section, headingStack);
      const level = section.level ?? 1;
      if (level >= 1 && level <= 6) {
        headingStack[level - 1] = section.title ?? '';
        for (let i = level; i < headingStack.length; i += 1) {
          headingStack[i] = '';
        }
      }

      const segments = this.segmentSection(content, section);
      const sectionChunks = this.chunkSegments(segments, {
        documentId,
        documentVersionId,
        knowledgeSpaceId,
        sectionId: section.id,
        heading: section.title,
        headingPath,
        sectionTitle: section.title,
        sectionLevel: section.level,
        sourceType:
          typeof section.metadata?.['sourceType'] === 'string'
            ? (section.metadata['sourceType'] as string)
            : undefined,
      });

      for (const draft of sectionChunks) {
        chunks.push({
          ...draft,
          id: `${documentVersionId}:${globalIndex}`,
          chunkIndex: globalIndex,
        });
        globalIndex += 1;
      }
    }

    const tokenCounts = chunks.map((c) => c.tokenCount);
    const totalTokenCount = tokenCounts.reduce((a, b) => a + b, 0);
    const stats = {
      sectionCount: sorted.length,
      chunkCount: chunks.length,
      minTokenCount: tokenCounts.length > 0 ? Math.min(...tokenCounts) : 0,
      maxTokenCount: tokenCounts.length > 0 ? Math.max(...tokenCounts) : 0,
      averageTokenCount: chunks.length > 0 ? Math.round(totalTokenCount / chunks.length) : 0,
      totalTokenCount,
      codeChunkCount: chunks.filter((c) => c.metadata.isCode === true).length,
      smallChunkCount: chunks.filter((c) => c.tokenCount < this.config.minTokens).length,
      largeChunkCount: chunks.filter((c) => c.tokenCount > this.config.maxTokens).length,
    };

    this.validateResult(chunks);
    return { chunks, stats };
  }

  private segmentSection(content: string, _section: ChunkingSection): Segment[] {
    const segments: Segment[] = [];
    const lines = content.split('\n');
    let buffer: string[] = [];
    let inCode = false;
    let codeLang: string | undefined;

    const flushText = (): void => {
      if (buffer.length === 0) {
        return;
      }
      segments.push({ text: buffer.join('\n'), isCode: false });
      buffer = [];
    };

    for (const line of lines) {
      const fence = /^```([a-zA-Z0-9_+-]*)\s*$/.exec(line.trim());
      if (fence) {
        if (!inCode) {
          flushText();
          inCode = true;
          codeLang = fence[1] || undefined;
          buffer = [line];
        } else {
          buffer.push(line);
          segments.push({ text: buffer.join('\n'), isCode: true, codeLanguage: codeLang });
          buffer = [];
          inCode = false;
          codeLang = undefined;
        }
        continue;
      }
      buffer.push(line);
    }
    flushText();
    if (buffer.length > 0) {
      segments.push({
        text: buffer.join('\n'),
        isCode: inCode,
        codeLanguage: inCode ? codeLang : undefined,
      });
    }

    // Further split large prose by paragraphs / sentences / lines.
    const expanded: Segment[] = [];
    for (const segment of segments) {
      if (this.estimator.count(segment.text) <= this.config.maxTokens) {
        expanded.push(segment);
        continue;
      }
      expanded.push(...this.splitOversizedSegment(segment));
    }
    return expanded;
  }

  private splitOversizedSegment(segment: Segment): Segment[] {
    if (segment.isCode) {
      return this.splitByLines(segment);
    }
    const paragraphs = segment.text.split(/\n\n+/);
    const parts: Segment[] = [];
    for (const para of paragraphs) {
      const tokenCount = this.estimator.count(para);
      if (tokenCount <= this.config.maxTokens) {
        parts.push({ ...segment, text: para });
        continue;
      }
      const sentences = para.split(/(?<=[.!?。！？])\s+/);
      let current = '';
      for (const sentence of sentences) {
        const candidate = current ? `${current} ${sentence}` : sentence;
        if (this.estimator.count(candidate) <= this.config.maxTokens) {
          current = candidate;
        } else {
          if (current) {
            parts.push({ ...segment, text: current });
          }
          if (this.estimator.count(sentence) <= this.config.maxTokens) {
            current = sentence;
          } else {
            parts.push(...this.splitByLines({ ...segment, text: sentence }));
            current = '';
          }
        }
      }
      if (current) {
        parts.push({ ...segment, text: current });
      }
    }
    return parts.length > 0 ? parts : [segment];
  }

  private splitByLines(segment: Segment): Segment[] {
    const lines = segment.text.split('\n');
    const parts: Segment[] = [];
    let current: string[] = [];
    for (const line of lines) {
      const candidate = [...current, line].join('\n');
      if (this.estimator.count(candidate) <= this.config.maxTokens || current.length === 0) {
        current.push(line);
      } else {
        parts.push({ ...segment, text: current.join('\n') });
        current = [line];
      }
    }
    if (current.length > 0) {
      parts.push({ ...segment, text: current.join('\n') });
    }
    return parts;
  }

  private chunkSegments(
    segments: Segment[],
    meta: {
      documentId: string;
      documentVersionId: string;
      knowledgeSpaceId: string;
      sectionId: string;
      heading?: string;
      headingPath: string[];
      sectionTitle?: string;
      sectionLevel?: number;
      sourceType?: string;
    },
  ): Array<Omit<KnowledgeChunkDraft, 'chunkIndex' | 'id'>> {
    const drafts: Array<Omit<KnowledgeChunkDraft, 'chunkIndex' | 'id'>> = [];
    let current: Segment[] = [];
    let currentTokens = 0;

    const pushCurrent = (isCode?: boolean, codeLanguage?: string): void => {
      if (current.length === 0) {
        return;
      }
      const text = normalizeChunkText(current.map((s) => s.text).join('\n\n'));
      if (text.length === 0) {
        current = [];
        currentTokens = 0;
        return;
      }
      const tokenCount = this.estimator.count(text);
      drafts.push({
        knowledgeSpaceId: meta.knowledgeSpaceId,
        documentId: meta.documentId,
        documentVersionId: meta.documentVersionId,
        sectionId: meta.sectionId,
        content: text,
        tokenCount,
        metadata: {
          heading: meta.heading,
          headingPath: meta.headingPath,
          sectionTitle: meta.sectionTitle,
          sectionLevel: meta.sectionLevel,
          sourceType: meta.sourceType,
          isCode: isCode ?? current.every((s) => s.isCode),
          codeLanguage: codeLanguage ?? current.find((s) => s.codeLanguage)?.codeLanguage,
        },
      });
      current = [];
      currentTokens = 0;
    };

    for (const segment of segments) {
      const segmentTokens = this.estimator.count(segment.text);
      if (segmentTokens === 0) {
        continue;
      }

      // Hard-cap oversized atomic content.
      if (segmentTokens > this.config.maxTokens) {
        pushCurrent();
        const hardParts = this.hardSplit(segment.text);
        for (const part of hardParts) {
          drafts.push({
            knowledgeSpaceId: meta.knowledgeSpaceId,
            documentId: meta.documentId,
            documentVersionId: meta.documentVersionId,
            sectionId: meta.sectionId,
            content: part,
            tokenCount: this.estimator.count(part),
            metadata: {
              heading: meta.heading,
              headingPath: meta.headingPath,
              sectionTitle: meta.sectionTitle,
              sectionLevel: meta.sectionLevel,
              sourceType: meta.sourceType,
              isCode: segment.isCode,
              codeLanguage: segment.codeLanguage,
            },
          });
        }
        continue;
      }

      if (currentTokens + segmentTokens > this.config.targetTokens && currentTokens > 0) {
        pushCurrent();
        // Overlap: re-include tail of previous draft if within same section.
        if (this.config.overlapTokens > 0 && drafts.length > 0) {
          const prev = drafts[drafts.length - 1];
          if (prev && prev.sectionId === meta.sectionId) {
            const overlapText = this.takeOverlap(prev.content);
            if (overlapText) {
              current.push({
                text: overlapText,
                isCode: segment.isCode,
                codeLanguage: segment.codeLanguage,
              });
              currentTokens += this.estimator.count(overlapText);
            }
          }
        }
      }

      current.push(segment);
      currentTokens += segmentTokens;

      if (currentTokens >= this.config.maxTokens) {
        pushCurrent(segment.isCode, segment.codeLanguage);
      }
    }
    pushCurrent();
    return drafts;
  }

  private takeOverlap(text: string): string {
    const tokensApprox = this.estimator.count(text);
    if (tokensApprox <= this.config.overlapTokens) {
      return '';
    }
    const ratio = this.config.overlapTokens / tokensApprox;
    const sliceLen = Math.max(0, Math.floor(text.length * ratio));
    if (sliceLen <= 0) {
      return '';
    }
    const slice = text.slice(Math.max(0, text.length - sliceLen));
    const lineIdx = slice.indexOf('\n');
    return lineIdx >= 0 && lineIdx < slice.length - 1 ? slice.slice(lineIdx + 1) : slice;
  }

  private hardSplit(text: string): string[] {
    const max = this.config.maxTokens;
    const parts: string[] = [];
    let current = '';
    for (const line of text.split('\n')) {
      const candidate = current ? `${current}\n${line}` : line;
      if (this.estimator.count(candidate) <= max || current.length === 0) {
        current = candidate;
      } else {
        parts.push(current);
        current = line;
      }
    }
    if (current) {
      parts.push(current);
    }
    return parts.map((part) => normalizeChunkText(part)).filter((p) => p.length > 0);
  }

  private validateResult(chunks: KnowledgeChunkDraft[]): void {
    const indexes = new Set<number>();
    for (const chunk of chunks) {
      if (!chunk.content || chunk.content.trim().length === 0) {
        throw new ChunkingError('DOCUMENT_CHUNK_EMPTY_CONTENT', 'Empty chunk produced');
      }
      if (chunk.chunkIndex < 0 || indexes.has(chunk.chunkIndex)) {
        throw new ChunkingError('DOCUMENT_CHUNK_INVALID_INPUT', 'Invalid chunk index sequence');
      }
      if (chunk.tokenCount <= 0) {
        throw new ChunkingError('DOCUMENT_CHUNK_SIZE_ERROR', 'Invalid token count');
      }
      indexes.add(chunk.chunkIndex);
    }
  }
}

export function computeChunkingStats(chunks: KnowledgeChunkDraft[]): ChunkingResult['stats'] {
  const tokenCounts = chunks.map((c) => c.tokenCount);
  const total = tokenCounts.reduce((a, b) => a + b, 0);
  return {
    sectionCount: 0,
    chunkCount: chunks.length,
    minTokenCount: tokenCounts.length ? Math.min(...tokenCounts) : 0,
    maxTokenCount: tokenCounts.length ? Math.max(...tokenCounts) : 0,
    averageTokenCount: chunks.length ? Math.round(total / chunks.length) : 0,
    totalTokenCount: total,
    codeChunkCount: chunks.filter((c) => c.metadata.isCode).length,
    smallChunkCount: 0,
    largeChunkCount: 0,
  };
}
