/**
 * API Routes
 *
 * APIエンドポイントの定義
 */

import { Router } from 'express';
import { CoreEngine } from '../core/engine.js';

export function createAPIRoutes(engine: CoreEngine): Router {
  const router = Router();

  // State管理
  router.get('/state', (req, res) => {
    const state = engine.getState();
    res.json({ state });
  });

  router.post('/state', (req, res) => {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    engine.updateState(content);
    res.json({ message: 'State updated' });
  });

  // Input管理
  router.post('/inputs', async (req, res) => {
    const { source, content } = req.body;

    if (!source || !content) {
      return res.status(400).json({ error: 'Source and content are required' });
    }

    try {
      const input = await engine.createInput({
        source,
        content,
        timestamp: new Date(),
      });

      res.status(201).json({
        id: input.id,
        message: 'Input received',
        input,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // Issue管理
  router.post('/issues', async (req, res) => {
    const { title, description, labels = [] } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    try {
      const issue = await engine.createIssue({
        title,
        description,
        status: 'open',
        labels,
        updates: [],
        relations: [],
        sourceInputIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      res.status(201).json({
        id: issue.id,
        issue,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  router.get('/issues/search', async (req, res) => {
    const { q: query = '' } = req.query;

    try {
      const results = await engine.searchIssues(query as string);
      res.json({ results });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  // 404ハンドラー
  router.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return router;
}
