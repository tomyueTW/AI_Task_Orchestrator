import { TaskType } from '@app/queue';

export interface DagNodeInput {
  id: string;
  payload: Record<string, unknown>;
  dependsOn?: string[];
  taskType?: TaskType;
  model?: string;
}

export interface DagNodeState {
  id: string;
  dependsOn: string[];
  payload: Record<string, unknown>;
  taskType?: TaskType;
  model?: string;
  jobId?: string;
  status: 'pending' | 'ready' | 'active' | 'completed' | 'failed';
  result?: unknown;
  failedReason?: string;
}

export interface DagMeta {
  dagId: string;
  userId: string;
  createdAt: string;
  nodeIds: string[];
  layers: string[][];
}
