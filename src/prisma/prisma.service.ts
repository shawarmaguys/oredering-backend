import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    this.logger.log('[Prisma] Connecting to PostgreSQL database...');
    
    (this as any).$on('query', (e: any) => {
      if (e.duration >= 150) {
        this.logger.warn(`[Prisma SLOW QUERY] (${e.duration}ms) ${e.query}`);
      } else {
        this.logger.debug(`[Prisma Query] (${e.duration}ms) ${e.query}`);
      }
    });

    (this as any).$on('info', (e: any) => this.logger.log(`[Prisma Info] ${e.message}`));
    (this as any).$on('warn', (e: any) => this.logger.warn(`[Prisma Warning] ${e.message}`));
    (this as any).$on('error', (e: any) => this.logger.error(`[Prisma Error] ${e.message}`));

    await this.$connect();
    this.logger.log('[Prisma] Connected to database');
  }

  async onModuleDestroy() {
    this.logger.log('[Prisma] Disconnecting from database...');
    await this.$disconnect();
  }
}

