export enum TaskStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface Task {
  id: string;
  status: TaskStatus;
  payload: Record<string, unknown>;
  createdAt: string;
}

export const TASK_QUEUE = 'tasks';
