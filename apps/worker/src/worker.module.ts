import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from '@app/queue';
import { ObservabilityModule } from '@app/observability';
import { CostGovernorModule } from '@app/cost-governor';
import { FairScheduler } from './fair-scheduler.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    QueueModule,
    ObservabilityModule,
    CostGovernorModule,
  ],
  providers: [FairScheduler],
})
export class WorkerModule {}
