import { Router } from 'express';
import { CoreEngine } from '../../core/engine.js';

export function createStateRouter(coreEngine: CoreEngine): Router {
  const router = Router();

  // GET /api/state - 現在のStateを取得
  router.get('/', async (req, res, next) => {
    try {
      const state = await coreEngine.getState();

      res.json({
        success: true,
        data: {
          content: state,
          lastUpdate: await coreEngine.getStateLastUpdate(),
        },
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  // PUT /api/state - Stateを更新
  router.put('/', async (req, res, next) => {
    try {
      const { content } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid state content',
        });
      }

      await coreEngine.updateState(content);

      res.json({
        success: true,
        data: {
          content,
          lastUpdate: new Date(),
        },
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/state/append - Stateに追記
  router.post('/append', async (req, res, next) => {
    try {
      const { section, content } = req.body;

      if (!section || !content) {
        return res.status(400).json({
          success: false,
          error: 'Section and content are required',
        });
      }

      await coreEngine.appendToState(section, content);
      const updatedState = await coreEngine.getState();

      res.json({
        success: true,
        data: {
          content: updatedState,
          lastUpdate: new Date(),
        },
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}