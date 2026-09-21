import { describe, expect, it } from 'vitest';
import { InMemoryObjectStorage } from '../api-storage/in-memory-storage';
import { DocumentProcessingService } from './document-processing.service';
import { ParserRegistry } from '../parsers/parser-registry';
import { PlainTextParser } from '../parsers/builtin-parsers';

describe('DocumentProcessingService (offline)', () => {
  it('processes text into sections via parser pipeline shape', async () => {
    const storage = new InMemoryObjectStorage();
    await storage.put('k', 'hello world', 'text/plain');
    const registry = new ParserRegistry([new PlainTextParser()]);
    const parsed = await registry.parse({
      documentId: 'd',
      documentVersionId: 'v',
      mimeType: 'text/plain',
      filename: 'a.txt',
      content: await storage.get('k'),
    });
    expect(parsed.sections.length).toBeGreaterThan(0);
    expect(parsed.text).toContain('hello world');
  });

  it('service class can be constructed', () => {
    const service = new DocumentProcessingService(new InMemoryObjectStorage());
    expect(service).toBeDefined();
  });
});
