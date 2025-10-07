/**
 * 統合テスト用の共通セットアップ
 * DBクライアントとPythonワーカーを複数テスト間で共有
 */

import { DBClient } from '../../packages/db/src';
import { beforeAll, afterAll } from 'vitest';

// グローバルなDB接続を管理
let globalDbClient: DBClient | null = null;
let initializationPromise: Promise<DBClient> | null = null;

/**
 * テスト環境のセットアップ
 * 複数のテストから呼ばれても一度だけ初期化する
 */
export async function setupTestEnvironment(): Promise<DBClient> {
  // 既に初期化済みの場合はそれを返す
  if (globalDbClient) {
    return globalDbClient;
  }

  // 初期化中の場合は完了を待つ
  if (initializationPromise) {
    return initializationPromise;
  }

  // 初期化を開始
  initializationPromise = (async () => {
    console.log('🚀 Initializing test environment...');
    const startTime = Date.now();

    console.log('[setupTestEnvironment] Creating DBClient instance...');
    globalDbClient = new DBClient();

    console.log('[setupTestEnvironment] Calling DBClient.connect()...');
    try {
      await globalDbClient.connect(); // waitForReadyを内部で呼ぶ
    } catch (error) {
      console.error('[setupTestEnvironment] DBClient.connect() failed:', error);
      throw error;
    }

    console.log('[setupTestEnvironment] Calling DBClient.initModel()...');
    await globalDbClient.initModel();
    
    // 追加の確認：DBが本当に使える状態か確認
    const status = await globalDbClient.getStatus();
    if (status.status !== 'ok') {
      throw new Error(`DB is not ready: ${JSON.stringify(status)}`);
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Test environment ready (${duration}ms)`);
    console.log(`   DB Status: ${JSON.stringify(status)}`);
    
    return globalDbClient;
  })();

  return initializationPromise;
}

/**
 * テスト環境のクリーンアップ
 */
export async function teardownTestEnvironment(): Promise<void> {
  if (globalDbClient) {
    console.log('🧹 Cleaning up test environment...');
    await globalDbClient.disconnect();
    globalDbClient = null;
    initializationPromise = null;
  }
}

/**
 * 統合テスト用のグローバルセットアップフック
 * vitestの設定で使用
 */
export function setupIntegrationTests() {
  beforeAll(async () => {
    await setupTestEnvironment();
  }, 60000); // 60秒のタイムアウト

  afterAll(async () => {
    await teardownTestEnvironment();
  });
}

/**
 * テストデータをクリアするヘルパー
 */
export async function clearTestData(): Promise<void> {
  const db = await setupTestEnvironment();
  // 必要に応じてテストデータのクリア処理を実装
  // await db.clearDatabase();
}

/**
 * テスト用のタイムスタンプを生成
 */
export function getTestTimestamp(): Date {
  return new Date();
}

/**
 * テスト用のユニークIDを生成
 */
export function getTestId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}