import { describe, it, expect } from 'vitest';
import { createServer } from './index';

describe('API REST Server', () => {
  it('should create a server instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(server.start).toBeDefined();
    expect(server.stop).toBeDefined();
  });

  it('should have start and stop methods', () => {
    const server = createServer();
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });
});
