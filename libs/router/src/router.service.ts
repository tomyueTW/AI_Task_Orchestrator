import { Injectable, Logger } from '@nestjs/common';
import { TaskType } from '@app/queue';
import { LlmService } from '@app/cost-governor';

const ROUTING_TABLE: Record<TaskType, string[]> = {
  [TaskType.SIMPLE]: ['llama3.2', 'gpt-4o-mini', 'claude-haiku-4-5-20251001'],
  [TaskType.CODE]: ['claude-sonnet-4-6-20250514', 'gpt-4o', 'llama3.2'],
  [TaskType.COMPLEX]: ['gpt-4o', 'claude-sonnet-4-6-20250514', 'llama3.2'],
};

@Injectable()
export class RouterService {
  private readonly logger = new Logger(RouterService.name);

  constructor(private readonly llm: LlmService) {}

  resolve(model?: string, taskType?: TaskType): string {
    // 1. Explicit model takes priority
    if (model) {
      const def = this.llm.registry.getModel(model);
      if (def) return model;
      this.logger.warn(`Unknown model "${model}", falling back to routing`);
    }

    // 2. Route by taskType
    if (taskType && ROUTING_TABLE[taskType]) {
      const candidates = ROUTING_TABLE[taskType];
      for (const candidateId of candidates) {
        if (this.isAvailable(candidateId)) {
          this.logger.log(`Routed taskType="${taskType}" → model="${candidateId}"`);
          return candidateId;
        }
      }
    }

    // 3. Default
    const defaultModel = this.llm.registry.getDefaultModel();
    this.logger.log(`Using default model: ${defaultModel.id}`);
    return defaultModel.id;
  }

  private isAvailable(modelId: string): boolean {
    const def = this.llm.registry.getModel(modelId);
    if (!def) return false;

    switch (def.provider) {
      case 'ollama':
        return true; // Always available locally
      case 'anthropic':
        return this.llm['anthropic'] !== null;
      case 'openai':
        return this.llm['openai'] !== null;
    }
  }
}
