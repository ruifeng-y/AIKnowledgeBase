/** Application layer may only depend on domain ports, not infrastructure SDKs. */
export type {
  KnowledgeSpaceRepositoryPort,
  KnowledgeSpaceRecord,
} from '../domain/knowledge-space-repository.port';
export { KNOWLEDGE_SPACE_REPOSITORY } from '../domain/knowledge-space-repository.port';
