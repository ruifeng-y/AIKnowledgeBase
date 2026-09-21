import type {
  EmbeddingProviderPort,
  GenerateRequest,
  GenerateResult,
  LLMProviderPort,
  RerankResult,
  RerankerProviderPort,
} from './ai-provider.ports';

function deterministicVector(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const idx = i % dimensions;
    vector[idx] = (vector[idx] ?? 0) + (code % 97) / 97;
  }
  return vector;
}

export class MockEmbeddingProvider implements EmbeddingProviderPort {
  constructor(
    private readonly modelName = 'mock-embedding',
    private readonly dims = 8,
  ) {}

  model(): string {
    return this.modelName;
  }

  dimensions(): number {
    return this.dims;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => deterministicVector(text, this.dims));
  }
}

export class MockRerankerProvider implements RerankerProviderPort {
  constructor(private readonly modelName = 'mock-reranker') {}

  model(): string {
    return this.modelName;
  }

  async rerank(query: string, documents: string[]): Promise<RerankResult[]> {
    const q = query.toLowerCase();
    return documents
      .map((doc, index) => {
        const lower = doc.toLowerCase();
        let score = 0;
        for (const token of q.split(/\s+/).filter(Boolean)) {
          if (lower.includes(token)) {
            score += 1;
          }
        }
        return { index, score };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index);
  }
}

export class MockLLMProvider implements LLMProviderPort {
  constructor(private readonly modelName = 'mock-llm') {}

  model(): string {
    return this.modelName;
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    return {
      text: `[mock:${this.modelName}] ${request.prompt}`,
      model: this.modelName,
    };
  }
}
