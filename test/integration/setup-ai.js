/**
 * 統合テスト用のAIService共通セットアップ
 * プラットフォームに応じて適切なドライバーを設定
 */

import { AIService } from '@moduler-prompt/driver';
import os from 'os';

let globalAIService = null;

/**
 * プラットフォームに応じたAIServiceの設定を作成
 * macOS: MLXドライバーを使用
 * その他: 環境変数に応じてクラウドAPIまたはテストをスキップ
 */
export async function setupAIService() {
  if (globalAIService) {
    return globalAIService;
  }

  const platform = os.platform();
  const config = {
    models: [],
  };

  // macOSの場合はMLXドライバーを設定
  if (platform === 'darwin') {
    config.models.push({
      model: 'mlx-community/gemma-3-27b-it-qat-4bit',
      provider: 'mlx',
      capabilities: ['structured', 'local_execution', 'japanese'],
    });
    console.log('🎯 Using MLX driver for macOS');
    console.log('📋 Model config:', JSON.stringify(config.models[0], null, 2));
  }

  // Anthropic APIキーがある場合はClaudeを追加
  if (process.env.ANTHROPIC_API_KEY) {
    config.models.push({
      model: 'claude-3-haiku-20240307',
      provider: 'anthropic',
      capabilities: ['structured', 'japanese'],
    });
    console.log('🌐 Using Anthropic API');
  }

  // 利用可能なモデルがない場合
  if (config.models.length === 0) {
    console.log('⚠️ No AI drivers available for this platform');
    return null;
  }

  try {
    console.log('🚀 Initializing AIService with config:', JSON.stringify(config, null, 2));
    globalAIService = new AIService(config);

    // ドライバーが実際に作成できるか確認
    console.log('🔨 Testing driver creation...');
    const testDriver = await globalAIService.createDriverFromCapabilities(
      ['structured'],
      { lenient: true }
    );

    if (!testDriver) {
      console.log('⚠️ Failed to create driver');
      return null;
    }

    console.log('✅ AI Service initialized successfully');
    console.log('📦 Test driver:', testDriver);
    return globalAIService;
  } catch (error) {
    console.log('⚠️ Failed to initialize AI Service:', error);
    console.log('📚 Stack trace:', error.stack);
    return null;
  }
}

/**
 * AIServiceが利用可能かチェック
 */
export async function isAIServiceAvailable() {
  const aiService = await setupAIService();
  return aiService !== null;
}

/**
 * クリーンアップ
 */
export function teardownAIService() {
  globalAIService = null;
}