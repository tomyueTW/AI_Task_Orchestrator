import { Module } from '@nestjs/common';
import { QueueModule } from '@app/queue';
import { IdempotencyModule } from '@app/idempotency';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { BackpressureGuard } from './guards/backpressure.guard';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';

@Module({
  imports: [QueueModule, IdempotencyModule],
  controllers: [TasksController],
  providers: [TasksService, BackpressureGuard, IdempotencyInterceptor],
})
export class TasksModule {}
