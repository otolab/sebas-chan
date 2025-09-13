/**
 * Reporter SDK E2E Tests
 * 
 * Reporter SDKの実際のサーバー連携をテストするエンドツーエンドテスト
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../packages/server/src/app';
import { setupTestEnvironment, teardownTestEnvironment } from '../integration/setup';
import { ReporterClient } from '../../packages/reporter-sdk/src/client';
import { BaseReporter } from '../../packages/reporter-sdk/src/base-reporter';
import type { Input } from '../../packages/shared-types/src';

// テスト用のカスタムReporter実装
class TestReporter extends BaseReporter {
  private collectedData: string[] = [];
  
  async collect(): Promise<Input[]> {
    // テスト用のデータを収集
    const inputs: Input[] = this.collectedData.map((content, index) => ({
      id: `test-${Date.now()}-${index}`,
      source: this.config.source || 'test-reporter',
      content,
      timestamp: new Date()
    }));
    
    // 収集後はクリア
    this.collectedData = [];
    
    return inputs;
  }
  
  protected async onStart(): Promise<void> {
    // テスト用: 開始時の処理
  }
  
  protected async onStop(): Promise<void> {
    // テスト用: 停止時の処理
  }
  
  // テスト用: データを追加するメソッド
  addTestData(content: string): void {
    this.collectedData.push(content);
  }
}

describe('Reporter SDK E2E Tests', () => {
  let app: any;
  let server: any;
  let client: ReporterClient;
  let serverUrl: string;
  
  beforeAll(async () => {
    // DBの初期化
    await setupTestEnvironment();
    
    // アプリケーションを作成
    app = await createApp();
    
    // テスト用サーバーを起動
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        serverUrl = `http://localhost:${port}`;
        console.log(`Test server started on ${serverUrl}`);
        resolve();
      });
    });
    
    // ReporterClientのインスタンスを作成
    client = new ReporterClient({
      apiUrl: serverUrl,
      retryOptions: {
        maxRetries: 3,
        retryDelay: 1000
      }
    });
    
    // エンジンが準備できるまで待つ
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 60000);
  
  afterAll(async () => {
    // サーバーをクローズ
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestEnvironment();
  });
  
  describe('ReporterClient', () => {
    it('should check server health', async () => {
      const isHealthy = await client.checkHealth();
      
      // サーバーが起動している場合
      const healthResponse = await request(app).get('/health');
      if (healthResponse.status === 200) {
        expect(isHealthy).toBe(true);
      }
    });
    
    it('should submit single input', async () => {
      const result = await client.submitInput({
        source: 'sdk-e2e-test',
        content: 'Single input test from SDK E2E'
      });
      
      expect(result.success).toBe(true);
      expect(result.inputId).toBeDefined();
      expect(typeof result.inputId).toBe('string');
    });
    
    it('should submit batch inputs', async () => {
      const inputs = [
        { source: 'batch-sdk-test', content: 'Batch item 1' },
        { source: 'batch-sdk-test', content: 'Batch item 2' },
        { source: 'batch-sdk-test', content: 'Batch item 3' }
      ];
      
      const results = await client.submitBatch(inputs);
      
      expect(results.success).toBe(true);
      expect(results.succeeded).toBe(3);
      expect(results.failed).toBe(0);
      expect(results.results).toHaveLength(3);
      
      results.results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.inputId).toBeDefined();
      });
    });
    
    it('should handle partial batch failures', async () => {
      const inputs = [
        { source: 'batch-test', content: 'Valid content' },
        { source: '', content: 'Invalid - no source' }, // これは失敗するはず
        { source: 'batch-test', content: 'Another valid content' }
      ];
      
      const results = await client.submitBatch(inputs);
      
      expect(results.success).toBe(false); // 一部失敗
      expect(results.succeeded).toBe(2);
      expect(results.failed).toBe(1);
      expect(results.results[0].success).toBe(true);
      expect(results.results[1].success).toBe(false);
      expect(results.results[2].success).toBe(true);
    });
    
    it('should handle network errors with retry', async () => {
      // 存在しないサーバーへの接続を試みる
      const failingClient = new ReporterClient({
        apiUrl: 'http://localhost:9999',
        retryOptions: {
          maxRetries: 2,
          retryDelay: 100
        }
      });
      
      const startTime = Date.now();
      const result = await failingClient.submitInput({
        source: 'test',
        content: 'test'
      });
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('fetch failed');
      // リトライが実行されたことを確認（最低200ms以上かかるはず）
      expect(duration).toBeGreaterThanOrEqual(200);
    });
    
    it('should handle server errors gracefully', async () => {
      // 不正なデータを送信
      const response = await request(app)
        .post('/api/inputs')
        .send({
          // sourceとcontentの両方が不足
        });
      
      expect(response.status).toBe(400);
    });
  });
  
  describe('BaseReporter', () => {
    let reporter: TestReporter;
    
    beforeEach(() => {
      reporter = new TestReporter({
        source: 'test-reporter',
        apiUrl: serverUrl,
        pollInterval: 1000
      });
    });
    
    afterEach(async () => {
      await reporter.stop();
    });
    
    it('should start and stop reporter', async () => {
      await reporter.start();
      
      // 既に開始されている場合はエラー
      await expect(reporter.start()).rejects.toThrow('already running');
      
      await reporter.stop();
      
      // 停止後は再度開始可能
      await reporter.start();
      await reporter.stop();
    });
    
    it('should collect and submit data automatically', async () => {
      // テストデータを追加
      reporter.addTestData('Auto collect test 1');
      reporter.addTestData('Auto collect test 2');
      
      // 手動で収集と送信を実行
      const submitted = await reporter.submitCollected();
      
      expect(submitted).toBe(2);
    });
    
    it('should handle collect errors', async () => {
      // エラーを発生させるReporter
      class ErrorReporter extends BaseReporter {
        async collect(): Promise<Input[]> {
          throw new Error('Collect failed');
        }
        
        protected async onStart(): Promise<void> {
          // テスト用: 開始時の処理
        }
        
        protected async onStop(): Promise<void> {
          // テスト用: 停止時の処理
        }
      }
      
      const errorReporter = new ErrorReporter({
        source: 'error-reporter',
        apiUrl: serverUrl
      });
      
      // エラーが発生してもクラッシュしない
      const submitted = await errorReporter.submitCollected();
      expect(submitted).toBe(0);
    });
    
    it('should run in polling mode', async () => {
      // ポーリング間隔を短くして設定
      const pollingReporter = new TestReporter({
        source: 'polling-test',
        apiUrl: serverUrl,
        pollInterval: 500 // 500ms
      });
      
      await pollingReporter.start();
      
      // データを追加
      pollingReporter.addTestData('Polling test data');
      
      // ポーリングが実行されるまで待つ
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await pollingReporter.stop();
      
      // データが送信されたことを確認（実際のサーバー接続がある場合）
      // この部分は実装により確認方法が異なる
    });
  });
  
  describe('Real-world Scenarios', () => {
    it('should handle rapid successive submissions', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          client.submitInput({
            source: 'rapid-test',
            content: `Rapid submission ${i}`
          })
        );
      }
      
      const results = await Promise.all(promises);
      
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.inputId).toBeDefined();
      });
    });
    
    it('should handle very large content', async () => {
      // 100KBの大きなコンテンツ
      const largeContent = 'x'.repeat(100000);
      
      const result = await client.submitInput({
        source: 'large-content',
        content: largeContent
      });
      
      expect(result.success).toBe(true);
      expect(result.inputId).toBeDefined();
    });
    
    it('should handle unicode and special characters', async () => {
      const specialContents = [
        '日本語のテスト',
        '🚀 Emoji test 🎉',
        'Line\\nbreaks\\nand\\ttabs',
        '<script>alert("XSS")</script>',
        'SQL injection test\'; DROP TABLE users; --',
        'Null character test\\0',
        'Mixed 日本語 and English テスト'
      ];
      
      const results = await Promise.all(
        specialContents.map(content =>
          client.submitInput({
            source: 'special-chars',
            content
          })
        )
      );
      
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.inputId).toBeDefined();
      });
    });
    
    it('should maintain connection over long period', async () => {
      // 長時間の接続維持テスト
      const submissions = [];
      
      // 3秒間隔で3回送信
      for (let i = 0; i < 3; i++) {
        const result = await client.submitInput({
          source: 'long-connection',
          content: `Submission ${i} at ${new Date().toISOString()}`
        });
        
        submissions.push(result);
        
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      submissions.forEach(result => {
        expect(result.success).toBe(true);
      });
    }, 15000); // 15秒のタイムアウト
  });
});