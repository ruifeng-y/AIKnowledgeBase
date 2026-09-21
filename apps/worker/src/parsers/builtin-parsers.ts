import {
  normalizeNewlines,
  normalizeParsedSections,
  ParserError,
  type DocumentParser,
  type ParsedDocument,
  type ParserInput,
} from './parser.port';

export class PlainTextParser implements DocumentParser {
  supports(input: { mimeType: string; filename: string }): boolean {
    return input.mimeType === 'text/plain' || input.filename.toLowerCase().endsWith('.txt');
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const text = normalizeNewlines(input.content.toString('utf8').replace(/^\uFEFF/, ''));
    if (text.trim().length === 0) {
      return { text: '', sections: [], metadata: { parser: 'txt', empty: true } };
    }
    const sections = normalizeParsedSections([{ title: input.filename, level: 1, content: text }]);
    return {
      title: input.filename,
      text,
      sections,
      metadata: { parser: 'txt' },
    };
  }
}

export class MarkdownParser implements DocumentParser {
  supports(input: { mimeType: string; filename: string }): boolean {
    return (
      input.mimeType === 'text/markdown' ||
      input.mimeType === 'text/x-markdown' ||
      input.filename.toLowerCase().endsWith('.md') ||
      input.filename.toLowerCase().endsWith('.markdown')
    );
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const raw = normalizeNewlines(input.content.toString('utf8').replace(/^\uFEFF/, ''));
    const lines = raw.split('\n');
    const sections: Array<{ title?: string; level?: number; content: string }> = [];
    let heading = input.filename;
    let level = 1;
    let buffer: string[] = [];
    let inCode = false;

    const flush = (): void => {
      const content = buffer.join('\n');
      buffer = [];
      if (content.trim().length === 0 && !heading) {
        return;
      }
      sections.push({ title: heading, level, content });
    };

    for (const line of lines) {
      if (line.trimStart().startsWith('```')) {
        inCode = !inCode;
        buffer.push(line);
        continue;
      }
      if (!inCode) {
        const match = /^(#{1,6})\s+(.*)$/.exec(line);
        if (match) {
          flush();
          level = match[1]?.length ?? 1;
          heading = (match[2] ?? '').trim();
          buffer = [];
          continue;
        }
      }
      buffer.push(line);
    }
    flush();

    const normalized = normalizeParsedSections(sections);
    return {
      title: sections[0]?.title ?? input.filename,
      text: raw,
      sections: normalized,
      metadata: { parser: 'markdown', headingCount: sections.filter((s) => s.title).length },
    };
  }
}

function stripHtmlTags(html: string): {
  text: string;
  sections: Array<{ title?: string; level?: number; content: string }>;
} {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const headings: Array<{ level: number; title: string; start: number; end: number }> = [];
  const headingRe = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(cleaned)) !== null) {
    const title = match[2] ?? '';
    headings.push({
      level: Number(match[1] ?? 1),
      title: title
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (headings.length === 0) {
    const text = cleaned
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
    return { text, sections: text ? [{ title: undefined, content: text }] : [] };
  }

  const sections: Array<{ title?: string; level?: number; content: string }> = [];
  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i]!;
    const nextStart = headings[i + 1]?.start ?? cleaned.length;
    const bodyHtml = cleaned.slice(current.end, nextStart);
    const body = bodyHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
    sections.push({ title: current.title, level: current.level, content: body || current.title });
  }

  const text = sections
    .map((section) => (section.title ? `# ${section.title}\n${section.content}` : section.content))
    .join('\n\n');
  return { text, sections };
}

export class HtmlParser implements DocumentParser {
  supports(input: { mimeType: string; filename: string }): boolean {
    return (
      input.mimeType === 'text/html' ||
      input.mimeType === 'application/xhtml+xml' ||
      input.filename.toLowerCase().endsWith('.html') ||
      input.filename.toLowerCase().endsWith('.htm')
    );
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const html = input.content.toString('utf8');
    const { text, sections } = stripHtmlTags(html);
    return {
      title: input.filename,
      text,
      sections: normalizeParsedSections(sections),
      metadata: { parser: 'html' },
    };
  }
}

export class JsonParser implements DocumentParser {
  supports(input: { mimeType: string; filename: string }): boolean {
    return (
      input.mimeType === 'application/json' ||
      input.mimeType === 'text/json' ||
      input.filename.toLowerCase().endsWith('.json')
    );
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const raw = input.content.toString('utf8');
    if (raw.trim().length === 0) {
      throw new ParserError('DOCUMENT_PARSE_ERROR', 'Empty JSON document', false);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ParserError('DOCUMENT_PARSE_ERROR', 'Invalid JSON document', false);
    }
    const normalized = JSON.stringify(parsed, null, 2);
    const sections = normalizeParsedSections([
      { title: input.filename, level: 1, content: normalized },
    ]);
    return {
      title: input.filename,
      text: normalized,
      sections,
      metadata: { parser: 'json' },
    };
  }
}

