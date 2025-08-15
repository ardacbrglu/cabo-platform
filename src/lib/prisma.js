// /src/lib/prisma.js
// SECURITY REVIEW: Ensure database credentials are stored securely in environment variables. Avoid logging sensitive queries or data.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
// NOTE: In serverless environments, ensure you do not create too many PrismaClient instances. Review deployment best practices for your hosting provider.
