/**
 * エラーハンドリングミドルウェア
 * @module api/middleware/error
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../services';

/**
 * APIエラーレスポンス
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * HTTPステータスコードからエラーコードへのマッピング
 */
const statusToErrorCode: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

/**
 * カスタムエラークラス
 */
export class ApiException extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiException';
  }
}

/**
 * エラーハンドラー
 */
export async function errorHandler(
  error: FastifyError | Error | ApiException,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // ログ出力
  logger.error('API Error', {
    method: request.method,
    url: request.url,
    error: error.message,
    stack: error.stack,
    requestId: request.id,
  });

  // ApiException の場合
  if (error instanceof ApiException) {
    await reply.status(error.statusCode).send({
      code: error.code,
      message: error.message,
      details: error.details,
    } as ApiError);
    return;
  }

  // Fastifyエラーの場合
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    const statusCode = error.statusCode;
    const code = statusToErrorCode[statusCode] || 'UNKNOWN_ERROR';

    await reply.status(statusCode).send({
      code,
      message: error.message,
      details: 'validation' in error ? error.validation : undefined,
    } as ApiError);
    return;
  }

  // その他のエラー
  await reply.status(500).send({
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
  } as ApiError);
}

/**
 * 404ハンドラー
 */
export async function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await reply.status(404).send({
    code: 'NOT_FOUND',
    message: `Route ${request.method} ${request.url} not found`,
  } as ApiError);
}