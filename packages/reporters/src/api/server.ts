/**
 * FastifyサーバーのセットアップとAPI設定
 * @module api/server
 */

import Fastify, { FastifyInstance } from 'fastify';
import { errorHandler, notFoundHandler } from './middleware/error';
import { requestLogger, corsOptions } from './middleware/validation';
import { registerEventRoutes } from './routes/events';
import { registerSourceRoutes } from './routes/sources';
import { registerStatusRoutes } from './routes/status';
import { registerHealthRoutes } from './routes/health';
import { logger } from '../services';

/**
 * サーバー設定
 */
export interface ServerConfig {
  host?: string;
  port?: number;
  logger?: boolean;
  trustProxy?: boolean;
  bodyLimit?: number;
  connectionTimeout?: number;
  keepAliveTimeout?: number;
  requestIdHeader?: string;
}

/**
 * デフォルト設定
 */
const defaultConfig: ServerConfig = {
  host: process.env.API_HOST || '0.0.0.0',
  port: parseInt(process.env.API_PORT || '3000', 10),
  logger: process.env.NODE_ENV === 'development',
  trustProxy: true,
  bodyLimit: 1048576, // 1MB
  connectionTimeout: 10000, // 10 seconds
  keepAliveTimeout: 5000, // 5 seconds
  requestIdHeader: 'X-Request-ID',
};

/**
 * Fastifyサーバーインスタンスの作成
 */
export async function createServer(config: ServerConfig = {}): Promise<FastifyInstance> {
  const mergedConfig = { ...defaultConfig, ...config };

  // Fastifyインスタンスの作成
  const fastify = Fastify({
    logger: mergedConfig.logger
      ? {
          level: process.env.LOG_LEVEL || 'info',
          prettyPrint: process.env.NODE_ENV === 'development',
        }
      : false,
    trustProxy: mergedConfig.trustProxy,
    bodyLimit: mergedConfig.bodyLimit,
    connectionTimeout: mergedConfig.connectionTimeout,
    keepAliveTimeout: mergedConfig.keepAliveTimeout,
    requestIdHeader: mergedConfig.requestIdHeader,
    genReqId: (req) => {
      // リクエストIDヘッダーがあればそれを使用、なければ生成
      const requestId = req.headers[mergedConfig.requestIdHeader!.toLowerCase()];
      return requestId as string || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },
  });

  // プラグインの登録
  await registerPlugins(fastify);

  // ミドルウェアの登録
  await registerMiddleware(fastify);

  // ルートの登録
  await registerRoutes(fastify);

  // エラーハンドラーの登録
  fastify.setErrorHandler(errorHandler);
  fastify.setNotFoundHandler(notFoundHandler);

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, closing server gracefully...`);
      try {
        await fastify.close();
        logger.info('Server closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during server shutdown', { error });
        process.exit(1);
      }
    });
  });

  return fastify;
}

/**
 * プラグインの登録
 */
async function registerPlugins(fastify: FastifyInstance): Promise<void> {
  // CORS設定
  await fastify.register(import('@fastify/cors'), corsOptions);

  // Helmet (セキュリティヘッダー)
  await fastify.register(import('@fastify/helmet'), {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  // Rate limiting
  await fastify.register(import('@fastify/rate-limit'), {
    max: 100, // 1分間に100リクエストまで
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1'], // ローカルホストは除外
    redis: process.env.REDIS_URL ? process.env.REDIS_URL : undefined,
  });

  // Request compression
  await fastify.register(import('@fastify/compress'), {
    global: true,
    threshold: 1024, // 1KB以上のレスポンスを圧縮
  });

  // Multipart support (file uploads)
  await fastify.register(import('@fastify/multipart'), {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1,
    },
  });

  logger.info('Plugins registered successfully');
}

/**
 * ミドルウェアの登録
 */
async function registerMiddleware(fastify: FastifyInstance): Promise<void> {
  // リクエストロギング
  fastify.addHook('preHandler', requestLogger);

  // ヘルスチェックエンドポイントはロギングから除外
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/health/')) {
      request.log.level = 'silent';
    }
  });

  logger.info('Middleware registered successfully');
}

/**
 * ルートの登録
 */
async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // API version prefix
  const apiPrefix = process.env.API_PREFIX || '/api/v1';

  // Register route groups
  await fastify.register(async (fastify) => {
    await registerEventRoutes(fastify);
    await registerSourceRoutes(fastify);
    await registerStatusRoutes(fastify);
    await registerHealthRoutes(fastify);
  }, { prefix: apiPrefix });

  // Root endpoint
  fastify.get('/', async (request, reply) => {
    return {
      name: '@sebas-chan/reporters',
      version: '0.1.0',
      status: 'running',
      api: {
        prefix: apiPrefix,
        endpoints: [
          `${apiPrefix}/events`,
          `${apiPrefix}/sources`,
          `${apiPrefix}/status`,
          `${apiPrefix}/health`,
        ],
      },
      timestamp: new Date().toISOString(),
    };
  });

  // API documentation endpoint
  fastify.get(`${apiPrefix}/docs`, async (request, reply) => {
    return {
      openapi: '3.0.3',
      info: {
        title: 'Reporters Package API',
        version: '1.0.0',
        description: 'Event collection and reporting system API',
      },
      servers: [
        {
          url: `http://localhost:${defaultConfig.port}${apiPrefix}`,
          description: 'Local development server',
        },
      ],
      endpoints: {
        events: {
          'POST /events': 'Queue an event',
          'GET /events': 'List queued events',
          'POST /events/send': 'Send buffered events to server',
        },
        sources: {
          'GET /sources': 'List event sources',
          'POST /sources': 'Add an event source',
          'PUT /sources/{id}': 'Update an event source',
          'DELETE /sources/{id}': 'Delete an event source',
        },
        status: {
          'GET /status': 'Get system status',
          'GET /status/server': 'Get server connection status',
          'GET /status/sources': 'Get source statuses',
          'GET /status/buffer': 'Get buffer status',
        },
        health: {
          'GET /health': 'Health check',
          'GET /health/live': 'Liveness probe',
          'GET /health/ready': 'Readiness probe',
        },
      },
    };
  });

  logger.info('Routes registered successfully');
}

/**
 * サーバーの起動
 */
export async function startServer(config: ServerConfig = {}): Promise<FastifyInstance> {
  const mergedConfig = { ...defaultConfig, ...config };
  const fastify = await createServer(mergedConfig);

  try {
    const address = await fastify.listen({
      port: mergedConfig.port!,
      host: mergedConfig.host!,
    });

    logger.info('Server started successfully', {
      address,
      environment: process.env.NODE_ENV || 'development',
    });

    return fastify;
  } catch (error) {
    logger.error('Failed to start server', { error });
    throw error;
  }
}

/**
 * サーバーのシャットダウン
 */
export async function stopServer(fastify: FastifyInstance): Promise<void> {
  try {
    await fastify.close();
    logger.info('Server stopped successfully');
  } catch (error) {
    logger.error('Error stopping server', { error });
    throw error;
  }
}