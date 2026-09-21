import { ParserError, type DocumentParser, type ParserInput } from './parser.port';
import {
  DocxParser,
  HtmlParser,
  JsonParser,
  MarkdownParser,
  PdfParser,
  PlainTextParser,
} from './builtin-parsers';

export class ParserRegistry {
  private readonly parsers: DocumentParser[];

  constructor(parsers?: DocumentParser[]) {
    this.parsers = parsers ?? [
      new MarkdownParser(),
      new PlainTextParser(),
      new HtmlParser(),
      new JsonParser(),
      new PdfParser(),
      new DocxParser(),
    ];
  }

  resolve(input: { mimeType: string; filename: string }): DocumentParser {
    const parser = this.parsers.find((item) => item.supports(input));
    if (!parser) {
      throw new ParserError(
        'DOCUMENT_PARSER_NOT_FOUND',
        `No parser for mime=${input.mimeType} file=${input.filename}`,
        false,
      );
    }
    return parser;
  }

  async parse(input: ParserInput): Promise<ReturnType<DocumentParser['parse']>> {
    return this.resolve(input).parse(input);
  }
}

export const parserRegistry = new ParserRegistry();
