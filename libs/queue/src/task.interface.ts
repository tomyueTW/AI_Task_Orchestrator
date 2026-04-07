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

export enum TaskType {
  SIMPLE = 'simple',
  CODE = 'code',
  COMPLEX = 'complex',
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface Task {
  id: string;
  userId: string;
  priority: TaskPriority;
  status: TaskStatus;
  taskType?: TaskType;
  model?: string;
  tokenUsage?: TokenUsage;
  cost?: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export const TASK_QUEUE_PREFIX = 'tasks-user-';
export const TASK_DLQ = 'tasks-dlq';

export function getUserQueueName(userId: string): string {
  return `${TASK_QUEUE_PREFIX}${userId}`;
}
