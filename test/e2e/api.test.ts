/**
 * API E2E Tests - 実際のサーバーとDBを使用したエンドツーエンドテスト
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../packages/server/src/app';
import { setupTestEnvironment, teardownTestEnvironment } from '../integration/setup';

describe('API E2E Tests', () => {
  let app: any;
  
  beforeAll(async () => {
    // DBの初期化を先に行う
    await setupTestEnvironment();
    
    // アプリケーションを作成（実際のDBとCoreEngineを使用）
    app = await createApp();
  }, 60000); // 60秒のタイムアウト
  
  afterAll(async () => {
    await teardownTestEnvironment();
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
  
  describe('POST /api/inputs', () => {
    it('should accept and process input data', async () => {
      const inputData = {
        source: 'e2e-test',
        content: 'E2Eテスト用の入力データ：システムエラーが発生しました',
      };

      const response = await request(app)
        .post('/api/inputs')
        .send(inputData)
        .expect(201);
      
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('message', 'Input received');
      expect(response.body.input).toMatchObject({
        source: inputData.source,
        content: inputData.content,
      });
    });

    it('should validate required fields', async () => {
      const invalidData = {
        source: 'e2e-test',
        // contentが欠落
      };

      const response = await request(app)
        .post('/api/inputs')
        .send(invalidData)
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/state', () => {
    it('should return current state document', async () => {
      const response = await request(app)
        .get('/api/state')
        .expect(200);
      
      expect(response.body).toHaveProperty('state');
      expect(typeof response.body.state).toBe('string');
    });
  });

  describe('POST /api/state', () => {
    it('should update state document', async () => {
      const newState = '# Updated State\nTest content from E2E test';
      
      const response = await request(app)
        .post('/api/state')
        .send({ content: newState })
        .expect(200);
      
      expect(response.body).toHaveProperty('message', 'State updated');

      // 更新を確認
      const getResponse = await request(app)
        .get('/api/state')
        .expect(200);
      
      expect(getResponse.body.state).toBe(newState);
    });
  });

  describe('POST /api/issues', () => {
    it('should create a new issue', async () => {
      const issueData = {
        title: 'E2Eテスト用Issue',
        description: 'このIssueはE2Eテストで作成されました',
        labels: ['test', 'e2e'],
      };

      const response = await request(app)
        .post('/api/issues')
        .send(issueData)
        .expect(201);
      
      expect(response.body).toHaveProperty('id');
      expect(response.body.issue).toMatchObject({
        title: issueData.title,
        description: issueData.description,
        status: 'open',
      });
    });
  });

  describe('GET /api/issues/search', () => {
    it('should search issues by query', async () => {
      // まずIssueを作成
      await request(app)
        .post('/api/issues')
        .send({
          title: '検索テスト用Issue',
          description: 'データベース接続エラー',
          labels: ['database'],
        });

      // 検索
      const response = await request(app)
        .get('/api/issues/search')
        .query({ q: 'データベース' })
        .expect(200);
      
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });
  });

  describe('POST /api/pond', () => {
    it('should add entry to pond', async () => {
      const pondData = {
        content: 'E2Eテスト：Pondへの直接追加',
        source: 'e2e-test',
      };

      const response = await request(app)
        .post('/api/pond')
        .send(pondData)
        .expect(201);
      
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('message', 'Added to pond');
    });
  });

  describe('GET /api/pond/search', () => {
    it('should search pond entries', async () => {
      // まずPondにデータを追加
      await request(app)
        .post('/api/pond')
        .send({
          content: 'Elasticsearchのエラーログ',
          source: 'e2e-test',
        });

      // 検索
      const response = await request(app)
        .get('/api/pond/search')
        .query({ q: 'Elasticsearch' })
        .expect(200);
      
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it.skip('should rate limit excessive requests', async () => {
      // レート制限のテスト（実装されている場合）
      const requests = [];
      
      // 短時間に多数のリクエストを送信
      for (let i = 0; i < 20; i++) {
        requests.push(
          request(app)
            .get('/health')
        );
      }

      const responses = await Promise.all(requests);
      
      // いくつかのリクエストが429 (Too Many Requests)を返すことを確認
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown-endpoint')
        .expect(404);
      
      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/inputs')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });
});