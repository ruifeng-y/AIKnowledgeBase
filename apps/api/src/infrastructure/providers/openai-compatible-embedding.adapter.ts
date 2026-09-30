/**
 * Production Embedding adapter — single implementation lives in @akb/ai.
 * Re-exported here so API infrastructure keeps a stable import path.
 */
export {
  HttpEmbeddingAdapter,
  HttpEmbeddingAdapter as OpenAICompatibleEmbeddingAdapter,
  toEmbeddingModelConfig,
} from '@akb/ai';
