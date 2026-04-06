import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TASK_DLQ } from './task.interface';

export const REDIS_CONNECTION = 'REDIS_CONNECTION';

export interface RedisConnectionConfig {
  host: string;
  port: number;
}

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    BullModule.registerQueue({
      name: TASK_DLQ,
    }),
  ],
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RedisConnectionConfig => ({
        host: config.get<string>('REDIS_HOST', 'localhost'),
        port: parseInt(config.get('REDIS_PORT', '6379'), 10),
      }),
    },
  ],
  exports: [BullModule, REDIS_CONNECTION],
})
export class QueueModule {}
