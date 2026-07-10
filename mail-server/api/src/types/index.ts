import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
  }

  interface FastifyRequest {
    apiKey?: {
      id: string;
      scopes: string[];
      domainId: string | null;
      companyId: string | null;
    };
  }
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
  error?: string;
}
