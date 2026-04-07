import { Inject, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskType,
  PRIORITY_MAP,
  TASK_DLQ,
  getUserQueueName,
} from '@app/queue';
import { REDIS_CONNECTION, RedisConnectionConfig } from '@app/queue/queue.module';

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
export class TasksService implements OnModuleDestroy {
  private readonly userQueues = new Map<string, Queue>();
  private readonly defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 1000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redisConfig: RedisConnectionConfig,
    @InjectQueue(TASK_DLQ) private readonly dlqQueue: Queue,
  ) {}

  private getQueue(userId: string): Queue {
    const existing = this.userQueues.get(userId);
    if (existing) return existing;

    const queue = new Queue(getUserQueueName(userId), {
      connection: this.redisConfig,
      defaultJobOptions: this.defaultJobOptions,
    });
    this.userQueues.set(userId, queue);
    return queue;
  }

  async create(
    userId: string,
    payload: Record<string, unknown>,
    priority: TaskPriority = TaskPriority.NORMAL,
    model?: string,
    taskType?: TaskType,
  ): Promise<Task> {
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const queue = this.getQueue(userId);

    await queue.add(
      'process',
      { id, userId, priority, taskType, model, payload, createdAt },
      { jobId: id, priority: PRIORITY_MAP[priority] },
    );

    return { id, userId, priority, taskType, model, status: TaskStatus.PENDING, payload, createdAt };
  }

  async findOne(id: string, userId: string): Promise<Task> {
    const queue = this.getQueue(userId);
    const job = await queue.getJob(id);
    if (!job) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    const state = await job.getState();

    return {
      id: job.opts.jobId as string,
      userId: job.data.userId,
      priority: job.data.priority ?? TaskPriority.NORMAL,
      status: STATE_MAP[state] ?? TaskStatus.PENDING,
      payload: job.data.payload,
      createdAt: job.data.createdAt,
    };
  }

  async getQueueDepth(userId: string): Promise<number> {
    const queue = this.getQueue(userId);
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    return waiting + active;
  }

  async findDlq(): Promise<unknown[]> {
    const jobs = await this.dlqQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
    return jobs.map((job) => ({
      dlqJobId: job.id,
      originalJobId: job.data.originalJobId,
      userId: job.data.userId,
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

    const { userId, priority, payload, createdAt } = dlqJob.data;
    const taskPriority = priority ?? TaskPriority.NORMAL;
    const id = uuidv4();
    const queue = this.getQueue(userId);

    await queue.add(
      'process',
      { id, userId, priority: taskPriority, payload, createdAt },
      { jobId: id, priority: PRIORITY_MAP[taskPriority as TaskPriority] },
    );

    await dlqJob.remove();

    return { id, userId, priority: taskPriority, status: TaskStatus.PENDING, payload, createdAt };
  }

  async onModuleDestroy() {
    const closePromises = Array.from(this.userQueues.values()).map((q) => q.close());
    await Promise.all(closePromises);
  }
}
