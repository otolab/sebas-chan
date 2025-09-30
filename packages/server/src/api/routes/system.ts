import { Router } from 'express';
import { nanoid } from 'nanoid';
import { CoreEngine } from '../../core/engine.js';
import { ProcessRequestDto, SystemStats } from '@sebas-chan/shared-types';

export function createSystemRouter(coreEngine: CoreEngine): Router {
  const router = Router();

  router.get('/state', (req, res) => {
    const state = coreEngine.getState();
    res.type('text/plain').send(state);
  });

  router.put('/state', (req, res, next) => {
    try {
      const { content } = req.body;
      if (typeof content !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Content must be a string',
          timestamp: new Date(),
        });
      }

      coreEngine.updateState(content);
      res.json({
        success: true,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/process', async (req, res, next) => {
    try {
      const dto: ProcessRequestDto = req.body;

      // セッションIDを生成（contextにsessionIdがあれば使用、なければ新規生成）
      const sessionId = (typeof dto.context?.sessionId === 'string' && dto.context.sessionId)
        ? dto.context.sessionId
        : `api-session-${nanoid()}`;

      coreEngine.emitEvent({
        type: 'USER_REQUEST_RECEIVED',
        payload: {
          userId: 'system', // TODO: 実際のユーザーIDを使用
          content: dto.prompt,
          sessionId,
          timestamp: new Date().toISOString(),
          metadata: {
            source: 'api',
            context: dto.context, // 元のcontextをmetadataに保存
          },
        },
      });

      res.json({
        success: true,
        message: 'Request queued for processing',
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/stats', async (req, res, next) => {
    try {
      const stats: SystemStats = {
        issues: {
          open: 0,
          closed: 0,
          total: 0,
          avgCloseTime: 0,
        },
        flows: {
          active: 0,
          blocked: 0,
          completed: 0,
          total: 0,
        },
        knowledge: {
          total: 0,
          byType: {
            system_rule: 0,
            process_manual: 0,
            entity_profile: 0,
            curated_summary: 0,
            factoid: 0,
          },
          avgReputation: 0,
        },
        pond: {
          size: 0,
          lastSalvage: null,
        },
        agent: {
          loopCount: 0,
          avgLoopTime: 0,
          lastActivity: new Date(),
        },
      };

      res.json({
        success: true,
        data: stats,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
