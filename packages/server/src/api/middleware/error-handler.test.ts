import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { errorHandler } from './error-handler';

describe('Error Handler Middleware', () => {
  it('should handle errors with status and message', () => {
    const mockReq = {} as Request;
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as Response;
    const mockNext = vi.fn() as NextFunction;
    
    const error = {
      status: 404,
      message: 'Not Found'
    };
    
    errorHandler(error, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'Not Found',
      timestamp: expect.any(Date)
    });
  });
  
  it('should use default status 500 for errors without status', () => {
    const mockReq = {} as Request;
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as Response;
    const mockNext = vi.fn() as NextFunction;
    
    const error = {
      message: 'Something went wrong'
    };
    
    errorHandler(error, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'Something went wrong',
      timestamp: expect.any(Date)
    });
  });
  
  it('should use default message for errors without message', () => {
    const mockReq = {} as Request;
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as Response;
    const mockNext = vi.fn() as NextFunction;
    
    const error = {};
    
    errorHandler(error, mockReq, mockRes, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: 'Internal Server Error',
      timestamp: expect.any(Date)
    });
  });
});