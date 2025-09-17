/**
 * ヘルスチェックAPIエンドポイント (T040)
 * @module api/routes/health
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiException } from '../middleware/error';
import {
  healthMonitor,
  serverClient,
  bufferService,
  sourceManager,
  logger,
} from '../../services';

/**
 * ヘルスステータスレスポンス
 */
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    server: boolean;
    buffer: boolean;
    sources: boolean;
  };
  details?: {
    server?: {
      connected: boolean;
      lastCheck: string;
      errorCount: number;
    };
    buffer?: {
      usage: number;
      eventCount: number;
      maxSize: number;
    };
    sources?: {
      total: number;
      active: number;
      error: number;
    };
  };
  timestamp: string;
}

/**
 * ヘルスルートの登録
 */
export async function registerHealthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /health - ヘルスチェック (T040)
   */
  fastify.get(
    '/health',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 各コンポーネントのヘルスチェック
        const checks = {
          server: false,
          buffer: false,
          sources: false,
        };

        // サーバー接続チェック
        try {
          const serverStatus = await serverClient.getConnectionStatus();
          checks.server = serverStatus.isConnected || serverStatus.errorCount < 3;
        } catch (error) {
          logger.error('Health check: Server check failed', { error });
          checks.server = false;
        }

        // バッファチェック
        try {
          const bufferStats = await bufferService.getStats();
          // バッファ使用率が90%未満であれば正常
          checks.buffer = (bufferStats.eventCount / bufferStats.maxSize) < 0.9;
        } catch (error) {
          logger.error('Health check: Buffer check failed', { error });
          checks.buffer = false;
        }

        // ソースチェック
        try {
          const sources = await sourceManager.getAllSources();
          const activeSources = sources.filter(s => s.status === 'active');
          const errorSources = sources.filter(s => s.status === 'error');
          // エラー状態のソースが半数未満であれば正常
          checks.sources = sources.length === 0 || errorSources.length < sources.length / 2;
        } catch (error) {
          logger.error('Health check: Sources check failed', { error });
          checks.sources = false;
        }

        // 全体のステータスを判定
        let status: 'healthy' | 'degraded' | 'unhealthy';
        const passedChecks = Object.values(checks).filter(Boolean).length;

        if (passedChecks === 3) {
          status = 'healthy';
        } else if (passedChecks >= 2) {
          status = 'degraded';
        } else {
          status = 'unhealthy';
        }

        // HealthMonitorのステータスも考慮
        const monitorStatus = await healthMonitor.getHealthStatus();
        if (monitorStatus.status === 'unhealthy') {
          status = 'unhealthy';
        } else if (monitorStatus.status === 'degraded' && status === 'healthy') {
          status = 'degraded';
        }

        const response: HealthResponse = {
          status,
          checks,
          timestamp: new Date().toISOString(),
        };

        // 詳細情報を含める（デバッグモードまたは明示的なリクエスト時）
        if (request.query && 'details' in request.query) {
          const serverStatus = await serverClient.getConnectionStatus();
          const bufferStats = await bufferService.getStats();
          const sources = await sourceManager.getAllSources();

          response.details = {
            server: {
              connected: serverStatus.isConnected,
              lastCheck: serverStatus.lastCheckAt || new Date().toISOString(),
              errorCount: serverStatus.errorCount,
            },
            buffer: {
              usage: (bufferStats.eventCount / bufferStats.maxSize) * 100,
              eventCount: bufferStats.eventCount,
              maxSize: bufferStats.maxSize,
            },
            sources: {
              total: sources.length,
              active: sources.filter(s => s.status === 'active').length,
              error: sources.filter(s => s.status === 'error').length,
            },
          };
        }

        // ステータスコードを設定
        const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

        logger.info('Health check completed', {
          status,
          checks,
        });

        return reply.status(statusCode).send(response);
      } catch (error) {
        logger.error('Health check failed', {
          error: error instanceof Error ? error.message : error,
        });

        // エラー時は unhealthy として返す
        const response: HealthResponse = {
          status: 'unhealthy',
          checks: {
            server: false,
            buffer: false,
            sources: false,
          },
          timestamp: new Date().toISOString(),
        };

        return reply.status(503).send(response);
      }
    }
  );

  /**
   * GET /health/live - Kubernetes用 liveness probe
   */
  fastify.get(
    '/health/live',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // プロセスが動作しているかの基本的なチェック
        const isAlive = process.uptime() > 0;

        if (isAlive) {
          return reply.send({ status: 'ok' });
        } else {
          return reply.status(503).send({ status: 'error' });
        }
      } catch (error) {
        return reply.status(503).send({ status: 'error' });
      }
    }
  );

  /**
   * GET /health/ready - Kubernetes用 readiness probe
   */
  fastify.get(
    '/health/ready',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // サービスがリクエストを処理できる状態かチェック
        const serverStatus = await serverClient.getConnectionStatus();
        const bufferStats = await bufferService.getStats();

        const isReady =
          // バッファに空きがある
          (bufferStats.eventCount / bufferStats.maxSize) < 0.95 &&
          // サーバーへの接続が確立されているか、エラーが少ない
          (serverStatus.isConnected || serverStatus.errorCount < 5);

        if (isReady) {
          return reply.send({ status: 'ready' });
        } else {
          return reply.status(503).send({ status: 'not_ready' });
        }
      } catch (error) {
        return reply.status(503).send({ status: 'not_ready' });
      }
    }
  );
}