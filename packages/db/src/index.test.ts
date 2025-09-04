import { describe, it, expect } from 'vitest';
import { DBClient } from './index';

describe('DBClient', () => {
  it('should create an instance', () => {
    const client = new DBClient();
    expect(client).toBeInstanceOf(DBClient);
  });

  it('should have connect method', () => {
    const client = new DBClient();
    expect(client.connect).toBeDefined();
    expect(typeof client.connect).toBe('function');
  });

  it('should have disconnect method', () => {
    const client = new DBClient();
    expect(client.disconnect).toBeDefined();
    expect(typeof client.disconnect).toBe('function');
  });
});
