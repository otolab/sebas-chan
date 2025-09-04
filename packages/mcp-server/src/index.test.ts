import { describe, it, expect } from 'vitest';
import { MCPServer } from './index';

describe('MCPServer', () => {
  it('should create an instance', () => {
    const server = new MCPServer();
    expect(server).toBeInstanceOf(MCPServer);
  });

  it('should have start and stop methods', () => {
    const server = new MCPServer();
    expect(server.start).toBeDefined();
    expect(server.stop).toBeDefined();
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });
});
