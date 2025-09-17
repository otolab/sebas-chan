/**
 * リクエスト検証ミドルウェア
 * @module api/middleware/validation
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError, ZodSchema } from 'zod';
import { ApiException } from './error';

/**
 * バリデーションオプション
 */
export interface ValidationOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

/**
 * バリデーションミドルウェアファクトリー
 */
export function createValidationMiddleware(options: ValidationOptions) {
  return async function validateRequest(
    request: FastifyRequest
  ): Promise<void> {
    try {
      // Body validation
      if (options.body) {
        request.body = await options.body.parseAsync(request.body);
      }

      // Query validation
      if (options.query) {
        request.query = await options.query.parseAsync(request.query);
      }

      // Params validation
      if (options.params) {
        request.params = await options.params.parseAsync(request.params);
      }

      // Headers validation
      if (options.headers) {
        await options.headers.parseAsync(request.headers);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ApiException(
          400,
          'VALIDATION_ERROR',
          'Validation failed',
          error.errors
        );
      }
      throw error;
    }
  };
}

/**
 * 共通のバリデーションスキーマ
 */
export const schemas = {
  // Event schemas
  eventInput: z.object({
    type: z.enum(['notification', 'message', 'calendar', 'todo', 'other']),
    sourceId: z.string().min(1),
    timestamp: z.string().datetime().optional(),
    payload: z.record(z.unknown()),
  }),

  // Event Source schemas
  eventSourceInput: z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['webhook', 'polling', 'stream']),
    config: z
      .object({
        endpoint: z.string().url().optional(),
        interval: z.number().min(1000).optional(),
        filters: z.array(z.string()).optional(),
      })
      .optional(),
  }),

  // Query schemas
  eventQuery: z.object({
    status: z.enum(['queued', 'buffered', 'sending', 'failed']).optional(),
    limit: z.coerce.number().min(1).max(1000).default(100),
  }),

  // Send events body
  sendEventsBody: z.object({
    force: z.boolean().optional(),
  }),

  // Path params
  sourceIdParam: z.object({
    sourceId: z.string().min(1),
  }),
};

/**
 * リクエストロギングミドルウェア
 */
export async function requestLogger(
  request: FastifyRequest
): Promise<void> {
  const start = Date.now();

  // レスポンス送信後にログ出力
  request.server.addHook('onResponse', (req, reply, done) => {
    const duration = Date.now() - start;

    req.log.info({
      method: req.method,
      url: req.url,
      statusCode: reply.statusCode,
      duration,
      requestId: req.id,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    done();
  });
}

/**
 * CORSミドルウェア設定
 */
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // 開発環境では全てのオリジンを許可
    if (process.env.NODE_ENV === 'development') {
      callback(null, true);
      return;
    }

    // 本番環境では設定されたオリジンのみ許可
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
};