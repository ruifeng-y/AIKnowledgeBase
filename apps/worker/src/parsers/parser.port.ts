export interface ParserInput {
  documentId: string;
  documentVersionId: string;
  mimeType: string;
  filename: string;
  content: Buffer;
}

export interface ParsedSection {
  title?: string;
  level?: number;
  content: string;
  order: number;
}

export interface ParsedDocument {
  title?: string;
  text: string;
  sections: ParsedSection[];
  metadata: Record<string, unknown>;
}

export interface DocumentParser {
  supports(input: { mimeType: string; filename: string }): boolean;
  parse(input: ParserInput): Promise<ParsedDocument>;
}

export type ParserErrorCode =
  | 'DOCUMENT_PARSER_NOT_FOUND'
  | 'DOCUMENT_PARSE_ERROR'
  | 'DOCUMENT_NO_EXTRACTABLE_TEXT'
  | 'DOCUMENT_PROCESSING_ERROR'
  | 'DOCUMENT_STORAGE_ERROR';

export class ParserError extends Error {
  constructor(
    readonly code: ParserErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ParserError';
  }
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function normalizeSectionContent(text: string): string {
  return normalizeNewlines(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeParsedSections(
  sections: Array<{ title?: string; level?: number; content: string; order?: number }>,
): ParsedSection[] {
  return sections
    .map((section, index) => ({
      title: section.title?.trim() || undefined,
      level: section.level,
      content: normalizeSectionContent(section.content),
      order: index,
    }))
    .filter((section) => section.content.length > 0)
    .map((section, index) => ({ ...section, order: index }));
}
