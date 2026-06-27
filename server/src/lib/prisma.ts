import { PrismaClient } from '@prisma/client';

// Single shared Prisma client. In dev with tsx watch we cache it on globalThis
// so hot-reloads don't open new connection pools.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
