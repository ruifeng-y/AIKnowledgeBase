/** Domain ports must not import NestJS, Prisma, or infrastructure SDKs. */

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
}
