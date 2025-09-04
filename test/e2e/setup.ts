/**
 * E2Eテストのセットアップ
 */

import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  console.log('Setting up E2E test environment...');
  
  // テスト用環境変数の設定
  process.env.NODE_ENV = 'test';
  process.env.USE_TEST_WORKFLOW = 'true';
  process.env.LOG_LEVEL = 'warn'; // テスト時はログレベルを下げる
});

afterAll(() => {
  console.log('Cleaning up E2E test environment...');
  
  // クリーンアップ処理
  // 例: テスト用DBのクリア、一時ファイルの削除など
});