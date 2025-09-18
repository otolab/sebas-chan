import { Router } from 'express';
import { CoreEngine } from '../../core/engine.js';
import type { PondEntry } from '@sebas-chan/shared-types';

export function createPondRouter(coreEngine: CoreEngine): Router {
  const router = Router();

  // GET /api/pond - 高度なフィルタリング付き取得
  router.get('/', async (req, res, next) => {
    try {
      const { q = '', source, dateFrom, dateTo, limit = '20', offset = '0' } = req.query;

      const limitNumber = parseInt(limit as string, 10);
      const offsetNumber = parseInt(offset as string, 10);

      console.log('[API Route] Pondフィルタリング受信:', {
        q,
        source,
        dateFrom,
        dateTo,
        limit: limitNumber,
        offset: offsetNumber,
      });

      // CoreEngineのフィルタリングメソッドを使用
      const result = await coreEngine.searchPond({
        q: q as string,
        source: source as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        limit: limitNumber,
        offset: offsetNumber,
      });

      res.json({
        success: true,
        data: result.data,
        meta: result.meta,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/pond/sources - 利用可能なソース一覧
  router.get('/sources', async (req, res, next) => {
    try {
      // DBから直接ソース一覧を取得
      const sources = await coreEngine.getPondSources();

      res.json({
        success: true,
        data: sources,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/pond - 追加
  router.post('/', async (req, res, next) => {
    try {
      const { content, source } = req.body;

      if (!content || !source) {
        return res.status(400).json({
          success: false,
          error: 'Content and source are required',
          timestamp: new Date(),
        });
      }

      const entry = await coreEngine.addToPond({
        content,
        source,
        timestamp: new Date(),
      });

      res.status(201).json({
        success: true,
        data: entry,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
