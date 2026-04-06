import { Module } from '@nestjs/common';
import { QueueModule } from '@app/queue';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { BackpressureGuard } from './guards/backpressure.guard';

@Module({
  imports: [QueueModule],
  controllers: [TasksController],
  providers: [TasksService, BackpressureGuard],
})
export class TasksModule {}
