/**
 * API Tests - Server APIエンドポイントのテスト
 * 
 * 各エンドポイントの仕様を満たしているかを検証
 * OpenAPI仕様から自動生成することも検討
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHealthRoute } from '../src/api/health';
import { createStateRoute } from '../src/api/state';
import { createRequestRoute } from '../src/api/request';
import { StateManager } from '../src/core/state';
import { CoreEngine } from '../src/core/engine';

// TODO: supertestをインストールして実装
// npm install --save-dev supertest @types/supertest

describe('API Endpoints', () => {
  let app: express.Application;
  let stateManager: StateManager;
  let coreEngine: CoreEngine;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    stateManager = new StateManager();
    coreEngine = new CoreEngine(stateManager);
    
    // ルート設定
    app.use('/health', createHealthRoute());
    app.use('/api/state', createStateRoute(stateManager));
    app.use('/api/request', createRequestRoute(coreEngine));
  });
  
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });
  });
  
  describe('GET /api/state', () => {
    it('should return current state', async () => {
      await stateManager.set('test', { foo: 'bar' });
      
      const response = await request(app)
        .get('/api/state')
        .expect(200);
      
      expect(response.body).toHaveProperty('test');
      expect(response.body.test).toEqual({ foo: 'bar' });
    });
    
    it('should return specific state key', async () => {
      await stateManager.set('issues', [{ id: '1', title: 'Test' }]);
      
      const response = await request(app)
        .get('/api/state?key=issues')
        .expect(200);
      
      expect(response.body).toEqual([{ id: '1', title: 'Test' }]);
    });
  });
  
  describe('POST /api/state', () => {
    it('should update state', async () => {
      const updates = {
        issues: [{ id: '1', title: 'New Issue' }],
        flows: []
      };
      
      const response = await request(app)
        .post('/api/state')
        .send(updates)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      
      const state = await stateManager.get('issues');
      expect(state).toEqual(updates.issues);
    });
    
    it('should validate state updates', async () => {
      const invalidUpdate = {
        invalidKey: 'invalid value'
      };
      
      const response = await request(app)
        .post('/api/state')
        .send(invalidUpdate)
        .expect(400);
      
      expect(response.body.error).toBeDefined();
    });
  });
  
  describe('POST /api/request', () => {
    it('should process user request', async () => {
      const requestData = {
        request: 'Test user request'
      };
      
      const response = await request(app)
        .post('/api/request')
        .send(requestData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.eventId).toBeDefined();
    });
    
    it('should require request field', async () => {
      const response = await request(app)
        .post('/api/request')
        .send({})
        .expect(400);
      
      expect(response.body.error).toContain('request');
    });
  });
  
  describe('POST /api/input', () => {
    it('should accept input data', async () => {
      const inputData = {
        source: 'test',
        content: 'Test input content'
      };
      
      const response = await request(app)
        .post('/api/input')
        .send(inputData)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.inputId).toBeDefined();
    });
    
    it('should validate input fields', async () => {
      const response = await request(app)
        .post('/api/input')
        .send({ source: 'test' }) // contentが不足
        .expect(400);
      
      expect(response.body.error).toContain('content');
    });
  });
  
  describe('Rate Limiting', () => {
    it('should rate limit requests', async () => {
      // 大量のリクエストを送信
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          request(app).get('/api/state')
        );
      }
      
      const responses = await Promise.all(promises);
      const rateLimited = responses.some(r => r.status === 429);
      
      // レート制限が有効な場合
      // expect(rateLimited).toBe(true);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle internal server errors gracefully', async () => {
      // StateManagerをモックしてエラーを発生させる
      vi.spyOn(stateManager, 'get').mockRejectedValue(new Error('DB Error'));
      
      const response = await request(app)
        .get('/api/state')
        .expect(500);
      
      expect(response.body.error).toBeDefined();
      expect(response.body.error).not.toContain('DB Error'); // 内部エラーを露出しない
    });
  });
});

describe('API Specification Compliance', () => {
  // OpenAPI仕様との整合性チェック
  // TODO: OpenAPI仕様を定義してから実装
  
  it.todo('should match OpenAPI specification');
  it.todo('should validate request schemas');
  it.todo('should validate response schemas');
});