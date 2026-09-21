export interface PublicUserRecord {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export const USER_ACCOUNT_REPOSITORY = Symbol('USER_ACCOUNT_REPOSITORY');

export interface UserAccountRepositoryPort {
  findById(id: string): Promise<PublicUserRecord | null>;
  findByEmail(email: string): Promise<{
    id: string;
    email: string;
    passwordHash: string;
    name: string;
    avatarUrl: string | null;
    status: 'ACTIVE' | 'DISABLED';
    createdAt: Date;
  } | null>;
  create(input: { email: string; passwordHash: string; name: string }): Promise<PublicUserRecord>;
}
