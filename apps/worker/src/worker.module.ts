import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from '@app/queue';
import { ObservabilityModule } from '@app/observability';
import { FairScheduler } from './fair-scheduler.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    QueueModule,
    ObservabilityModule,
  ],
  providers: [FairScheduler],
})
export class WorkerModule {}
