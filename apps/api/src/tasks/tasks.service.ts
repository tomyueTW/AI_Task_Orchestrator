import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, TASK_QUEUE } from '@app/queue';

@Injectable()
export class TasksService {
  constructor(@InjectQueue(TASK_QUEUE) private readonly taskQueue: Queue) {}

  async create(payload: Record<string, unknown>): Promise<Task> {
    const id = uuidv4();
    const createdAt = new Date().toISOString();

    await this.taskQueue.add(
      'process',
      { id, payload, createdAt },
      { jobId: id },
    );

    return {
      id,
      status: TaskStatus.PENDING,
      payload,
      createdAt,
    };
  }
}
