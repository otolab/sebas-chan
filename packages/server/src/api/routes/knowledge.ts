import { Router } from 'express';
import { CoreEngine } from '../../core/engine.js';
import { CreateKnowledgeDto, UpdateKnowledgeReputationDto } from '@sebas-chan/shared-types';

export function createKnowledgeRouter(coreEngine: CoreEngine): Router {
  const router = Router();
  
  router.get('/', async (req, res, next) => {
    try {
      const { q } = req.query;
      const knowledge = q 
        ? await coreEngine.searchKnowledge(q as string)
        : [];
      
      res.json({
        success: true,
        data: knowledge,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  router.get('/:id', async (req, res, next) => {
    try {
      const knowledge = await coreEngine.getKnowledge(req.params.id);
      res.json({
        success: true,
        data: knowledge,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  router.post('/', async (req, res, next) => {
    try {
      const dto: CreateKnowledgeDto = req.body;
      const knowledge = await coreEngine.createKnowledge({
        type: dto.type,
        content: dto.content,
        reputation: {
          upvotes: 0,
          downvotes: 0
        },
        sources: dto.sources || []
      });
      
      res.status(201).json({
        success: true,
        data: knowledge,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  router.post('/:id/reputation', async (req, res, next) => {
    try {
      const dto: UpdateKnowledgeReputationDto = req.body;
      const knowledge = await coreEngine.getKnowledge(req.params.id);
      
      const update = dto.action === 'upvote' 
        ? { reputation: { ...knowledge.reputation, upvotes: knowledge.reputation.upvotes + 1 } }
        : { reputation: { ...knowledge.reputation, downvotes: knowledge.reputation.downvotes + 1 } };
      
      const updated = await coreEngine.updateKnowledge(req.params.id, update);
      
      res.json({
        success: true,
        data: updated,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}