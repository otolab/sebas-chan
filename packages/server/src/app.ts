import express from 'express';
import cors from 'cors';
import { json } from 'body-parser';
import { CoreEngine } from './core/engine';
import { createApiRouter } from './api';
import { errorHandler } from './api/middleware/error-handler';
import { logger } from './utils/logger';

export async function createApp() {
  const app = express();
  
  app.use(cors());
  app.use(json());
  
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });
  
  const coreEngine = new CoreEngine();
  await coreEngine.initialize();
  
  const apiRouter = createApiRouter(coreEngine);
  app.use('/api', apiRouter);
  
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });
  
  app.use(errorHandler);
  
  return app;
}