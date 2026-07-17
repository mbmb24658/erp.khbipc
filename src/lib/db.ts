import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// In production, only log errors. In dev, log queries too.
const logLevel = process.env.NODE_ENV === 'production'
  ? ['error', 'warn']
  : ['query', 'error', 'warn']

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logLevel as any,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
