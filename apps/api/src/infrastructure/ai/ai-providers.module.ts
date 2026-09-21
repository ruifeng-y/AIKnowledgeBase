import { Inject, Injectable, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../common/config/app-config';
import {
  EMBEDDING_PROVIDER,
  LLM_PROVIDER,
  RERANKER_PROVIDER,
  type EmbeddingProviderPort,
  type LLMProviderPort,
  type RerankerProviderPort,
} from './ai-provider.ports';
import { MockEmbeddingProvider, MockLLMProvider, MockRerankerProvider } from './mock-ai-providers';

@Injectable()
export class AiProviderFactory {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  createEmbeddingProvider(): EmbeddingProviderPort {
    // V0.4-D: only deterministic mocks. Real providers arrive later.
    return new MockEmbeddingProvider(
      this.config.ai.embeddingModel,
      this.config.ai.embeddingDimensions,
    );
  }

  createRerankerProvider(): RerankerProviderPort {
    return new MockRerankerProvider(this.config.ai.rerankerModel);
  }

  createLlmProvider(): LLMProviderPort {
    return new MockLLMProvider(this.config.ai.llmModel);
  }
}

@Module({
  providers: [
    AiProviderFactory,
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: (factory: AiProviderFactory) => factory.createEmbeddingProvider(),
      inject: [AiProviderFactory],
    },
    {
      provide: RERANKER_PROVIDER,
      useFactory: (factory: AiProviderFactory) => factory.createRerankerProvider(),
      inject: [AiProviderFactory],
    },
    {
      provide: LLM_PROVIDER,
      useFactory: (factory: AiProviderFactory) => factory.createLlmProvider(),
      inject: [AiProviderFactory],
    },
  ],
  exports: [EMBEDDING_PROVIDER, RERANKER_PROVIDER, LLM_PROVIDER],
})
export class AiProvidersModule {}
