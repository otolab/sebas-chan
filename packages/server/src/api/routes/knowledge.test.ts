import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createKnowledgeRouter } from './knowledge.js';
import { CoreEngine } from '../../core/engine.js';
import { Knowledge } from '@sebas-chan/shared-types';

vi.mock('../../core/engine.js');

describe('Knowledge Routes', () => {
  let app: express.Application;
  let mockCoreEngine: CoreEngine;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockCoreEngine = {
      searchKnowledge: vi.fn(),
      getKnowledge: vi.fn(),
      createKnowledge: vi.fn(),
      updateKnowledge: vi.fn(),
    } as unknown as CoreEngine;

    const router = createKnowledgeRouter(mockCoreEngine);
    app.use('/api/knowledge', router);
  });

  describe('GET /api/knowledge', () => {
    it('should search knowledge with query', async () => {
      const mockKnowledge: Knowledge[] = [
        {
          id: 'k1',
          type: 'factoid',
          content: 'System requires 8GB RAM minimum',
          reputation: { upvotes: 5, downvotes: 1 },
          sources: [{ type: 'issue', issueId: 'issue-1' }],
        },
      ];

      vi.mocked(mockCoreEngine.searchKnowledge).mockResolvedValue(mockKnowledge);

      const response = await request(app).get('/api/knowledge?q=RAM');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: mockKnowledge,
      });
      expect(mockCoreEngine.searchKnowledge).toHaveBeenCalledWith('RAM');
    });

    it('should return empty array without query', async () => {
      const response = await request(app).get('/api/knowledge');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: [],
      });
      expect(mockCoreEngine.searchKnowledge).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/knowledge/:id', () => {
    it('should get knowledge by id', async () => {
      const mockKnowledge: Knowledge = {
        id: 'k1',
        type: 'solution',
        content: 'Restart the service to fix the issue',
        reputation: { upvotes: 10, downvotes: 0 },
        sources: [
          { type: 'issue', issueId: 'issue-2' },
          { type: 'issue', issueId: 'issue-3' },
        ],
      };

      vi.mocked(mockCoreEngine.getKnowledge).mockResolvedValue(mockKnowledge);

      const response = await request(app).get('/api/knowledge/k1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: mockKnowledge,
      });
      expect(mockCoreEngine.getKnowledge).toHaveBeenCalledWith('k1');
    });

    it('should handle not found error', async () => {
      vi.mocked(mockCoreEngine.getKnowledge).mockRejectedValue(new Error('Not found'));

      const response = await request(app).get('/api/knowledge/invalid');

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/knowledge', () => {
    it('should create new knowledge', async () => {
      const newKnowledge = {
        type: 'pattern' as const,
        content: 'Error occurs when memory exceeds 80%',
        sources: [{ type: 'user_direct' }],
      };

      const createdKnowledge: Knowledge = {
        id: 'k2',
        ...newKnowledge,
        reputation: { upvotes: 0, downvotes: 0 },
      };

      vi.mocked(mockCoreEngine.createKnowledge).mockResolvedValue(createdKnowledge);

      const response = await request(app).post('/api/knowledge').send(newKnowledge);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: createdKnowledge,
      });
      expect(mockCoreEngine.createKnowledge).toHaveBeenCalledWith({
        type: newKnowledge.type,
        content: newKnowledge.content,
        reputation: { upvotes: 0, downvotes: 0 },
        sources: newKnowledge.sources,
      });
    });

    it('should handle creation errors', async () => {
      vi.mocked(mockCoreEngine.createKnowledge).mockRejectedValue(new Error('Creation failed'));

      const response = await request(app).post('/api/knowledge').send({
        type: 'factoid',
        content: 'Test content',
      });

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/knowledge/:id/reputation', () => {
    it('should upvote knowledge', async () => {
      const existingKnowledge: Knowledge = {
        id: 'k1',
        type: 'solution',
        content: 'Test solution',
        reputation: { upvotes: 5, downvotes: 2 },
        sources: [],
      };

      const updatedKnowledge: Knowledge = {
        ...existingKnowledge,
        reputation: { upvotes: 6, downvotes: 2 },
      };

      vi.mocked(mockCoreEngine.getKnowledge).mockResolvedValue(existingKnowledge);
      vi.mocked(mockCoreEngine.updateKnowledge).mockResolvedValue(updatedKnowledge);

      const response = await request(app)
        .post('/api/knowledge/k1/reputation')
        .send({ action: 'upvote' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: updatedKnowledge,
      });
      expect(mockCoreEngine.updateKnowledge).toHaveBeenCalledWith('k1', {
        reputation: { upvotes: 6, downvotes: 2 },
      });
    });

    it('should downvote knowledge', async () => {
      const existingKnowledge: Knowledge = {
        id: 'k1',
        type: 'factoid',
        content: 'Test factoid',
        reputation: { upvotes: 3, downvotes: 1 },
        sources: [],
      };

      const updatedKnowledge: Knowledge = {
        ...existingKnowledge,
        reputation: { upvotes: 3, downvotes: 2 },
      };

      vi.mocked(mockCoreEngine.getKnowledge).mockResolvedValue(existingKnowledge);
      vi.mocked(mockCoreEngine.updateKnowledge).mockResolvedValue(updatedKnowledge);

      const response = await request(app)
        .post('/api/knowledge/k1/reputation')
        .send({ action: 'downvote' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: updatedKnowledge,
      });
      expect(mockCoreEngine.updateKnowledge).toHaveBeenCalledWith('k1', {
        reputation: { upvotes: 3, downvotes: 2 },
      });
    });

    it('should handle knowledge not found', async () => {
      vi.mocked(mockCoreEngine.getKnowledge).mockRejectedValue(new Error('Not found'));

      const response = await request(app)
        .post('/api/knowledge/invalid/reputation')
        .send({ action: 'upvote' });

      expect(response.status).toBe(500);
    });
  });
});
