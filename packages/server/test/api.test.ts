/**
 * API Unit Tests - モックを使用した単体テスト
 * 
 * 実際のDBやCoreEngineを使わずに、APIエンドポイントのロジックをテスト
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAPIRoutes } from '../src/api/routes';

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
  }))
}));

describe('API Unit Tests', () => {
  let app: express.Application;
  let mockEngine: any;
  
  beforeEach(() => {
    // モックをリセット
    vi.clearAllMocks();
    
    // Expressアプリを作成
    app = express();
    app.use(express.json());
    
    // モックエンジンを作成
    const { CoreEngine } = require('../src/core/engine');
    mockEngine = new CoreEngine();
    
    // APIルートを設定
    const routes = createAPIRoutes(mockEngine);
    app.use('/api', routes);
    
    // ヘルスチェックエンドポイント
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
  
  describe('GET /api/state', () => {
    it('should return current state', async () => {
      const response = await request(app)
        .get('/api/state')
        .expect(200);
      
      expect(response.body).toEqual({
        state: '# Mock State'
      });
      expect(mockEngine.getState).toHaveBeenCalled();
    });
  });
  
  describe('POST /api/state', () => {
    it('should update state', async () => {
      const newState = '# Updated State';
      
      const response = await request(app)
        .post('/api/state')
        .send({ content: newState })
        .expect(200);
      
      expect(response.body).toEqual({
        message: 'State updated'
      });
      expect(mockEngine.updateState).toHaveBeenCalledWith(newState);
    });
    
    it('should validate state content', async () => {
      const response = await request(app)
        .post('/api/state')
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
      
      expect(response.body).toEqual({
        id: 'mock-input-id',
        message: 'Input received',
        input: expect.objectContaining({
          id: 'mock-input-id',
          source: 'test',
          content: 'Test input'
        })
      });
      
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
      
      expect(response.body).toEqual({
        id: 'mock-issue-id',
        issue: expect.objectContaining({
          title: 'Test Issue',
          description: 'Test description',
          status: 'open'
        })
      });
      
      expect(mockEngine.createIssue).toHaveBeenCalled();
    });
  });
  
  describe('GET /api/issues/search', () => {
    it('should search issues', async () => {
      mockEngine.searchIssues.mockResolvedValue([
        { id: '1', title: 'Issue 1', status: 'open' },
        { id: '2', title: 'Issue 2', status: 'closed' }
      ]);
      
      const response = await request(app)
        .get('/api/issues/search')
        .query({ q: 'test' })
        .expect(200);
      
      expect(response.body).toEqual({
        results: [
          { id: '1', title: 'Issue 1', status: 'open' },
          { id: '2', title: 'Issue 2', status: 'closed' }
        ]
      });
      
      expect(mockEngine.searchIssues).toHaveBeenCalledWith('test');
    });
    
    it('should handle empty query', async () => {
      const response = await request(app)
        .get('/api/issues/search')
        .expect(200);
      
      expect(response.body).toEqual({
        results: []
      });
    });
  });
  
  describe('POST /api/pond', () => {
    it('should add to pond', async () => {
      const pondData = {
        content: 'Test pond entry',
        source: 'test'
      };
      
      const response = await request(app)
        .post('/api/pond')
        .send(pondData)
        .expect(201);
      
      expect(response.body).toEqual({
        id: 'mock-pond-id',
        message: 'Added to pond'
      });
      
      expect(mockEngine.addToPond).toHaveBeenCalledWith(
        expect.objectContaining(pondData)
      );
    });
  });
  
  describe('GET /api/pond/search', () => {
    it('should search pond', async () => {
      mockEngine.searchPond.mockResolvedValue([
        { id: 'p1', content: 'Entry 1', source: 'test' },
        { id: 'p2', content: 'Entry 2', source: 'test' }
      ]);
      
      const response = await request(app)
        .get('/api/pond/search')
        .query({ q: 'test' })
        .expect(200);
      
      expect(response.body).toEqual({
        results: [
          { id: 'p1', content: 'Entry 1', source: 'test' },
          { id: 'p2', content: 'Entry 2', source: 'test' }
        ]
      });
      
      expect(mockEngine.searchPond).toHaveBeenCalledWith('test', undefined);
    });
    
    it('should support limit parameter', async () => {
      const response = await request(app)
        .get('/api/pond/search')
        .query({ q: 'test', limit: 5 })
        .expect(200);
      
      expect(mockEngine.searchPond).toHaveBeenCalledWith('test', 5);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle 404', async () => {
      const response = await request(app)
        .get('/api/unknown')
        .expect(404);
      
      expect(response.body).toHaveProperty('error');
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
  
  describe('Rate Limiting', () => {
    it.skip('should rate limit requests', async () => {
      // レート制限のテストはE2Eで実施
    });
  });
});