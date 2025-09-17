/**
 * APIサーバーのメインエントリーポイント
 * @module api/main
 */

import { startServer } from './server';
import { logger } from '../services';
import dotenv from 'dotenv';
import path from 'path';

// 環境変数の読み込み
dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
});

/**
 * メイン関数
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting Reporters API Server', {
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    });

    // サーバーの起動
    const server = await startServer({
      host: process.env.API_HOST || '0.0.0.0',
      port: parseInt(process.env.API_PORT || '3000', 10),
    });

    // サーバー情報をログ出力
    const addresses = server.addresses();
    if (addresses) {
      logger.info('API Server is ready', {
        addresses: Array.isArray(addresses) ? addresses : [addresses],
      });
    }
  } catch (error) {
    logger.error('Failed to start API server', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason,
    promise,
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// スクリプトとして実行された場合
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error', { error });
    process.exit(1);
  });
}

export { main };