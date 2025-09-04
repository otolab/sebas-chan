import { Router } from 'express';
import { CoreEngine } from '../../core/engine';
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
          timestamp: new Date()
        });
      }
      
      coreEngine.updateState(content);
      res.json({
        success: true,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  router.post('/process', async (req, res, next) => {
    try {
      const dto: ProcessRequestDto = req.body;
      
      coreEngine.enqueueEvent({
        type: 'PROCESS_USER_REQUEST',
        priority: 'high',
        payload: {
          prompt: dto.prompt,
          context: dto.context
        }
      });
      
      res.json({
        success: true,
        message: 'Request queued for processing',
        timestamp: new Date()
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
          avgCloseTime: 0
        },
        flows: {
          active: 0,
          blocked: 0,
          completed: 0,
          total: 0
        },
        knowledge: {
          total: 0,
          byType: {
            system_rule: 0,
            process_manual: 0,
            entity_profile: 0,
            curated_summary: 0,
            factoid: 0
          },
          avgReputation: 0
        },
        pond: {
          size: 0,
          lastSalvage: null
        },
        agent: {
          loopCount: 0,
          avgLoopTime: 0,
          lastActivity: new Date()
        }
      };
      
      res.json({
        success: true,
        data: stats,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}