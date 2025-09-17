/**
 * イベントソース管理のAPIエンドポイント (T035-T038)
 * @module api/routes/sources
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createValidationMiddleware, schemas } from '../middleware/validation';
import { ApiException } from '../middleware/error';
import { sourceManager, logger } from '../../services';
import type { EventSource } from '../../models/EventSource';

/**
 * ソースルートの登録
 */
export async function registerSourceRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /sources - イベントソース一覧を取得 (T035)
   */
  fastify.get(
    '/sources',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const sources = await sourceManager.getAllSources();

        logger.info('Sources list retrieved', {
          count: sources.length,
        });

        return reply.send(sources);
      } catch (error) {
        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to retrieve sources',
          error
        );
      }
    }
  );

  /**
   * POST /sources - イベントソースを追加 (T036)
   */
  fastify.post(
    '/sources',
    {
      preHandler: createValidationMiddleware({
        body: schemas.eventSourceInput,
      }),
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const typedRequest = request as FastifyRequest<{
        Body: z.infer<typeof schemas.eventSourceInput>;
      }>;
      try {
        const input = typedRequest.body;

        // ソースの作成を試行
        const source = await sourceManager.createSource({
          name: input.name,
          type: input.type,
          config: input.config || {},
        });

        // 既存のソースIDと重複チェック
        const existingSource = await sourceManager.getSource(source.id);
        if (existingSource && existingSource.id !== source.id) {
          throw new ApiException(
            409,
            'SOURCE_EXISTS',
            `Source with ID ${source.id} already exists`
          );
        }

        // ソースを追加
        const added = await sourceManager.addSource(source);
        if (!added) {
          throw new ApiException(
            500,
            'SOURCE_ADD_FAILED',
            'Failed to add source'
          );
        }

        logger.info('Source added', {
          sourceId: source.id,
          name: source.name,
          type: source.type,
        });

        return reply.status(201).send(source);
      } catch (error) {
        if (error instanceof ApiException) {
          throw error;
        }
        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to add source',
          error
        );
      }
    }
  );

  /**
   * PUT /sources/{sourceId} - イベントソースを更新 (T037)
   */
  fastify.put(
    '/sources/:sourceId',
    {
      preHandler: createValidationMiddleware({
        params: schemas.sourceIdParam,
        body: schemas.eventSourceInput,
      }),
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const typedRequest = request as FastifyRequest<{
        Params: z.infer<typeof schemas.sourceIdParam>;
        Body: z.infer<typeof schemas.eventSourceInput>;
      }>;
      try {
        const { sourceId } = typedRequest.params;
        const input = typedRequest.body;

        // 既存のソースを確認
        const existingSource = await sourceManager.getSource(sourceId);
        if (!existingSource) {
          throw new ApiException(
            404,
            'SOURCE_NOT_FOUND',
            `Source with ID ${sourceId} not found`
          );
        }

        // ソースを更新
        const updatedSource: EventSource = {
          ...existingSource,
          name: input.name,
          type: input.type,
          config: input.config || existingSource.config,
          status: existingSource.status, // ステータスは維持
          lastConnectedAt: existingSource.lastConnectedAt,
        };

        const updated = await sourceManager.updateSource(sourceId, updatedSource);
        if (!updated) {
          throw new ApiException(
            500,
            'SOURCE_UPDATE_FAILED',
            'Failed to update source'
          );
        }

        logger.info('Source updated', {
          sourceId,
          name: updatedSource.name,
          type: updatedSource.type,
        });

        return reply.send(updatedSource);
      } catch (error) {
        if (error instanceof ApiException) {
          throw error;
        }
        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to update source',
          error
        );
      }
    }
  );

  /**
   * DELETE /sources/{sourceId} - イベントソースを削除 (T038)
   */
  fastify.delete(
    '/sources/:sourceId',
    {
      preHandler: createValidationMiddleware({
        params: schemas.sourceIdParam,
      }),
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const typedRequest = request as FastifyRequest<{
        Params: z.infer<typeof schemas.sourceIdParam>;
      }>;
      try {
        const { sourceId } = typedRequest.params;

        // 既存のソースを確認
        const existingSource = await sourceManager.getSource(sourceId);
        if (!existingSource) {
          throw new ApiException(
            404,
            'SOURCE_NOT_FOUND',
            `Source with ID ${sourceId} not found`
          );
        }

        // アクティブなソースは削除前に停止
        if (existingSource.status === 'active') {
          await sourceManager.deactivateSource(sourceId);
        }

        // ソースを削除
        const deleted = await sourceManager.removeSource(sourceId);
        if (!deleted) {
          throw new ApiException(
            500,
            'SOURCE_DELETE_FAILED',
            'Failed to delete source'
          );
        }

        logger.info('Source deleted', {
          sourceId,
          name: existingSource.name,
        });

        return reply.status(204).send();
      } catch (error) {
        if (error instanceof ApiException) {
          throw error;
        }
        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to delete source',
          error
        );
      }
    }
  );
}