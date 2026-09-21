export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
export const RERANKER_PROVIDER = Symbol('RERANKER_PROVIDER');
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface EmbeddingProviderPort {
  model(): string;
  dimensions(): number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface RerankResult {
  index: number;
  score: number;
}

export interface RerankerProviderPort {
  model(): string;
  rerank(query: string, documents: string[]): Promise<RerankResult[]>;
}

export interface GenerateRequest {
  system?: string;
  prompt: string;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  model: string;
}

export interface LLMProviderPort {
  model(): string;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}
