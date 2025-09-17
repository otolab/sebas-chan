/**
 * API module exports
 * @module api
 */

export { createServer, startServer, stopServer } from './server';
export type { ServerConfig } from './server';

export { errorHandler, notFoundHandler, ApiException } from './middleware/error';
export type { ApiError } from './middleware/error';

export {
  createValidationMiddleware,
  requestLogger,
  corsOptions,
  schemas,
} from './middleware/validation';
export type { ValidationOptions } from './middleware/validation';

export { registerEventRoutes } from './routes/events';
export { registerSourceRoutes } from './routes/sources';
export { registerStatusRoutes } from './routes/status';
export { registerHealthRoutes } from './routes/health';