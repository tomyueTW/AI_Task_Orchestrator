import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from '@app/queue';
import { ObservabilityModule } from '@app/observability';
import { TaskProcessor } from './task.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    QueueModule,
    ObservabilityModule,
  ],
  providers: [TaskProcessor],
})
export class WorkerModule {}
