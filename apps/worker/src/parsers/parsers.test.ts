import { describe, expect, it } from 'vitest';
import {
  DocxParser,
  HtmlParser,
  JsonParser,
  MarkdownParser,
  PdfParser,
  PlainTextParser,
} from './builtin-parsers';
import { ParserError } from './parser.port';
import { ParserRegistry } from './parser-registry';

const baseInput = {
  documentId: 'd1',
  documentVersionId: 'v1',
  filename: 'sample',
};

describe('parsers', () => {
  it('TXT normalizes newlines and BOM', async () => {
    const parser = new PlainTextParser();
    const result = await parser.parse({
      ...baseInput,
      filename: 'a.txt',
      mimeType: 'text/plain',
      content: Buffer.from('﻿line1\r\nline2\rline3', 'utf8'),
    });
    expect(result.text).toBe('line1\nline2\nline3');
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it('Markdown extracts headings and keeps code blocks', async () => {
    const parser = new MarkdownParser();
    const md = '# Title\n\nintro\n\n```js\ncode()\n```\n\n## Sub\n\nbody\n';
    const result = await parser.parse({
      ...baseInput,
      filename: 'a.md',
      mimeType: 'text/markdown',
      content: Buffer.from(md, 'utf8'),
    });
    expect(result.sections.map((s) => s.title)).toEqual(expect.arrayContaining(['Title', 'Sub']));
    expect(result.text).toContain('code()');
  });

  it('HTML strips script/style and extracts headings', async () => {
    const parser = new HtmlParser();
    const html =
      '<html><head><style>b{}</style><script>var x=1;</script></head><body><h1>H1</h1><p>text</p><h2>H2</h2><p>more</p></body></html>';
    const result = await parser.parse({
      ...baseInput,
      filename: 'a.html',
      mimeType: 'text/html',
      content: Buffer.from(html, 'utf8'),
    });
    expect(result.sections.some((s) => s.title === 'H1')).toBe(true);
    expect(result.text).not.toContain('var x=1');
    expect(result.text).not.toContain('<h1>');
  });

  it('JSON parses valid document', async () => {
    const parser = new JsonParser();
    const result = await parser.parse({
      ...baseInput,
      filename: 'a.json',
      mimeType: 'application/json',
      content: Buffer.from(JSON.stringify({ a: 1, b: 'x' }), 'utf8'),
    });
    expect(result.sections.length).toBe(1);
    expect(result.text).toContain('"a": 1');
  });

  it('JSON rejects malformed document', async () => {
    const parser = new JsonParser();
    await expect(
      parser.parse({
        ...baseInput,
        filename: 'bad.json',
        mimeType: 'application/json',
        content: Buffer.from('{invalid', 'utf8'),
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_PARSE_ERROR' });
  });

  it('PDF extracts text from simple pdf', async () => {
    const parser = new PdfParser();
    const pdf = buildSimplePdf('Hello PDF content');
    const result = await parser.parse({
      ...baseInput,
      filename: 'a.pdf',
      mimeType: 'application/pdf',
      content: pdf,
    });
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('PDF without extractable text fails', async () => {
    const parser = new PdfParser();
    const pdf = buildSimplePdf('');
    await expect(
      parser.parse({
        ...baseInput,
        filename: 'empty.pdf',
        mimeType: 'application/pdf',
        content: pdf,
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_NO_EXTRACTABLE_TEXT' });
  });

  it('DOCX extracts text', async () => {
    const parser = new DocxParser();
    const docx = await buildSimpleDocx();
    const result = await parser.parse({
      ...baseInput,
      filename: 'a.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      content: docx,
    });
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it('registry raises DOCUMENT_PARSER_NOT_FOUND', () => {
    const registry = new ParserRegistry([]);
    const full = new ParserRegistry();
    expect(() => registry.resolve({ mimeType: 'text/plain', filename: 'a.txt' })).toThrow(
      ParserError,
    );
    expect(() => full.resolve({ mimeType: 'application/unknown', filename: 'x.bin' })).toThrow(
      ParserError,
    );
  });
});

function buildSimplePdf(text: string): Buffer {
  const content =
    text.length > 0 ? `BT /F1 12 Tf 100 700 Td (${text}) Tj ET` : `BT /F1 12 Tf 100 700 Td Tj ET`;
  const stream = `${content}`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}

async function buildSimpleDocx(): Promise<Buffer> {
  // Prefer mammoth-compatible zip when available; fallback uses uncompressed zip-like buffer
  // that our fallback extractor can read after `word/document.xml` marker.
  try {
    const AdmZip = (await import('adm-zip' as string)) as unknown as {
      default: new () => {
        addFile(name: string, data: Buffer): void;
        toBuffer(): Buffer;
      };
    };
    const zip = new AdmZip.default();
    const xml = `<?xml version="1.0"?><w:document><w:body>
      <w:p><w:pStyle w:val="Heading1"/><w:r><w:t>Doc Title</w:t></w:r></w:p>
      <w:p><w:r><w:t>Hello docx body</w:t></w:r></w:p>
    </w:body></w:document>`;
    zip.addFile('word/document.xml', Buffer.from(xml, 'utf8'));
    return zip.toBuffer();
  } catch {
    // Minimal pseudo-zip containing uncompressed word/document.xml marker + XML payload.
    const xml = 'PK\x03\x04word/document.xml<w:t>Doc Title</w:t><w:t>Hello docx body</w:t>';
    return Buffer.from(xml, 'latin1');
  }
}
