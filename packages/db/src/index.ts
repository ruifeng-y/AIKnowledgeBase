export { prisma, disconnectPrisma } from './client';
export * from './types';
export * from './repositories';

/** Package marker retained for skeleton compatibility. */
export const DB_PACKAGE = '@akb/db' as const;
