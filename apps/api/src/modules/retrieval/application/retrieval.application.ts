/** Application layer may only depend on domain ports, not infrastructure SDKs. */
export type {
  RetrievalServicePort,
  RetrievalQuery,
  RetrievalHit,
} from '../domain/retrieval-service.port';
export { RETRIEVAL_SERVICE } from '../domain/retrieval-service.port';
