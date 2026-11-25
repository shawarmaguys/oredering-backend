import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger('PrismaService');
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    const pool = new Pool({
      connectionString,
    });

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

    this.pool = pool;

    this.$on('query' as never, ((e: any) => {
      this.logger.log(
        `[QUERY] ${e.duration}ms | ${e.query}`,
      );
    }) as never);

    this.$on('info' as never, ((e: any) => {
      this.logger.log(`[INFO] ${e.message}`);
    }) as never);

    this.$on('warn' as never, ((e: any) => {
      this.logger.warn(`[WARN] ${e.message}`);
    }) as never);

    this.$on('error' as never, ((e: any) => {
      this.logger.error(`[ERROR] ${e.message}`);
    }) as never);
  }

  async onModuleInit() {
    this.logger.log('[Prisma] Connecting to PostgreSQL database...');

    await this.$connect();

    this.logger.log('[Prisma] Connected to database');
  }

  async onModuleDestroy() {
    this.logger.log('[Prisma] Disconnecting from database...');

    await this.$disconnect();
    await this.pool.end();
  }
}