import { Inject, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { FlowJob, FlowProducer, Queue } from 'bullmq';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  TaskPriority,
  TaskStatus,
  PRIORITY_MAP,
  getUserQueueName,
} from '@app/queue';
import { REDIS_CONNECTION, RedisConnectionConfig } from '@app/queue/queue.module';
import { topologicalLayers, DagCoordinator, DagMeta, DagNodeInput } from '@app/workflow';
import { CreateChainDto } from './dto/create-chain.dto';
import { CreateDagDto } from './dto/create-dag.dto';

const STATE_MAP: Record<string, TaskStatus> = {
  waiting: TaskStatus.PENDING,
  'waiting-children': TaskStatus.PENDING,
  delayed: TaskStatus.PENDING,
  prioritized: TaskStatus.PENDING,
  active: TaskStatus.ACTIVE,
  completed: TaskStatus.COMPLETED,
  failed: TaskStatus.FAILED,
};

export interface WorkflowMeta {
  workflowId: string;
  userId: string;
  stepJobIds: string[];
  stepNames: string[];
  createdAt: string;
}

export interface WorkflowStatusStep {
  jobId: string;
  name: string;
  status: TaskStatus;
  result?: unknown;
  failedReason?: string;
}

export interface WorkflowStatus {
  workflowId: string;
  userId: string;
  createdAt: string;
  steps: WorkflowStatusStep[];
}

export interface DagStatusNode {
  id: string;
  jobId?: string;
  status: string;
  result?: unknown;
  failedReason?: string;
}

export interface DagStatus {
  dagId: string;
  userId: string;
  createdAt: string;
  layers: string[][];
  nodes: DagStatusNode[];
}

