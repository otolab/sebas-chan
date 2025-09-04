import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createIssuesRouter } from './issues';
import { CoreEngine } from '../../core/engine';
import { errorHandler } from '../middleware/error-handler';

describe('Issues API Routes', () => {
  let app: express.Application;
  let coreEngine: CoreEngine;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    coreEngine = new CoreEngine();
    
    // CoreEngineのメソッドをモック
    vi.spyOn(coreEngine, 'searchIssues').mockResolvedValue([]);
    vi.spyOn(coreEngine, 'getIssue').mockImplementation(async (id) => ({
      id,
      title: 'Test Issue',
      description: 'Test description',
      status: 'open',
      labels: [],
      updates: [],
      relations: [],
      sourceInputIds: []
    }));
    vi.spyOn(coreEngine, 'createIssue').mockImplementation(async (data) => ({
      id: 'issue-123',
      ...data
    }));
    vi.spyOn(coreEngine, 'updateIssue').mockImplementation(async (id, data) => ({
      id,
      title: data.title || 'Test Issue',
      description: data.description || 'Test description',
      status: data.status || 'open',
      labels: data.labels || [],
      updates: [],
      relations: [],
      sourceInputIds: []
    }));
    
    app.use('/issues', createIssuesRouter(coreEngine));
    app.use(errorHandler);
  });
  
  describe('GET /issues', () => {
    it('should return empty array when no query provided', async () => {
      const response = await request(app)
        .get('/issues')
        .expect(200);
      
      expect(response.body).toEqual({
        success: true,
        data: [],
        timestamp: expect.any(String)
      });
      
      expect(coreEngine.searchIssues).not.toHaveBeenCalled();
    });
    
    it('should search issues with query parameter', async () => {
      const mockIssues = [
        {
          id: 'issue-1',
          title: 'Bug in login',
          description: 'Login fails',
          status: 'open',
          labels: ['bug'],
          updates: [],
          relations: [],
          sourceInputIds: []
        }
      ];
      
      vi.spyOn(coreEngine, 'searchIssues').mockResolvedValue(mockIssues);
      
      const response = await request(app)
        .get('/issues?q=login')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockIssues);
      expect(coreEngine.searchIssues).toHaveBeenCalledWith('login');
    });
  });
  
  describe('GET /issues/:id', () => {
    it('should return issue by id', async () => {
      const response = await request(app)
        .get('/issues/issue-123')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('issue-123');
      expect(response.body.data.title).toBe('Test Issue');
      expect(coreEngine.getIssue).toHaveBeenCalledWith('issue-123');
    });
    
    it('should handle errors', async () => {
      vi.spyOn(coreEngine, 'getIssue').mockRejectedValue(new Error('Issue not found'));
      
      const response = await request(app)
        .get('/issues/non-existent')
        .expect(500);
      
      expect(response.body.success).toBe(false);
    });
  });
  
  describe('POST /issues', () => {
    it('should create new issue', async () => {
      const newIssue = {
        title: 'New Bug',
        description: 'Description of the bug',
        labels: ['bug', 'urgent']
      };
      
      const response = await request(app)
        .post('/issues')
        .send(newIssue)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('issue-123');
      expect(response.body.data.title).toBe('New Bug');
      
      expect(coreEngine.createIssue).toHaveBeenCalledWith({
        title: 'New Bug',
        description: 'Description of the bug',
        status: 'open',
        labels: ['bug', 'urgent'],
        updates: [],
        relations: [],
        sourceInputIds: []
      });
    });
    
    it('should handle optional fields', async () => {
      const minimalIssue = {
        title: 'Minimal Issue',
        description: 'Just the basics'
      };
      
      const response = await request(app)
        .post('/issues')
        .send(minimalIssue)
        .expect(201);
      
      expect(response.body.success).toBe(true);
      
      expect(coreEngine.createIssue).toHaveBeenCalledWith({
        title: 'Minimal Issue',
        description: 'Just the basics',
        status: 'open',
        labels: [],
        updates: [],
        relations: [],
        sourceInputIds: []
      });
    });
  });
  
  describe('PATCH /issues/:id', () => {
    it('should update issue', async () => {
      const update = {
        status: 'closed',
        labels: ['resolved']
      };
      
      const response = await request(app)
        .patch('/issues/issue-123')
        .send(update)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(coreEngine.updateIssue).toHaveBeenCalledWith('issue-123', update);
    });
    
    it('should handle partial updates', async () => {
      const partialUpdate = {
        title: 'Updated Title'
      };
      
      const response = await request(app)
        .patch('/issues/issue-456')
        .send(partialUpdate)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Updated Title');
      expect(coreEngine.updateIssue).toHaveBeenCalledWith('issue-456', partialUpdate);
    });
  });
});