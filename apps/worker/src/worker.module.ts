import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from '@app/queue';
import { TaskProcessor } from './task.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    QueueModule,
  ],
  providers: [TaskProcessor],
})
export class WorkerModule {}
