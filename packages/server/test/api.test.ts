/**
 * API Unit Tests - モックを使用した単体テスト
 * 
 * 実際のDBやCoreEngineを使わずに、APIエンドポイントのロジックをテスト
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApiRouter } from '../src/api/index';

// CoreEngineをモック
vi.mock('../src/core/engine', () => ({
  CoreEngine: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    getState: vi.fn().mockReturnValue('# Mock State'),
    updateState: vi.fn(),
    createIssue: vi.fn().mockImplementation((data) => ({
      id: 'mock-issue-id',
      ...data,
      status: 'open',
    })),
    searchIssues: vi.fn().mockResolvedValue([]),
    createInput: vi.fn().mockImplementation((data) => ({
      id: 'mock-input-id',
      ...data,
      timestamp: new Date(),
    })),
    addToPond: vi.fn().mockImplementation((data) => ({
      id: 'mock-pond-id',
      ...data,
    })),
    searchPond: vi.fn().mockResolvedValue([]),
    getPondSources: vi.fn().mockResolvedValue([]),
    start: vi.fn().mockResolvedValue(undefined),
    isReady: vi.fn().mockReturnValue(true),
    getHealthStatus: vi.fn().mockReturnValue({
      ready: true,
      engine: 'running',
      database: true,
      agent: true
    }),
  }))
}));

describe('API Unit Tests', () => {
  let app: express.Application;
  let mockEngine: any;
  
  beforeEach(async () => {
    // モックをリセット
    vi.clearAllMocks();
    
    // Expressアプリを作成
    app = express();
    app.use(express.json());
    
    // モックエンジンを作成
    const { CoreEngine } = await import('../src/core/engine');
    mockEngine = new CoreEngine();
    
    // APIルートを設定（実際のアプリケーションと同じ構成）
    const apiRouter = createApiRouter(mockEngine);
    app.use('/api', apiRouter);
    
    // ヘルスチェックエンドポイント
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    // エラーハンドリングミドルウェア（JSONパースエラーを含む）
    app.use((err: any, req: any, res: any, next: any) => {
      if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
      res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
    });
  });
  
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String)
      });
    });
  });
  
  describe('GET /api/system/state', () => {
    it('should return current state', async () => {
      const response = await request(app)
        .get('/api/system/state')
        .expect(200)
        .expect('Content-Type', /text\/plain/);
      
      expect(response.text).toBe('# Mock State');
      expect(mockEngine.getState).toHaveBeenCalled();
    });
  });
  
  describe('PUT /api/system/state', () => {
    it('should update state', async () => {
      const newState = '# Updated State';
      
      const response = await request(app)
        .put('/api/system/state')
        .send({ content: newState })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(mockEngine.updateState).toHaveBeenCalledWith(newState);
    });
    
    it('should validate state content', async () => {
      const response = await request(app)
        .put('/api/system/state')
        .send({ }) // contentが無い
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });
  
  describe('POST /api/inputs', () => {
    it('should accept input data', async () => {
      const inputData = {
        source: 'test',
        content: 'Test input'
      };
      
      const response = await request(app)
        .post('/api/inputs')
        .send(inputData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          id: 'mock-input-id',
          source: 'test',
          content: 'Test input'
        })
      );
      
      expect(mockEngine.createInput).toHaveBeenCalledWith(
        expect.objectContaining(inputData)
      );
    });
    
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/inputs')
        .send({ source: 'test' }) // contentが無い
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });
  
  describe('POST /api/issues', () => {
    it('should create issue', async () => {
      const issueData = {
        title: 'Test Issue',
        description: 'Test description',
        labels: ['bug']
      };
      
      const response = await request(app)
        .post('/api/issues')
        .send(issueData)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          id: 'mock-issue-id',
          title: 'Test Issue',
          description: 'Test description',
          status: 'open'
        })
      );
      
      expect(mockEngine.createIssue).toHaveBeenCalled();
    });
  });
  
  describe('GET /api/issues', () => {
    it('should search issues with query', async () => {
      mockEngine.searchIssues.mockResolvedValue([
        { id: '1', title: 'Issue 1', status: 'open' },
        { id: '2', title: 'Issue 2', status: 'closed' }
      ]);
      
      const response = await request(app)
        .get('/api/issues')
        .query({ q: 'test' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([
        { id: '1', title: 'Issue 1', status: 'open' },
        { id: '2', title: 'Issue 2', status: 'closed' }
      ]);
      
      expect(mockEngine.searchIssues).toHaveBeenCalledWith('test');
    });
    
    it('should return empty array without query', async () => {
      const response = await request(app)
        .get('/api/issues')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });
  
  describe('GET /api/pond', () => {
    it('should search pond with query', async () => {
      mockEngine.searchPond.mockResolvedValue({
        data: [
          { 
            id: 'p1', 
            content: 'Entry 1', 
            source: 'test',
            timestamp: new Date('2024-01-01'),
            score: 0.95,
            distance: 0.05
          },
          { 
            id: 'p2', 
            content: 'Entry 2', 
            source: 'test',
            timestamp: new Date('2024-01-02'),
            score: 0.85,
            distance: 0.15
          }
        ],
        meta: {
          total: 2,
          limit: 20,
          offset: 0,
          hasMore: false
        }
      });
      
      const response = await request(app)
        .get('/api/pond')
        .query({ q: 'test query' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
      expect(mockEngine.searchPond).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'test query' })
      );
    });

    it('should search pond with filters', async () => {
      mockEngine.searchPond.mockResolvedValue({
        data: [],
        meta: {
          total: 0,
          limit: 10,
          offset: 0,
          hasMore: false
        }
      });
      
      const response = await request(app)
        .get('/api/pond')
        .query({ 
          q: 'test',
          source: 'manual',
          limit: 10,
          offset: 0
        })
        .expect(200);
      
      expect(mockEngine.searchPond).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'test',
          source: 'manual',
          limit: 10,
          offset: 0
        })
      );
    });

    it('should handle empty search results', async () => {
      mockEngine.searchPond.mockResolvedValue({
        data: [],
        meta: {
          total: 0,
          limit: 20,
          offset: 0,
          hasMore: false
        }
      });
      
      const response = await request(app)
        .get('/api/pond')
        .query({ q: 'nonexistent' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBe(0);
    });
  });
  
  describe('GET /api/pond/sources', () => {
    it('should get pond sources', async () => {
      mockEngine.getPondSources.mockResolvedValue(['manual', 'automated', 'test']);
      
      const response = await request(app)
        .get('/api/pond/sources')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(['manual', 'automated', 'test']);
      expect(mockEngine.getPondSources).toHaveBeenCalled();
    });

    it('should handle empty sources', async () => {
      mockEngine.getPondSources.mockResolvedValue([]);
      
      const response = await request(app)
        .get('/api/pond/sources')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle 404', async () => {
      const response = await request(app)
        .get('/api/unknown')
        .expect(404);
      
      // 404ハンドラーが空オブジェクトを返す場合もある
      expect(response.status).toBe(404);
    });
    
    it('should handle invalid JSON', async () => {
      const response = await request(app)
        .post('/api/inputs')
        .set('Content-Type', 'application/json')
        .send('{ invalid json')
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  // レート制限のテストはE2Eテストで実施
  // TODO: test/e2e/rate-limiting.test.tsに実装
});