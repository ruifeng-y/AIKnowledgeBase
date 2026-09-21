export { prisma, disconnectPrisma } from './client';
export * from './types';
export * from './repositories';
export * from './processing.repository';
export * from './chunk.repository';

/** Package marker retained for skeleton compatibility. */
export const DB_PACKAGE = '@akb/db' as const;
