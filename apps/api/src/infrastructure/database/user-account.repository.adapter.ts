import { Injectable } from '@nestjs/common';
import { userRepository } from '@akb/db';
import type {
  PublicUserRecord,
  UserAccountRepositoryPort,
} from '../../modules/users/domain/user-account.port';

function mapPublic(row: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
}): PublicUserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class UserAccountRepositoryAdapter implements UserAccountRepositoryPort {
  async findById(id: string): Promise<PublicUserRecord | null> {
    const row = await userRepository.findById(id);
    return row ? mapPublic(row) : null;
  }

  async findByEmail(email: string): Promise<{
    id: string;
    email: string;
    passwordHash: string;
    name: string;
    avatarUrl: string | null;
    status: 'ACTIVE' | 'DISABLED';
    createdAt: Date;
  } | null> {
    const row = await userRepository.findByEmail(email);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      avatarUrl: row.avatarUrl,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  async create(input: {
    email: string;
    passwordHash: string;
    name: string;
  }): Promise<PublicUserRecord> {
    const row = await userRepository.create({
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
    });
    return mapPublic(row);
  }
}
