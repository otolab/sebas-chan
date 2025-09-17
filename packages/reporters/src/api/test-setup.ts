/**
 * API Test Setup
 * Quick test to verify API endpoints are working
 */

import { createServer } from './server';
import type { FastifyInstance } from 'fastify';
import { logger } from '../services';

async function testApi(): Promise<void> {
  let server: FastifyInstance | null = null;

  try {
    // Create server instance
    logger.info('Creating test server...');
    server = await createServer({
      host: '127.0.0.1',
      port: 3001,
      logger: true,
    });

    // Start server
    await server.listen({
      port: 3001,
      host: '127.0.0.1',
    });

    logger.info('Test server started on http://127.0.0.1:3001');

    // Test endpoints
    const tests = [
      { method: 'GET', url: '/api/v1/health' },
      { method: 'GET', url: '/api/v1/status' },
      { method: 'GET', url: '/api/v1/sources' },
      { method: 'GET', url: '/api/v1/events' },
    ];

    for (const test of tests) {
      const response = await server.inject({
        method: test.method,
        url: test.url,
      });

      logger.info(`Test ${test.method} ${test.url}`, {
        status: response.statusCode,
        body: JSON.parse(response.body),
      });
    }

    // Test POST endpoint
    const eventResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/events',
      payload: {
        type: 'notification',
        sourceId: 'test-source',
        payload: {
          title: 'Test Event',
          message: 'This is a test event',
        },
      },
    });

    logger.info('Test POST /api/v1/events', {
      status: eventResponse.statusCode,
      body: JSON.parse(eventResponse.body),
    });

    logger.info('All tests completed successfully!');
  } catch (error) {
    logger.error('Test failed', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  } finally {
    if (server) {
      await server.close();
      logger.info('Test server closed');
    }
  }
}

// Run test if executed directly
if (require.main === module) {
  testApi()
    .then(() => {
      logger.info('Test completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Test error', { error });
      process.exit(1);
    });
}