/** Lightweight embedded-text extractor for text-based PDFs (no OCR). */
export class PdfParser implements DocumentParser {
  supports(input: { mimeType: string; filename: string }): boolean {
    return input.mimeType === 'application/pdf' || input.filename.toLowerCase().endsWith('.pdf');
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const buffer = input.content;
    if (buffer.length < 5 || buffer.subarray(0, 4).toString('latin1') !== '%PDF') {
      throw new ParserError('DOCUMENT_PARSE_ERROR', 'Invalid PDF document', false);
    }

    let extracted = '';
    try {
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      extracted = result.text ?? '';
    } catch {
      extracted = extractPdfTextFallback(buffer);
    }

    const text = normalizeNewlines(extracted).trim();
    if (text.length === 0) {
      throw new ParserError('DOCUMENT_NO_EXTRACTABLE_TEXT', 'PDF has no extractable text', false);
    }

    const sections = normalizeParsedSections([{ title: input.filename, level: 1, content: text }]);
    return {
      title: input.filename,
      text,
      sections,
      metadata: { parser: 'pdf' },
    };
  }
}

function extractPdfTextFallback(buffer: Buffer): string {
  const latin = buffer.toString('latin1');
  const strings: string[] = [];
  const tj = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tj.exec(latin)) !== null) {
    const raw = match[0];
    const inner = raw.slice(raw.indexOf('(') + 1, raw.lastIndexOf(')'));
    strings.push(
      inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\(.)/g, '$1'),
    );
  }
  return strings.join('\n');
}

export class DocxParser implements DocumentParser {
  supports(input: { mimeType: string; filename: string }): boolean {
    return (
      input.mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      input.filename.toLowerCase().endsWith('.docx')
    );
  }

  async parse(input: ParserInput): Promise<ParsedDocument> {
    const sections = await parseDocxBuffer(input);
    if (sections.every((section) => section.content.trim().length === 0)) {
      throw new ParserError('DOCUMENT_NO_EXTRACTABLE_TEXT', 'DOCX has no extractable text', false);
    }
    const normalized = normalizeParsedSections(sections);
    return {
      title: input.filename,
      text: normalized
        .map((s) => (s.title ? `# ${s.title}\n${s.content}` : s.content))
        .join('\n\n'),
      sections: normalized,
      metadata: { parser: 'docx' },
    };
  }
}

async function parseDocxBuffer(
  input: ParserInput,
): Promise<Array<{ title?: string; level?: number; content: string }>> {
  try {
    const mammoth = require('mammoth') as {
      extractRawText: (arg: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const result = await mammoth.extractRawText({ buffer: input.content });
    const text = normalizeNewlines(result.value ?? '').trim();
    if (!text) {
      return [{ title: input.filename, content: '' }];
    }
    return [{ title: input.filename, level: 1, content: text }];
  } catch {
    const xml = extractDocxXmlFallback(input.content);
    if (!xml) {
      throw new ParserError('DOCUMENT_PARSE_ERROR', 'Unable to parse DOCX', false);
    }
    return docxXmlToSections(xml, input.filename);
  }
}

function extractDocxXmlFallback(buffer: Buffer): string | null {
  const latin = buffer.toString('latin1');
  const texts = [...latin.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1] ?? '');
  if (texts.length === 0) {
    return null;
  }
  return texts.join(' ');
}

function docxXmlToSections(
  xml: string,
  filename: string,
): Array<{ title?: string; level?: number; content: string }> {
  const paragraphs = [...xml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)].map((m) => m[0] ?? '');
  if (paragraphs.length === 0) {
    return [{ title: filename, level: 1, content: xml.trim() }];
  }
  const sections: Array<{ title?: string; level?: number; content: string }> = [];
  let currentTitle = filename;
  let currentLevel = 1;
  let buffer: string[] = [];

  const flush = (): void => {
    const content = buffer.join('\n').trim();
    buffer = [];
    if (content.length > 0 || currentTitle) {
      sections.push({ title: currentTitle, level: currentLevel, content });
    }
  };

  for (const paragraph of paragraphs) {
    const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/i.exec(paragraph);
    const style = styleMatch?.[1]?.toUpperCase() ?? '';
    const text = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((m) => m[1] ?? '')
      .join('')
      .trim();

    const headingLevel = /^HEADING(\d)$/.exec(style);
    if (headingLevel) {
      flush();
      currentLevel = Number(headingLevel[1] ?? 1);
      currentTitle = text || currentTitle;
      continue;
    }
    buffer.push(text);
  }
  flush();
  return sections;
}
