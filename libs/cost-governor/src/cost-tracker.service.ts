import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '@app/observability';
import { ModelRegistry } from './model-registry';

export interface CostRecord {
  taskId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

@Injectable()
export class CostTrackerService {
  private readonly logger = new Logger(CostTrackerService.name);
  private readonly registry = new ModelRegistry();

  constructor(private readonly metrics: MetricsService) {}

  record(
    taskId: string,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
  ): CostRecord {
    const model = this.registry.getModel(modelId);
    const inputPrice = model?.inputPricePerMToken ?? 0;
    const outputPrice = model?.outputPricePerMToken ?? 0;

    const costUsd =
      (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000;

    this.metrics.taskCostUsd.inc(costUsd);
    this.metrics.taskTokens.inc({ direction: 'input' }, inputTokens);
    this.metrics.taskTokens.inc({ direction: 'output' }, outputTokens);

    this.logger.log(
      `Task ${taskId} | model=${modelId} | tokens=${inputTokens}+${outputTokens} | cost=$${costUsd.toFixed(6)}`,
    );

    return { taskId, model: modelId, inputTokens, outputTokens, costUsd };
  }
}
