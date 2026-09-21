/** Application layer may only depend on domain ports, not infrastructure SDKs. */
export type { UserRepositoryPort, UserRecord } from '../domain/user-repository.port';
export { USER_REPOSITORY } from '../domain/user-repository.port';
