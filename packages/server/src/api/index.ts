import { Router } from 'express';
import { CoreEngine } from '../core/engine.js';
import { createIssuesRouter } from './routes/issues.js';
import { createFlowsRouter } from './routes/flows.js';
import { createKnowledgeRouter } from './routes/knowledge.js';
import { createInputsRouter } from './routes/inputs.js';
import { createSystemRouter } from './routes/system.js';
import { createPondRouter } from './routes/pond.js';
import { createStateRouter } from './routes/state.js';
import { createLogsRouter } from './routes/logs.js';

export function createApiRouter(coreEngine: CoreEngine): Router {
  const router = Router();

  router.use('/issues', createIssuesRouter(coreEngine));
  router.use('/flows', createFlowsRouter(coreEngine));
  router.use('/knowledge', createKnowledgeRouter(coreEngine));
  router.use('/inputs', createInputsRouter(coreEngine));
  router.use('/system', createSystemRouter(coreEngine));
  router.use('/pond', createPondRouter(coreEngine));
  router.use('/state', createStateRouter(coreEngine));
  router.use('/logs', createLogsRouter(coreEngine));

  return router;
}