@Injectable()
export class WorkflowsService implements OnModuleDestroy {
  private readonly flowProducer: FlowProducer;
  private readonly redis: Redis;
  private readonly userQueues = new Map<string, Queue>();
  private readonly dagCoordinator: DagCoordinator;
  private static readonly META_PREFIX = 'workflow:';
  private static readonly META_TTL_SECONDS = 86400 * 7; // 7 days

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redisConfig: RedisConnectionConfig,
  ) {
    this.flowProducer = new FlowProducer({ connection: redisConfig });
    this.redis = new Redis(redisConfig);
    this.dagCoordinator = new DagCoordinator(this.redis);
  }

  private getQueue(userId: string): Queue {
    const existing = this.userQueues.get(userId);
    if (existing) return existing;
    const queue = new Queue(getUserQueueName(userId), { connection: this.redisConfig });
    this.userQueues.set(userId, queue);
    return queue;
  }

  async createChain(dto: CreateChainDto): Promise<WorkflowMeta> {
    const priority = dto.priority ?? TaskPriority.NORMAL;
    const workflowId = uuidv4();
    const createdAt = new Date().toISOString();
    const queueName = getUserQueueName(dto.userId);

    const stepJobIds = dto.steps.map(() => uuidv4());
    const stepNames = dto.steps.map((s) => s.name);

    // Build BullMQ Flow tree leaf-first:
    // steps[0] is the leaf (runs first); steps[N-1] is the root (runs last).
    // BullMQ executes children before parents, so we wrap each step as parent of the previous.
    const buildNode = (index: number): FlowJob => {
      const step = dto.steps[index];
      const node: FlowJob = {
        name: 'process',
        queueName,
        data: {
          id: stepJobIds[index],
          userId: dto.userId,
          priority,
          taskType: step.taskType,
          model: step.model,
          payload: step.payload,
          createdAt,
          workflowId,
          stepName: step.name,
          stepIndex: index,
        },
        opts: {
          jobId: stepJobIds[index],
          priority: PRIORITY_MAP[priority],
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      };
      if (index > 0) {
        node.children = [buildNode(index - 1)];
      }
      return node;
    };

    const tree = buildNode(dto.steps.length - 1);
    await this.flowProducer.add(tree);

    const meta: WorkflowMeta = {
      workflowId,
      userId: dto.userId,
      stepJobIds,
      stepNames,
      createdAt,
    };

    await this.redis.set(
      `${WorkflowsService.META_PREFIX}${workflowId}`,
      JSON.stringify(meta),
      'EX',
      WorkflowsService.META_TTL_SECONDS,
    );

    return meta;
  }

  async findOne(workflowId: string): Promise<WorkflowStatus> {
    const raw = await this.redis.get(`${WorkflowsService.META_PREFIX}${workflowId}`);
    if (!raw) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }

    const meta = JSON.parse(raw) as WorkflowMeta;
    const queue = this.getQueue(meta.userId);

    const steps: WorkflowStatusStep[] = [];
    for (let i = 0; i < meta.stepJobIds.length; i++) {
      const jobId = meta.stepJobIds[i];
      const job = await queue.getJob(jobId);
      if (!job) {
        steps.push({ jobId, name: meta.stepNames[i], status: TaskStatus.PENDING });
        continue;
      }
      const state = await job.getState();
      steps.push({
        jobId,
        name: meta.stepNames[i],
        status: STATE_MAP[state] ?? TaskStatus.PENDING,
        result: job.returnvalue,
        failedReason: job.failedReason,
      });
    }

    return {
      workflowId: meta.workflowId,
      userId: meta.userId,
      createdAt: meta.createdAt,
      steps,
    };
  }

  async createDag(dto: CreateDagDto): Promise<DagMeta> {
    const priority = dto.priority ?? TaskPriority.NORMAL;
    const dagId = uuidv4();
    const createdAt = new Date().toISOString();

    const nodeInputs: DagNodeInput[] = dto.nodes.map((n) => ({
      id: n.id,
      dependsOn: n.dependsOn ?? [],
      payload: n.payload,
      taskType: n.taskType,
      model: n.model,
    }));

    // Validate + compute parallel execution layers (throws on cycle/missing dep)
    const layers = topologicalLayers(nodeInputs);

    const meta: DagMeta = {
      dagId,
      userId: dto.userId,
      createdAt,
      nodeIds: nodeInputs.map((n) => n.id),
      layers,
    };

    await this.dagCoordinator.persist(meta, nodeInputs);

    // Enqueue layer 0 nodes (zero dependencies) — downstream layers are triggered
    // by the worker's DagCoordinator as upstream jobs complete.
    const queue = this.getQueue(dto.userId);
    const rootNodes = nodeInputs.filter((n) => (n.dependsOn?.length ?? 0) === 0);
    for (const n of rootNodes) {
      const jobId = uuidv4();
      await this.dagCoordinator.setJobId(dagId, n.id, jobId);
      await queue.add(
        'process',
        {
          id: jobId,
          userId: dto.userId,
          priority,
          taskType: n.taskType,
          model: n.model,
          payload: n.payload,
          createdAt,
          dagId,
          dagNodeId: n.id,
        },
        {
          jobId,
          priority: PRIORITY_MAP[priority],
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      );
    }

    return meta;
  }

  async findDag(dagId: string): Promise<DagStatus> {
    const meta = await this.dagCoordinator.getMeta(dagId);
    if (!meta) {
      throw new NotFoundException(`DAG ${dagId} not found`);
    }
    const statuses = await this.dagCoordinator.getAllStatuses(dagId);
    const jobIds = await this.dagCoordinator.getJobIds(dagId);
    const results = await this.dagCoordinator.getResults(dagId, meta.nodeIds);
    const failures = await this.dagCoordinator.getFailures(dagId);

    const nodes: DagStatusNode[] = meta.nodeIds.map((id) => ({
      id,
      jobId: jobIds[id],
      status: statuses[id] ?? 'pending',
      result: results[id] ?? undefined,
      failedReason: failures[id],
    }));

    return {
      dagId: meta.dagId,
      userId: meta.userId,
      createdAt: meta.createdAt,
      layers: meta.layers,
      nodes,
    };
  }

  async onModuleDestroy() {
    await this.flowProducer.close();
    const closePromises = Array.from(this.userQueues.values()).map((q) => q.close());
    await Promise.all(closePromises);
    await this.redis.quit();
  }
}
