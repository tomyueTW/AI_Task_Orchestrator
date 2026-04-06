import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ModelRegistry } from './model-registry';

export interface LlmResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly anthropic: Anthropic | null;
  private readonly openai: OpenAI | null;
  readonly registry = new ModelRegistry();

  constructor(config: ConfigService) {
    const anthropicKey = config.get<string>('ANTHROPIC_API_KEY');
    const openaiKey = config.get<string>('OPENAI_API_KEY');

    this.anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;
    this.openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

    this.logger.log(
      `LLM providers: Anthropic=${anthropicKey ? 'enabled' : 'disabled'}, OpenAI=${openaiKey ? 'enabled' : 'disabled'}`,
    );
  }

  async call(modelId: string, prompt: string): Promise<LlmResponse> {
    const model = this.registry.getModel(modelId);
    if (!model) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    if (model.provider === 'anthropic') {
      return this.callAnthropic(model.id, prompt, model.maxOutputTokens);
    }
    return this.callOpenAI(model.id, prompt, model.maxOutputTokens);
  }

  private async callAnthropic(
    modelId: string,
    prompt: string,
    maxTokens: number,
  ): Promise<LlmResponse> {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured');
    }

    const response = await this.anthropic.messages.create({
      model: modelId,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  private async callOpenAI(
    modelId: string,
    prompt: string,
    maxTokens: number,
  ): Promise<LlmResponse> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await this.openai.chat.completions.create({
      model: modelId,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    return {
      content: response.choices[0]?.message?.content ?? '',
      model: response.model,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  }
}
