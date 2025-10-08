import { AIService } from '@moduler-prompt/driver';
import type { ApplicationConfig } from '@moduler-prompt/driver';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * AI駆動テストの設定を読み込む
 * ApplicationConfig型の設定ファイルをそのまま読み込む
 */
async function loadAITestConfig(): Promise<ApplicationConfig | null> {
  try {
    // プロジェクトルートの設定ファイルを探す
    const configPath = join(process.cwd(), 'ai-test-config.json');
    const configContent = await readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent) as ApplicationConfig;

    // 設定ファイルをそのまま返す（ApplicationConfig形式）
    return config;
  } catch (error) {
    // 設定ファイルが見つからない場合
    return null;
  }
}

/**
 * AI駆動テストのためのヘルパー
 * AIServiceが利用可能かを判定し、利用可能な場合はセットアップ済みのサービスを返す
 */
export async function setupAIServiceForTest(): Promise<AIService | null> {
  try {
    // 環境変数で明示的にスキップが指定されている場合
    if (process.env.SKIP_AI_TESTS === 'true') {
      return null;
    }

    // 設定ファイルまたは環境変数から設定を読み込む
    const config = await loadAITestConfig();
    if (!config) {
      // 設定が見つからない場合
      return null;
    }

    // AIServiceを初期化
    const aiService = new AIService(config);

    // 利用可能なモデルをチェック
    const models = aiService.selectModels([]);
    if (models.length === 0) {
      // 利用可能なモデルがない場合はnullを返す
      return null;
    }

    return aiService;
  } catch (error) {
    // AIServiceの初期化に失敗した場合もnullを返す
    console.error('AI Service initialization failed:', error);
    console.error('Error details:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    return null;
  }
}

/**
 * AIServiceが利用可能かをチェック
 * describe.skipIfで使用
 */
export async function shouldSkipAITests(): Promise<boolean> {
  if (process.env.SKIP_AI_TESTS === 'true') {
    return true;
  }

  const aiService = await setupAIServiceForTest();
  return aiService === null;
}
