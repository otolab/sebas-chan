import { Router } from 'express';
import { z } from 'zod';
import type { CoreEngine } from '../../core/engine.js';

export function createLogsRouter(coreEngine: CoreEngine): Router {
  const router = Router();

  // ログ検索のスキーマ
  const logsQuerySchema = z.object({
    executionId: z.string().optional(),
    workflowType: z.string().optional(),
    level: z.enum(['info', 'warn', 'error', 'debug']).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
  });

  // GET /logs - ログ一覧取得
  router.get('/', async (req, res, next) => {
    try {
      const query = logsQuerySchema.parse(req.query);

      // 簡易的なログデータ（実際はDBから取得）
      const mockLogs = [
        {
          id: '1',
          executionId: 'exec-001',
          workflowType: 'PROCESS_USER_REQUEST',
          timestamp: new Date(),
          level: 'info',
          message: 'Processing user request',
          metadata: { userId: 'user-123' },
        },
        {
          id: '2',
          executionId: 'exec-001',
          workflowType: 'PROCESS_USER_REQUEST',
          timestamp: new Date(),
          level: 'debug',
          message: 'Request classified as: question',
          metadata: { classification: 'question' },
        },
        {
          id: '3',
          executionId: 'exec-002',
          workflowType: 'INGEST_INPUT',
          timestamp: new Date(),
          level: 'info',
          message: 'Ingesting input to Pond',
          metadata: { source: 'slack' },
        },
      ];

      // フィルタリング（簡易実装）
      let logs = mockLogs;
      if (query.executionId) {
        logs = logs.filter(log => log.executionId === query.executionId);
      }
      if (query.workflowType) {
        logs = logs.filter(log => log.workflowType === query.workflowType);
      }
      if (query.level) {
        logs = logs.filter(log => log.level === query.level);
      }

      // ページネーション
      const total = logs.length;
      const paginatedLogs = logs.slice(query.offset, query.offset + query.limit);

      res.json({
        success: true,
        data: paginatedLogs,
        meta: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + query.limit < total,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /logs/:executionId - 特定実行IDのログ詳細取得
  router.get('/:executionId', async (req, res, next) => {
    try {
      const { executionId } = req.params;

      // 簡易的なログ詳細データ
      const mockLogDetail = {
        executionId,
        workflowType: 'PROCESS_USER_REQUEST',
        startTime: new Date(Date.now() - 5000),
        endTime: new Date(),
        status: 'completed',
        input: {
          type: 'USER_REQUEST',
          payload: { content: 'How do I reset my password?' },
        },
        output: {
          success: true,
          events: ['EXTRACT_KNOWLEDGE'],
        },
        logs: [
          {
            timestamp: new Date(Date.now() - 4000),
            level: 'info',
            message: 'Starting workflow execution',
          },
          {
            timestamp: new Date(Date.now() - 3000),
            level: 'debug',
            message: 'Calling AI driver for classification',
          },
          {
            timestamp: new Date(Date.now() - 2000),
            level: 'info',
            message: 'Request classified as: question',
          },
          {
            timestamp: new Date(Date.now() - 1000),
            level: 'info',
            message: 'Emitting EXTRACT_KNOWLEDGE event',
          },
          {
            timestamp: new Date(),
            level: 'info',
            message: 'Workflow completed successfully',
          },
        ],
      };

      res.json({
        success: true,
        data: mockLogDetail,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}