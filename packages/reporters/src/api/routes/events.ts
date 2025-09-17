/**
 * イベント関連のAPIエンドポイント (T032-T034)
 * @module api/routes/events
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { createValidationMiddleware, schemas } from '../middleware/validation';
import { ApiException } from '../middleware/error';
import {
  bufferService,
  eventCollector,
  serverClient,
  logger,
} from '../../services';
import { Event } from '../../models/Event';
import { EventType } from '../../types';

/**
 * イベントルートの登録
 */
export async function registerEventRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /events - イベントをキューに追加 (T032)
   */
  fastify.post(
    '/events',
    {
      preHandler: createValidationMiddleware({
        body: schemas.eventInput,
      }),
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const typedRequest = request as FastifyRequest<{
        Body: z.infer<typeof schemas.eventInput>;
      }>;
      try {
        const input = typedRequest.body;

        // イベントの作成
        const eventTypeMap: Record<string, EventType> = {
          'notification': EventType.NOTIFICATION,
          'message': EventType.MESSAGE,
          'calendar': EventType.CALENDAR,
          'todo': EventType.TODO,
          'other': EventType.OTHER,
        };

        const event = new Event({
          id: uuidv4(),
          type: eventTypeMap[input.type],
          sourceId: input.sourceId,
          timestamp: new Date(input.timestamp || Date.now()),
          payload: input.payload,
          metadata: {
            collectedAt: new Date(),
            attempts: 0,
          },
        });

        // バッファへの追加を試行
        await bufferService.addEvent(event);

        // TODO: Check if buffer is full
        const bufferFull = false;
        if (bufferFull) {
          throw new ApiException(
            503,
            'BUFFER_FULL',
            'Event buffer is full. Please try again later.'
          );
        }

        // イベント収集サービスに通知
        // TODO: notifyNewEventメソッドをEventCollectorに追加または代替処理を実装

        logger.info('Event queued', {
          eventId: event.id,
          type: event.type,
          sourceId: event.sourceId,
        });

        return reply.status(201).send(event.toJSON());
      } catch (error) {
        if (error instanceof ApiException) {
          throw error;
        }
        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to queue event',
          error
        );
      }
    }
  );

  /**
   * GET /events - キュー内のイベント一覧を取得 (T033)
   */
  fastify.get(
    '/events',
    {
      preHandler: createValidationMiddleware({
        query: schemas.eventQuery,
      }),
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const typedRequest = request as FastifyRequest<{
        Querystring: z.infer<typeof schemas.eventQuery>;
      }>;
      try {
        const { status, limit } = typedRequest.query;

        // ステータスに応じてイベントを取得
        let events: Event[] = [];
        let total = 0;

        if (!status || status === 'buffered') {
          // バッファ内のイベントを取得
          const bufferEvents = await bufferService.getEvents(limit);
          events = [...events, ...bufferEvents];
          total += bufferEvents.length;
        }

        if (status === 'queued') {
          // キュー待機中のイベントを取得
          const queuedEvents = await eventCollector.getQueuedEvents(limit);
          events = [...events, ...queuedEvents];
          total += queuedEvents.length;
        }

        if (status === 'sending') {
          // 送信中のイベントを取得
          const sendingEvents = await serverClient.getSendingEvents();
          events = [...events, ...sendingEvents];
          total += sendingEvents.length;
        }

        if (status === 'failed') {
          // 失敗したイベントを取得
          const failedEvents = await bufferService.getFailedEvents(limit);
          events = [...events, ...failedEvents];
          total += failedEvents.length;
        }

        // limit を適用
        if (events.length > limit) {
          events = events.slice(0, limit);
        }

        return reply.send({
          events,
          total,
        });
      } catch (error) {
        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to retrieve events',
          error
        );
      }
    }
  );

  /**
   * POST /events/send - バッファ内のイベントをサーバーに送信 (T034)
   */
  fastify.post(
    '/events/send',
    {
      preHandler: createValidationMiddleware({
        body: schemas.sendEventsBody.optional(),
      }),
    },
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const typedRequest = request as FastifyRequest<{
        Body?: z.infer<typeof schemas.sendEventsBody>;
      }>;
      try {
        const force = typedRequest.body?.force ?? false;

        // サーバー接続状態を確認
        const isConnected = await serverClient.checkConnection();
        if (!isConnected && !force) {
          throw new ApiException(
            503,
            'SERVER_UNAVAILABLE',
            'Server is not available. Use force=true to attempt sending anyway.'
          );
        }

        // バッファからイベントを取得
        const batchSize = 100;
        const events = await bufferService.getEvents(batchSize);

        if (events.length === 0) {
          return reply.send({
            sent: 0,
            failed: 0,
            buffered: 0,
          });
        }

        logger.info('Sending events to server', {
          count: events.length,
          force,
        });

        // イベントを送信
        let sent = 0;
        let failed = 0;
        const results = await Promise.allSettled(
          events.map(async (event) => {
            try {
              const success = await serverClient.sendEvent(event);
              if (success) {
                await bufferService.removeEvent(event.id);
                sent++;
              } else {
                failed++;
                await bufferService.markEventFailed(event.id);
              }
            } catch (error) {
              failed++;
              await bufferService.markEventFailed(event.id);
              throw error;
            }
          })
        );

        // 失敗したイベントをログ出力
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            logger.error('Failed to send event', {
              eventId: events[index].id,
              error: result.reason,
            });
          }
        });

        // バッファ内の残りイベント数を取得
        const buffered = await bufferService.getEventCount();

        logger.info('Events send completed', {
          sent,
          failed,
          buffered,
        });

        return reply.send({
          sent,
          failed,
          buffered,
        });
      } catch (error) {
        if (error instanceof ApiException) {
          throw error;
        }
        throw new ApiException(
          500,
          'INTERNAL_ERROR',
          'Failed to send events',
          error
        );
      }
    }
  );
}