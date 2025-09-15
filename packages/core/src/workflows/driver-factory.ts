import type { AIDriver, QueryOptions } from '@moduler-prompt/driver';
import { TestDriver, EchoDriver, OpenAIDriver, AnthropicDriver } from '@moduler-prompt/driver';
import { compile } from '@moduler-prompt/core';

export interface DriverCapabilities {
  model: 'fast' | 'standard' | 'large';
  temperature?: number;
  maxTokens?: number;
}

export interface DriverConfig {
  provider?: 'openai' | 'anthropic' | 'test' | 'echo';
  apiKey?: string;
  baseURL?: string;
}

export type DriverFactory = (capabilities: DriverCapabilities) => AIDriver;

/**
 * ドライバーファクトリを作成
 * @moduler-prompt/driverを使用して、1インスタンス = 1モデルのドライバーを生成
 */
export function createDriverByCapabilities(
  config: DriverConfig,
  capabilities: DriverCapabilities
): AIDriver {
  const modelMap: Record<string, string> = {
    fast: 'gpt-3.5-turbo',
    standard: 'gpt-4',
    large: 'gpt-4-turbo',
  };

  const options: QueryOptions = {
    temperature: capabilities.temperature ?? 0.7,
    maxTokens: capabilities.maxTokens ?? 1000,
  };

  switch (config.provider) {
    case 'anthropic':
      return new AnthropicDriver({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: modelMap[capabilities.model] || 'claude-3-sonnet-20240229',
        defaultOptions: options,
      });
    case 'test':
      return new TestDriver({ responses: ['Test response'] });
    case 'echo':
      return new EchoDriver();
    case 'openai':
    default:
      return new OpenAIDriver({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: modelMap[capabilities.model] || 'gpt-4',
        defaultOptions: options,
      });
  }
}

/**
 * ドライバーファクトリ関数を作成
 */
export function createDriverFactory(config: DriverConfig): DriverFactory {
  return (capabilities: DriverCapabilities) => {
    return createDriverByCapabilities(config, capabilities);
  };
}

/**
 * テスト用のドライバーファクトリを作成
 */
export function createTestDriverFactory(responses: string[]): DriverFactory {
  return (capabilities: DriverCapabilities): AIDriver => {
    return new TestDriver({ responses });
  };
}

/**
 * エコードライバーファクトリを作成（入力をそのまま返す）
 */
export function createEchoDriverFactory(): DriverFactory {
  return (capabilities: DriverCapabilities): AIDriver => {
    return new EchoDriver();
  };
}

/**
 * プロンプトをコンパイルしてドライバーで実行するヘルパー
 */
export async function callDriver(
  driver: AIDriver,
  prompt: string,
  options?: QueryOptions
): Promise<string> {
  const compiledPrompt = compile(prompt);
  const result = await driver.query(compiledPrompt, options);
  return result.content;
}