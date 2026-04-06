export enum TaskStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum TaskPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export const PRIORITY_MAP: Record<TaskPriority, number> = {
  [TaskPriority.CRITICAL]: 1,
  [TaskPriority.HIGH]: 2,
  [TaskPriority.NORMAL]: 3,
  [TaskPriority.LOW]: 4,
};

export interface Task {
  id: string;
  userId: string;
  priority: TaskPriority;
  status: TaskStatus;
  payload: Record<string, unknown>;
  createdAt: string;
}

export const TASK_QUEUE_PREFIX = 'tasks-user-';
export const TASK_DLQ = 'tasks-dlq';

export function getUserQueueName(userId: string): string {
  return `${TASK_QUEUE_PREFIX}${userId}`;
}
