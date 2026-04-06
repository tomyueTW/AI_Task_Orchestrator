export enum TaskStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface Task {
  id: string;
  userId: string;
  status: TaskStatus;
  payload: Record<string, unknown>;
  createdAt: string;
}

export const TASK_QUEUE_PREFIX = 'tasks-user-';
export const TASK_DLQ = 'tasks-dlq';

export function getUserQueueName(userId: string): string {
  return `${TASK_QUEUE_PREFIX}${userId}`;
}
