import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DBClient } from '../src/index';
import { PondEntry } from '@sebas-chan/shared-types';

describe('Pond Integration with Real DB', () => {
  let dbClient: DBClient;

  beforeAll(async () => {
    dbClient = new DBClient();
    await dbClient.connect();
    await dbClient.initModel();
  }, 60000);

  afterAll(async () => {
    await dbClient.disconnect();
  });

  describe('Pond Entry Operations', () => {
    it('should add Japanese text to pond and generate vectors', async () => {
      const entry: Omit<PondEntry, 'id'> = {
        content: 'システムのパフォーマンスが低下しています。メモリ使用率が高い状態が続いています。',
        source: 'monitoring',
        timestamp: new Date(),
      };

      const success = await dbClient.addPondEntry({
        id: `test-pond-${Date.now()}`,
        ...entry,
      });

      expect(success).toBe(true);
    });

    it('should add multiple entries to pond', async () => {
      const entries = [
        {
          id: `test-pond-batch-1-${Date.now()}`,
          content: 'データベースの接続エラーが頻発しています',
          source: 'error-log',
          timestamp: new Date(),
        },
        {
          id: `test-pond-batch-2-${Date.now()}`,
          content: 'APIレスポンスタイムが通常の3倍になっています',
          source: 'performance-monitor',
          timestamp: new Date(),
        },
        {
          id: `test-pond-batch-3-${Date.now()}`,
          content: 'ユーザー認証サービスでタイムアウトが発生',
          source: 'auth-service',
          timestamp: new Date(),
        },
      ];

      for (const entry of entries) {
        const success = await dbClient.addPondEntry(entry);
        expect(success).toBe(true);
      }
    });

    it('should handle English content', async () => {
      const entry: PondEntry = {
        id: `test-pond-en-${Date.now()}`,
        content: 'Database connection pool exhausted. Need to increase max connections.',
        source: 'diagnostic',
        timestamp: new Date(),
      };

      const success = await dbClient.addPondEntry(entry);
      expect(success).toBe(true);
    });

    it('should handle mixed Japanese and English content', async () => {
      const entry: PondEntry = {
        id: `test-pond-mixed-${Date.now()}`,
        content: 'Error: Memory leakが発生している可能性があります。GC frequencyを確認してください。',
        source: 'mixed-log',
        timestamp: new Date(),
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
        id: `test-pond-json-${Date.now()}`,
        content: JSON.stringify(structuredContent),
        source: 'structured-log',
        timestamp: new Date(),
      };

      const success = await dbClient.addPondEntry(entry);
      expect(success).toBe(true);
    });
  });

  describe('Pond Search Operations', () => {
    beforeAll(async () => {
      // Add test data for search
      const testData = [
        {
          id: `search-test-1-${Date.now()}`,
          content: 'Elasticsearchのクラスタが赤色の状態です',
          source: 'test-search',
          timestamp: new Date(),
        },
        {
          id: `search-test-2-${Date.now()}`,
          content: 'Elasticsearchのインデックスサイズが肥大化',
          source: 'test-search',
          timestamp: new Date(),
        },
        {
          id: `search-test-3-${Date.now()}`,
          content: 'PostgreSQLのレプリケーション遅延が発生',
          source: 'test-search',
          timestamp: new Date(),
        },
      ];

      for (const entry of testData) {
        await dbClient.addPondEntry(entry);
      }

      // Wait a bit for indexing
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    it('should search pond with Japanese query', async () => {
      const results = await dbClient.searchPond('Elasticsearch クラスタ');
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Should find at least one result about Elasticsearch
      const elasticsearchResults = results.filter(r => 
        r.content.includes('Elasticsearch')
      );
      expect(elasticsearchResults.length).toBeGreaterThan(0);
    });

    it('should search with semantic similarity', async () => {
      // Search for "database problems" should find related entries
      const results = await dbClient.searchPond('データベースの問題');
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Should find entries about database-related issues
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
      const results = await dbClient.searchPond('エラー', 5);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should handle search with no results', async () => {
      const results = await dbClient.searchPond('完全に存在しないキーワード_xyz123');
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      // May or may not return results based on semantic similarity
    });

    it('should search with English query', async () => {
      const results = await dbClient.searchPond('replication delay');
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      
      // Should find entries about replication
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
      const longContent = 'テスト'.repeat(1000); // 2000 characters
      
      const entry: PondEntry = {
        id: `test-pond-long-${Date.now()}`,
        content: longContent,
        source: 'stress-test',
        timestamp: new Date(),
      };

      const success = await dbClient.addPondEntry(entry);
      expect(success).toBe(true);
    });

    it('should handle special characters', async () => {
      const entry: PondEntry = {
        id: `test-pond-special-${Date.now()}`,
        content: '特殊文字テスト: 🚀 ★ ♪ © ® ™ 〜 ￥ 【】「」',
        source: 'special-chars',
        timestamp: new Date(),
      };

      const success = await dbClient.addPondEntry(entry);
      expect(success).toBe(true);
    });

    it('should handle concurrent additions', async () => {
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const entry: PondEntry = {
          id: `test-pond-concurrent-${i}-${Date.now()}`,
          content: `並行処理テスト ${i}: データベース接続エラー`,
          source: 'concurrent-test',
          timestamp: new Date(),
        };
        promises.push(dbClient.addPondEntry(entry));
      }

      const results = await Promise.all(promises);
      expect(results.every(r => r === true)).toBe(true);
    });
  });
});