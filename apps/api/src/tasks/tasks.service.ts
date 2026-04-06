import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, TASK_QUEUE, TASK_DLQ } from '@app/queue';

const STATE_MAP: Record<string, TaskStatus> = {
  waiting: TaskStatus.PENDING,
  'waiting-children': TaskStatus.PENDING,
  delayed: TaskStatus.PENDING,
  prioritized: TaskStatus.PENDING,
  active: TaskStatus.ACTIVE,
  completed: TaskStatus.COMPLETED,
  failed: TaskStatus.FAILED,
};

@Injectable()
export class TasksService {
  constructor(
    @InjectQueue(TASK_QUEUE) private readonly taskQueue: Queue,
    @InjectQueue(TASK_DLQ) private readonly dlqQueue: Queue,
  ) {}

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

  async findOne(id: string): Promise<Task> {
    const job = await this.taskQueue.getJob(id);
    if (!job) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    const state = await job.getState();

    return {
      id: job.opts.jobId as string,
      status: STATE_MAP[state] ?? TaskStatus.PENDING,
      payload: job.data.payload,
      createdAt: job.data.createdAt,
    };
  }

  async findDlq(): Promise<unknown[]> {
    const jobs = await this.dlqQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
    return jobs.map((job) => ({
      dlqJobId: job.id,
      originalJobId: job.data.originalJobId,
      payload: job.data.payload,
      failedReason: job.data.failedReason,
      failedAt: job.data.failedAt,
      createdAt: job.data.createdAt,
    }));
  }

  async retryFromDlq(dlqJobId: string): Promise<Task> {
    const dlqJob = await this.dlqQueue.getJob(dlqJobId);
    if (!dlqJob) {
      throw new NotFoundException(`DLQ job ${dlqJobId} not found`);
    }

    const { payload, createdAt } = dlqJob.data;
    const id = uuidv4();

    await this.taskQueue.add(
      'process',
      { id, payload, createdAt },
      { jobId: id },
    );

    await dlqJob.remove();

    return {
      id,
      status: TaskStatus.PENDING,
      payload,
      createdAt,
    };
  }
}
