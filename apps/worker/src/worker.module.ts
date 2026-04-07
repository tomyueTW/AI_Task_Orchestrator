import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from '@app/queue';
import { ObservabilityModule } from '@app/observability';
import { CostGovernorModule } from '@app/cost-governor';
import { RouterModule } from '@app/router';
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
    RouterModule,
  ],
  providers: [FairScheduler],
})
export class WorkerModule {}
