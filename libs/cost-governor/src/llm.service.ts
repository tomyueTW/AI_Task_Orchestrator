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
  private readonly ollama: OpenAI;
  readonly registry = new ModelRegistry();

  constructor(config: ConfigService) {
    const anthropicKey = config.get<string>('ANTHROPIC_API_KEY');
    const openaiKey = config.get<string>('OPENAI_API_KEY');
    const ollamaHost = config.get<string>('OLLAMA_HOST', 'http://localhost:11434');

    this.anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;
    this.openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;
    this.ollama = new OpenAI({ baseURL: `${ollamaHost}/v1`, apiKey: 'ollama' });

    this.logger.log(
      `LLM providers: Anthropic=${anthropicKey ? 'enabled' : 'disabled'}, OpenAI=${openaiKey ? 'enabled' : 'disabled'}, Ollama=${ollamaHost}`,
    );
  }

  async call(modelId: string, prompt: string): Promise<LlmResponse> {
    const model = this.registry.getModel(modelId);
    if (!model) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    switch (model.provider) {
      case 'anthropic':
        return this.callAnthropic(model.id, prompt, model.maxOutputTokens);
      case 'openai':
        return this.callOpenAI(this.openai, model.id, prompt, model.maxOutputTokens, 'OpenAI');
      case 'ollama':
        return this.callOpenAI(this.ollama, model.id, prompt, model.maxOutputTokens, 'Ollama');
    }
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
    client: OpenAI | null,
    modelId: string,
    prompt: string,
    maxTokens: number,
    providerName: string,
  ): Promise<LlmResponse> {
    if (!client) {
      throw new Error(`${providerName} API key not configured`);
    }

    const response = await client.chat.completions.create({
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
