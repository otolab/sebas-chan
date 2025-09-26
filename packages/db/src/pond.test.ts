import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DBClient } from './index.js';

describe('DBClient - Pond Methods with Context and Metadata', () => {
  let client: DBClient;

  beforeEach(() => {
    client = new DBClient();
    // sendRequestをモック化
    client.sendRequest = vi.fn();
  });

  describe('addPondEntry', () => {
    it('context/metadataを含むエントリを追加できる', async () => {
      const entry = {
        id: 'test-pond-001',
        content: 'APIレスポンスが遅い問題',
        source: 'slack' as const,
        context: 'work: ECサイト開発',
        metadata: {
          channel: '#dev-backend',
          user: 'dev-user',
          thread_ts: '1234567890.123456'
        },
        timestamp: new Date()
      };

      client.sendRequest = vi.fn().mockResolvedValue(true);

      const result = await client.addPondEntry(entry);

      // timestampがISO文字列に変換されて送信される
      expect(client.sendRequest).toHaveBeenCalledWith('addPondEntry', {
        ...entry,
        timestamp: entry.timestamp.toISOString()
      });
      expect(result).toBe(true);
    });

    it('contextなしでもエントリを追加できる', async () => {
      const entry = {
        id: 'test-pond-002',
        content: '一般的なメモ',
        source: 'manual' as const,
        timestamp: new Date()
      };

      client.sendRequest = vi.fn().mockResolvedValue(true);

      const result = await client.addPondEntry(entry);

      expect(client.sendRequest).toHaveBeenCalledWith('addPondEntry', {
        ...entry,
        timestamp: entry.timestamp.toISOString()
      });
      expect(result).toBe(true);
    });

    it('metadataなしでもエントリを追加できる', async () => {
      const entry = {
        id: 'test-pond-003',
        content: 'エラーレポート',
        source: 'teams' as const,
        context: 'work: プロジェクトA',
        timestamp: new Date()
      };

      client.sendRequest = vi.fn().mockResolvedValue(true);

      const result = await client.addPondEntry(entry);

      expect(client.sendRequest).toHaveBeenCalledWith('addPondEntry', {
        ...entry,
        timestamp: entry.timestamp.toISOString()
      });
      expect(result).toBe(true);
    });
  });

  describe('searchPond', () => {
    it('contextフィルタで検索できる', async () => {
      const mockResults = {
        data: [
          {
            id: 'pond-1',
            content: 'ECサイトのエラー',
            source: 'slack',
            context: 'work: ECサイト開発',
            metadata: { channel: '#dev' },
            timestamp: new Date().toISOString(),
            score: 0.95
          }
        ],
        meta: {
          total: 1,
          limit: 20,
          offset: 0,
          hasMore: false
        }
      };

      client.sendRequest = vi.fn().mockResolvedValue(mockResults);

      const result = await client.searchPond({
        q: 'エラー',
        context: 'ECサイト',
        limit: 20
      });

      expect(client.sendRequest).toHaveBeenCalledWith('searchPond', {
        q: 'エラー',
        context: 'ECサイト',
        limit: 20
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].context).toBe('work: ECサイト開発');
      expect(result.data[0].metadata).toEqual({ channel: '#dev' });
    });

    it('ベクトル検索でスコアが含まれる', async () => {
      const mockResults = {
        data: [
          {
            id: 'pond-1',
            content: 'APIエラー',
            source: 'slack',
            context: 'work: backend',
            timestamp: new Date().toISOString(),
            score: 0.92,
            distance: 0.08
          },
          {
            id: 'pond-2',
            content: 'APIの問題',
            source: 'teams',
            context: 'work: backend',
            timestamp: new Date().toISOString(),
            score: 0.85,
            distance: 0.15
          }
        ],
        meta: {
          total: 2,
          limit: 10,
          offset: 0,
          hasMore: false
        }
      };

      client.sendRequest = vi.fn().mockResolvedValue(mockResults);

      const result = await client.searchPond({
        q: 'API',
        limit: 10
      });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].score).toBe(0.92);
      expect(result.data[0].distance).toBe(0.08);
      expect(result.data[1].score).toBe(0.85);
    });

    it('sourceとcontextを組み合わせてフィルタできる', async () => {
      const mockResults = {
        data: [
          {
            id: 'pond-1',
            content: 'Slackからのエラー報告',
            source: 'slack',
            context: 'work: プロジェクトX',
            timestamp: new Date().toISOString()
          }
        ],
        meta: {
          total: 1,
          limit: 20,
          offset: 0,
          hasMore: false
        }
      };

      client.sendRequest = vi.fn().mockResolvedValue(mockResults);

      const result = await client.searchPond({
        source: 'slack',
        context: 'プロジェクトX',
        limit: 20
      });

      expect(client.sendRequest).toHaveBeenCalledWith('searchPond', {
        source: 'slack',
        context: 'プロジェクトX',
        limit: 20
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].source).toBe('slack');
      expect(result.data[0].context).toBe('work: プロジェクトX');
    });
  });

  describe('getPondEntry', () => {
    it('IDでエントリを取得でき、context/metadataが含まれる', async () => {
      const mockEntry = {
        id: 'pond-001',
        content: '取得テスト',
        source: 'user_request',
        context: 'personal: タスク管理',
        metadata: {
          sessionId: 'session-123',
          userId: 'user-456'
        },
        timestamp: new Date().toISOString(),
        vector: [0.1, 0.2, 0.3]
      };

      client.sendRequest = vi.fn().mockResolvedValue(mockEntry);

      const result = await client.getPondEntry('pond-001');

      expect(client.sendRequest).toHaveBeenCalledWith('getPondEntry', { id: 'pond-001' });
      expect(result).toEqual(mockEntry);
      expect(result?.context).toBe('personal: タスク管理');
      expect(result?.metadata).toEqual({
        sessionId: 'session-123',
        userId: 'user-456'
      });
    });

    it('context/metadataがない古いエントリも取得できる', async () => {
      const mockEntry = {
        id: 'pond-old-001',
        content: '古いエントリ',
        source: 'email',
        timestamp: new Date().toISOString(),
        vector: [0.1, 0.2]
      };

      client.sendRequest = vi.fn().mockResolvedValue(mockEntry);

      const result = await client.getPondEntry('pond-old-001');

      expect(result).toEqual(mockEntry);
      expect(result?.context).toBeUndefined();
      expect(result?.metadata).toBeUndefined();
    });
  });
});