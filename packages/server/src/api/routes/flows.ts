import { Router } from 'express';
import { CoreEngine } from '../../core/engine.js';
import { CreateFlowDto, UpdateFlowDto } from '@sebas-chan/shared-types';

export function createFlowsRouter(coreEngine: CoreEngine): Router {
  const router = Router();
  
  router.get('/', async (req, res, next) => {
    try {
      const { q } = req.query;
      const flows = q 
        ? await coreEngine.searchFlows(q as string)
        : [];
      
      res.json({
        success: true,
        data: flows,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  router.get('/:id', async (req, res, next) => {
    try {
      const flow = await coreEngine.getFlow(req.params.id);
      res.json({
        success: true,
        data: flow,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  router.post('/', async (req, res, next) => {
    try {
      const dto: CreateFlowDto = req.body;
      const flow = await coreEngine.createFlow({
        title: dto.title,
        description: dto.description,
        status: 'backlog',
        priorityScore: 0.5,
        issueIds: dto.issueIds || []
      });
      
      res.status(201).json({
        success: true,
        data: flow,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  router.patch('/:id', async (req, res, next) => {
    try {
      const dto: UpdateFlowDto = req.body;
      const flow = await coreEngine.updateFlow(req.params.id, dto);
      
      res.json({
        success: true,
        data: flow,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}