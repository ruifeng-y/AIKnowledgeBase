import { Module } from '@nestjs/common';

/**
 * Database boundary placeholder.
 * Business modules bind repository ports to @akb/db-backed adapters directly.
 * This module remains as the infrastructure database entrypoint for future use.
 */
@Module({})
export class DatabaseModule {}
