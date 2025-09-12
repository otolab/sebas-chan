import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PondEntry } from '../../packages/shared-types/src';
import { setupTestEnvironment, teardownTestEnvironment, getTestId, getTestTimestamp } from './setup';
import type { DBClient } from '../../packages/db/src';

describe('Pond Operations - Integration Tests', () => {
  let dbClient: DBClient;

  beforeAll(async () => {
    dbClient = await setupTestEnvironment();
  }, 60000);

  afterAll(async () => {
    // Note: teardown is handled globally, but we can do cleanup here if needed
  });

  describe('Pond Entry Operations with Real DB', () => {
    it('should add Japanese text to pond and generate vectors', async () => {
      const entry: Omit<PondEntry, 'id'> = {
        content: 'システムのパフォーマンスが低下しています。メモリ使用率が高い状態が続いています。',
        source: 'monitoring',
        timestamp: getTestTimestamp(),
      };

      const success = await dbClient.addPondEntry({
        id: getTestId('pond'),
        ...entry,
      });

      expect(success).toBe(true);
    });

    it('should add multiple entries to pond', async () => {
      const entries = [
        {
          id: getTestId('pond-batch-1'),
          content: 'データベースの接続エラーが頻発しています',
          source: 'error-log',
          timestamp: getTestTimestamp(),
        },
        {
          id: getTestId('pond-batch-2'),
          content: 'APIレスポンスタイムが通常の3倍になっています',
          source: 'performance-monitor',
          timestamp: getTestTimestamp(),
        },
        {
          id: getTestId('pond-batch-3'),
          content: 'ユーザー認証サービスでタイムアウトが発生',
          source: 'auth-service',
          timestamp: getTestTimestamp(),
        },
      ];

      const results = await Promise.all(
        entries.map(entry => dbClient.addPondEntry(entry))
      );
      
      expect(results.every(r => r === true)).toBe(true);
    });

    it('should handle English content', async () => {
      const entry: PondEntry = {
        id: getTestId('pond-en'),
        content: 'Database connection pool exhausted. Need to increase max connections.',
        source: 'diagnostic',
        timestamp: getTestTimestamp(),
      };

      const success = await dbClient.addPondEntry(entry);
      expect(success).toBe(true);
    });

    it('should handle mixed Japanese and English content', async () => {
      const entry: PondEntry = {
        id: getTestId('pond-mixed'),
        content: 'Error: Memory leakが発生している可能性があります。GC frequencyを確認してください。',
        source: 'mixed-log',
        timestamp: getTestTimestamp(),
      };

      const success = await dbClient.addPondEntry(entry);
      expect(success).toBe(true);
    });

    it('should handle structured JSON content', async () => {
      const structuredContent = {
        error_type: 'ConnectionTimeout',
        message: 'Redis接続タイムアウト',
        details: {
          host: 'redis-cluster-01',
          port: 6379,
          timeout_ms: 5000,
        },
        timestamp: new Date().toISOString(),
      };

      const entry: PondEntry = {
        id: getTestId('pond-json'),
        content: JSON.stringify(structuredContent),
        source: 'structured-log',
        timestamp: getTestTimestamp(),
      };

      const success = await dbClient.addPondEntry(entry);
      expect(success).toBe(true);
    });
  });

  describe('Pond Search Operations with Vectors', () => {
    beforeAll(async () => {
      // テスト用データを追加
      const testData = [
        {
          id: getTestId('search-1'),
          content: 'Elasticsearchのクラスタが赤色の状態です',
          source: 'test-search',
          timestamp: getTestTimestamp(),
        },
        {
          id: getTestId('search-2'),
          content: 'Elasticsearchのインデックスサイズが肥大化',
          source: 'test-search',
          timestamp: getTestTimestamp(),
        },
        {
          id: getTestId('search-3'),
          content: 'PostgreSQLのレプリケーション遅延が発生',
          source: 'test-search',
          timestamp: getTestTimestamp(),
        },
      ];

      await Promise.all(
        testData.map(entry => dbClient.addPondEntry(entry))
      );

      // インデックス作成を待つ
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    it('should search pond with Japanese query', async () => {
      const results = await dbClient.searchPond('Elasticsearch クラスタ');
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Elasticsearchに関する結果が含まれることを確認
      const elasticsearchResults = results.filter(r => 
        r.content.includes('Elasticsearch')
      );
      expect(elasticsearchResults.length).toBeGreaterThan(0);
    });

    it('should search with semantic similarity', async () => {
      // "データベースの問題"で検索して関連エントリを見つける
      const results = await dbClient.searchPond('データベースの問題');
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // データベース関連の内容が見つかることを確認
      if (results.length > 0) {
        const hasRelevantContent = results.some(r => 
          r.content.includes('PostgreSQL') || 
          r.content.includes('Elasticsearch') ||
          r.content.includes('データベース')
        );
        expect(hasRelevantContent).toBe(true);
      }
    });

    it('should limit search results', async () => {
      const limit = 5;
      const results = await dbClient.searchPond('エラー', limit);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(limit);
    });

    it('should handle search with no results gracefully', async () => {
      const results = await dbClient.searchPond('完全に存在しないキーワード_xyz123_' + Date.now());
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      // セマンティック検索により何か返る可能性があるが、エラーにはならない
    });

    it('should search with English query', async () => {
      const results = await dbClient.searchPond('replication delay');
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // レプリケーションに関する内容が見つかることを確認
      if (results.length > 0) {
        const hasReplicationContent = results.some(r => 
          r.content.toLowerCase().includes('replication') ||
          r.content.includes('レプリケーション')
        );
        expect(hasReplicationContent).toBe(true);
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle very long content', async () => {
      const longContent = 'テスト'.repeat(1000); // 2000文字
      
      const entry: PondEntry = {
        id: getTestId('pond-long'),
        content: longContent,
        source: 'stress-test',
        timestamp: getTestTimestamp(),
      };

      const success = await dbClient.addPondEntry(entry);
      expect(success).toBe(true);
    });

    it('should handle special characters', async () => {
      const entry: PondEntry = {
        id: getTestId('pond-special'),
        content: '特殊文字テスト: 🚀 ★ ♪ © ® ™ 〜 ￥ 【】「」',
        source: 'special-chars',
        timestamp: getTestTimestamp(),
      };

      const success = await dbClient.addPondEntry(entry);
      expect(success).toBe(true);
    });

    it('should handle concurrent additions', async () => {
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const entry: PondEntry = {
          id: getTestId(`pond-concurrent-${i}`),
          content: `並行処理テスト ${i}: データベース接続エラー`,
          source: 'concurrent-test',
          timestamp: getTestTimestamp(),
        };
        promises.push(dbClient.addPondEntry(entry));
      }

      const results = await Promise.all(promises);
      expect(results.every(r => r === true)).toBe(true);
    });
  });
});