/** Application layer may only depend on domain ports, not infrastructure SDKs. */
export type { WorkspaceRepositoryPort, WorkspaceRecord } from '../domain/workspace-repository.port';
export { WORKSPACE_REPOSITORY } from '../domain/workspace-repository.port';
