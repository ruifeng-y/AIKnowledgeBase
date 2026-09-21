import { MockRerankerProvider } from '../../modules/retrieval/domain/reranker.port';
import type {
  RerankerIdentity,
  RerankerProviderPort,
  RerankInput,
  RerankResult,
} from '../../modules/retrieval/domain/reranker.port';
import { sliceRerankBatches } from '../../modules/retrieval/domain/reranker.port';
import { mockRerankScore } from '../../modules/retrieval/domain/reranker.port';

/**
 * Infrastructure adapter implementing domain RerankerProviderPort.
 * Mock only — not a production semantic reranker.
 */
export class InfraMockRerankerProvider implements RerankerProviderPort {
  private readonly delegate: MockRerankerProvider;

  constructor(identity: RerankerIdentity) {
    this.delegate = new MockRerankerProvider(identity);
  }

  identity(): RerankerIdentity {
    return this.delegate.identity();
  }

  async rerank(inputs: RerankInput[]): Promise<RerankResult[]> {
    return this.delegate.rerank(inputs);
  }
}

export { MockRerankerProvider, mockRerankScore, sliceRerankBatches };
