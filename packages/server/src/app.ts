import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
const { json } = bodyParser;
import { CoreEngine } from './core/engine.js';
import { createApiRouter } from './api/index.js';
import { errorHandler } from './api/middleware/error-handler.js';
import { logger } from './utils/logger.js';

export async function createApp() {
  const app = express();

  app.use(cors());
  app.use(json());

  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // DBClientを作成（本番用）
  const { DBClient } = await import('@sebas-chan/db');
  const dbClient = new DBClient();

  // DBClientを接続・初期化
  await dbClient.connect();
  await dbClient.initModel();
  logger.info('DB Client connected and initialized');

  const coreEngine = new CoreEngine(undefined, dbClient);

  // Engineのstop時にDBClientを切断するhookを設定
  coreEngine.on('stopping', async () => {
    logger.info('Engine stopping, disconnecting DB...');
    await dbClient.disconnect();
  });

  await coreEngine.initialize();

  // E2Eテストでもstart()を呼ぶ
  await coreEngine.start();
  logger.info('Core Engine started');

  const apiRouter = createApiRouter(coreEngine);
  app.use('/api', apiRouter);

  app.get('/health', (req, res) => {
    const healthStatus = coreEngine.getHealthStatus();
    const httpStatus = healthStatus.ready ? 200 : 503;

    res.status(httpStatus).json({
      status: healthStatus.ready ? 'healthy' : 'unhealthy',
      ready: healthStatus.ready,
      engine: healthStatus.engine,
      database: healthStatus.database,
      agent: healthStatus.agent,
      timestamp: new Date().toISOString(),
    });
  });

  // 404ハンドラー（全ルートの最後に配置）
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
    });
  });

  app.use(errorHandler);

  return app;
}
