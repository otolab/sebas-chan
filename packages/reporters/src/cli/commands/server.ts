/**
 * APIサーバー関連のCLIコマンド
 * @module cli/commands/server
 */

import { Command } from 'commander';
import { startServer, stopServer } from '../../api/server';
import { logger } from '../../services';
import type { FastifyInstance } from 'fastify';

let serverInstance: FastifyInstance | null = null;

/**
 * サーバーコマンドの作成
 */
export function createServerCommand(): Command {
  const server = new Command('server')
    .description('API server management commands');

  // Start command
  server
    .command('start')
    .description('Start the API server')
    .option('-h, --host <host>', 'Server host', '0.0.0.0')
    .option('-p, --port <port>', 'Server port', '3000')
    .option('--log-level <level>', 'Log level (error, warn, info, debug)', 'info')
    .action(async (options) => {
      try {
        // ログレベルの設定
        process.env.LOG_LEVEL = options.logLevel;

        logger.info('Starting API server', {
          host: options.host,
          port: options.port,
          logLevel: options.logLevel,
        });

        serverInstance = await startServer({
          host: options.host,
          port: parseInt(options.port, 10),
        });

        // Graceful shutdown handlers
        const shutdown = async (signal: string) => {
          logger.info(`Received ${signal}, shutting down gracefully...`);
          if (serverInstance) {
            await stopServer(serverInstance);
            serverInstance = null;
          }
          process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        logger.info('API server started successfully');
      } catch (error) {
        logger.error('Failed to start server', {
          error: error instanceof Error ? error.message : error,
        });
        process.exit(1);
      }
    });

  // Stop command
  server
    .command('stop')
    .description('Stop the API server')
    .action(async () => {
      try {
        if (serverInstance) {
          logger.info('Stopping API server...');
          await stopServer(serverInstance);
          serverInstance = null;
          logger.info('API server stopped successfully');
        } else {
          logger.warn('No server instance is running');
        }
      } catch (error) {
        logger.error('Failed to stop server', {
          error: error instanceof Error ? error.message : error,
        });
        process.exit(1);
      }
    });

  // Status command
  server
    .command('status')
    .description('Check API server status')
    .option('--url <url>', 'Server URL', 'http://localhost:3000')
    .action(async (options) => {
      try {
        const fetch = (await import('node-fetch')).default;
        const healthUrl = `${options.url}/api/v1/health`;

        logger.info('Checking server status', { url: healthUrl });

        const response = await fetch(healthUrl, {
          method: 'GET',
          timeout: 5000,
        });

        if (response.ok) {
          const health = await response.json();
          logger.info('Server status', health);
          console.log('Server is', health.status);
        } else {
          logger.error('Server returned error', {
            status: response.status,
            statusText: response.statusText,
          });
          console.log('Server is not healthy');
          process.exit(1);
        }
      } catch (error) {
        logger.error('Failed to check server status', {
          error: error instanceof Error ? error.message : error,
        });
        console.log('Server is unreachable');
        process.exit(1);
      }
    });

  return server;
}