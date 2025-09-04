import { Router } from 'express';
import { CoreEngine } from '../core/engine';
import { createIssuesRouter } from './routes/issues';
import { createFlowsRouter } from './routes/flows';
import { createKnowledgeRouter } from './routes/knowledge';
import { createInputsRouter } from './routes/inputs';
import { createSystemRouter } from './routes/system';

export function createApiRouter(coreEngine: CoreEngine): Router {
  const router = Router();
  
  router.use('/issues', createIssuesRouter(coreEngine));
  router.use('/flows', createFlowsRouter(coreEngine));
  router.use('/knowledge', createKnowledgeRouter(coreEngine));
  router.use('/inputs', createInputsRouter(coreEngine));
  router.use('/system', createSystemRouter(coreEngine));
  
  return router;
}