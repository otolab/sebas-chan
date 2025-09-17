/**
 * システムステータスAPIエンドポイント (T039)
 * @module api/routes/status
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiException } from '../middleware/error';
import {
  serverClient,
  sourceManager,
  bufferService,
  healthMonitor,
  logger,
} from '../../services';
import type { ConnectionStatus } from '../../models/ConnectionStatus';

/**
 * ステータスルートの登録
 */
export async function registerStatusRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /status - システムステータスを取得 (T039)
   */
  fastify.get(
    '/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // サーバー接続ステータスを取得
        const serverStatus = await serverClient.getConnectionStatus();
        const serverConnectionStatus: ConnectionStatus = {
          targetId: 'main-server',
          targetType: 'server',
          isConnected: serverStatus.isConnected,
          lastSuccessAt: serverStatus.lastSuccessAt,
          lastErrorAt: serverStatus.lastErrorAt,
          errorCount: serverStatus.errorCount,
          errorMessage: serverStatus.lastError,
        };

        // ソース接続ステータスを取得
        const sources = await sourceManager.getAllSources();
        const sourceStatuses: ConnectionStatus[] = await Promise.all(
          sources.map(async (source) => {
            const status = await sourceManager.getSourceStatus(source.id);
            return {
              targetId: source.id,
              targetType: 'source',
              isConnected: status?.isConnected || false,
              lastSuccessAt: status?.lastSuccessAt,
              lastErrorAt: status?.lastErrorAt,
              errorCount: status?.errorCount || 0,
              errorMessage: status?.lastError,
            };
          })
        );

        // バッファステータスを取得
        const bufferStats = await bufferService.getStats();
        const bufferStatus = {
          size: bufferStats.currentSize,
          maxSize: bufferStats.maxSize,
          eventCount: bufferStats.eventCount,
        };

        // 全体のヘルスステータスも更新
        const health = await healthMonitor.getHealthStatus();

        logger.info('System status retrieved', {
          serverConnected: serverConnectionStatus.isConnected,
          activeSourceCount: sourceStatuses.filter(s => s.isConnected).length,
          bufferUsage: `${bufferStatus.eventCount}/${bufferStatus.maxSize}`,
          health: health.status,
        });

        return reply.send({
          server: serverConnectionStatus,
          sources: sourceStatuses,
          buffer: bufferStatus,
        });
      } catch (error) {
        logger.error('Failed to retrieve system status', {
          error: error instanceof Error ? error.message : error,
        });

        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to retrieve system status',
          error
        );
      }
    }
  );

  /**
   * GET /status/server - サーバー接続ステータスのみを取得
   */
  fastify.get(
    '/status/server',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const status = await serverClient.getConnectionStatus();

        return reply.send({
          targetId: 'main-server',
          targetType: 'server',
          isConnected: status.isConnected,
          lastSuccessAt: status.lastSuccessAt,
          lastErrorAt: status.lastErrorAt,
          errorCount: status.errorCount,
          errorMessage: status.lastError,
        } as ConnectionStatus);
      } catch (error) {
        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to retrieve server status',
          error
        );
      }
    }
  );

  /**
   * GET /status/sources - ソース接続ステータスのみを取得
   */
  fastify.get(
    '/status/sources',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const sources = await sourceManager.getAllSources();
        const statuses: ConnectionStatus[] = await Promise.all(
          sources.map(async (source) => {
            const status = await sourceManager.getSourceStatus(source.id);
            return {
              targetId: source.id,
              targetType: 'source',
              isConnected: status?.isConnected || false,
              lastSuccessAt: status?.lastSuccessAt,
              lastErrorAt: status?.lastErrorAt,
              errorCount: status?.errorCount || 0,
              errorMessage: status?.lastError,
            };
          })
        );

        return reply.send(statuses);
      } catch (error) {
        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to retrieve source statuses',
          error
        );
      }
    }
  );

  /**
   * GET /status/buffer - バッファステータスのみを取得
   */
  fastify.get(
    '/status/buffer',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await bufferService.getStats();

        return reply.send({
          size: stats.currentSize,
          maxSize: stats.maxSize,
          eventCount: stats.eventCount,
          usage: (stats.eventCount / stats.maxSize) * 100,
        });
      } catch (error) {
        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to retrieve buffer status',
          error
        );
      }
    }
  );
}