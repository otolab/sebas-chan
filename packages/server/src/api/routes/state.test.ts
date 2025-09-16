import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createStateRouter } from './state.js';
import { CoreEngine } from '../../core/engine.js';

vi.mock('../../core/engine.js');

describe('State Routes', () => {
  let app: express.Application;
  let mockCoreEngine: CoreEngine;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockCoreEngine = {
      getState: vi.fn(),
      updateState: vi.fn(),
      appendToState: vi.fn(),
      getStateLastUpdate: vi.fn(),
    } as unknown as CoreEngine;

    const router = createStateRouter(mockCoreEngine);
    app.use('/api/state', router);
  });

  describe('GET /api/state', () => {
    it('should return current state', async () => {
      const mockState = '## Current State\n- Task 1 completed\n- Task 2 in progress';
      const mockLastUpdate = new Date('2024-01-01T12:00:00Z');

      vi.mocked(mockCoreEngine.getState).mockResolvedValue(mockState);
      vi.mocked(mockCoreEngine.getStateLastUpdate).mockResolvedValue(mockLastUpdate);

      const response = await request(app).get('/api/state');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          content: mockState,
          lastUpdate: mockLastUpdate.toISOString(),
        },
      });
      expect(mockCoreEngine.getState).toHaveBeenCalled();
      expect(mockCoreEngine.getStateLastUpdate).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockCoreEngine.getState).mockRejectedValue(new Error('State retrieval failed'));

      const response = await request(app).get('/api/state');

      expect(response.status).toBe(500);
    });
  });

  describe('PUT /api/state', () => {
    it('should update state with valid content', async () => {
      const newState = '## Updated State\n- All tasks completed';

      const response = await request(app).put('/api/state').send({ content: newState });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          content: newState,
        },
      });
      expect(mockCoreEngine.updateState).toHaveBeenCalledWith(newState);
    });

    it('should return 400 for invalid content', async () => {
      const response = await request(app).put('/api/state').send({ content: 123 }); // Invalid type

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid state content',
      });
      expect(mockCoreEngine.updateState).not.toHaveBeenCalled();
    });

    it('should return 400 for missing content', async () => {
      const response = await request(app).put('/api/state').send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Invalid state content',
      });
    });
  });

  describe('POST /api/state/append', () => {
    it('should append to state with valid section and content', async () => {
      const section = 'Tasks';
      const content = '- New task added';
      const updatedState = '## Tasks\n- Existing task\n- New task added';

      vi.mocked(mockCoreEngine.getState).mockResolvedValue(updatedState);

      const response = await request(app).post('/api/state/append').send({ section, content });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          content: updatedState,
        },
      });
      expect(mockCoreEngine.appendToState).toHaveBeenCalledWith(section, content);
      expect(mockCoreEngine.getState).toHaveBeenCalled();
    });

    it('should return 400 for missing section', async () => {
      const response = await request(app)
        .post('/api/state/append')
        .send({ content: 'Some content' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Section and content are required',
      });
      expect(mockCoreEngine.appendToState).not.toHaveBeenCalled();
    });

    it('should return 400 for missing content', async () => {
      const response = await request(app).post('/api/state/append').send({ section: 'Tasks' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Section and content are required',
      });
      expect(mockCoreEngine.appendToState).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockCoreEngine.appendToState).mockImplementation(() => {
        throw new Error('Append failed');
      });

      const response = await request(app)
        .post('/api/state/append')
        .send({ section: 'Tasks', content: 'New content' });

      expect(response.status).toBe(500);
    });
  });
});
