import { Router } from 'express';
import { CoreEngine } from '../../core/engine';
import { CreateInputDto } from '@sebas-chan/shared-types';

export function createInputsRouter(coreEngine: CoreEngine): Router {
  const router = Router();
  
  router.get('/pending', async (req, res, next) => {
    try {
      const inputs = await coreEngine.listPendingInputs();
      res.json({
        success: true,
        data: inputs,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  router.get('/:id', async (req, res, next) => {
    try {
      const input = await coreEngine.getInput(req.params.id);
      res.json({
        success: true,
        data: input,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  router.post('/', async (req, res, next) => {
    try {
      const dto: CreateInputDto = req.body;
      const input = await coreEngine.createInput({
        source: dto.source,
        content: dto.content,
        timestamp: new Date()
      });
      
      res.status(201).json({
        success: true,
        data: input,
        timestamp: new Date()
      });
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}