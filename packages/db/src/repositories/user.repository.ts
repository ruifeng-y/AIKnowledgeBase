import type { Prisma, User } from '@prisma/client';
import { prisma } from '../client';

export const userRepository = {
  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  },

  list(limit = 50): Promise<User[]> {
    return prisma.user.findMany({ take: limit, orderBy: { createdAt: 'desc' } });
  },
};
