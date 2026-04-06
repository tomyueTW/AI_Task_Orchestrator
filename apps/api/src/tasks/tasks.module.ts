import { Module } from '@nestjs/common';
import { QueueModule } from '@app/queue';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [QueueModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
