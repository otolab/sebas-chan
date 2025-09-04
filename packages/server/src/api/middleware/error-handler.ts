import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('API Error:', error);
  
  const status = error.status || 500;
  const message = error.message || 'Internal Server Error';
  
  res.status(status).json({
    success: false,
    error: message,
    timestamp: new Date()
  });
}