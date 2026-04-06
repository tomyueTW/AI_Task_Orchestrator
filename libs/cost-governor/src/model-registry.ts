export interface ModelDefinition {
  id: string;
  provider: 'anthropic' | 'openai';
  displayName: string;
  inputPricePerMToken: number;
  outputPricePerMToken: number;
  maxOutputTokens: number;
  tags: string[];
}

const MODELS: ModelDefinition[] = [
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    inputPricePerMToken: 0.80,
    outputPricePerMToken: 4.00,
    maxOutputTokens: 8192,
    tags: ['fast', 'cheap', 'simple'],
  },
  {
    id: 'claude-sonnet-4-6-20250514',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.6',
    inputPricePerMToken: 3.00,
    outputPricePerMToken: 15.00,
    maxOutputTokens: 16384,
    tags: ['balanced', 'code'],
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    inputPricePerMToken: 0.15,
    outputPricePerMToken: 0.60,
    maxOutputTokens: 16384,
    tags: ['fast', 'cheap', 'simple'],
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    inputPricePerMToken: 2.50,
    outputPricePerMToken: 10.00,
    maxOutputTokens: 16384,
    tags: ['balanced', 'code', 'complex'],
  },
];

export class ModelRegistry {
  private readonly models = new Map<string, ModelDefinition>();

  constructor() {
    for (const model of MODELS) {
      this.models.set(model.id, model);
    }
  }

  getModel(id: string): ModelDefinition | undefined {
    return this.models.get(id);
  }

  getModelsByTag(tag: string): ModelDefinition[] {
    return Array.from(this.models.values()).filter((m) => m.tags.includes(tag));
  }

  getAllModels(): ModelDefinition[] {
    return Array.from(this.models.values());
  }

  getDefaultModel(): ModelDefinition {
    return this.models.get('claude-haiku-4-5-20251001')!;
  }
}
