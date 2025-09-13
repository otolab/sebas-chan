import type { Issue, PondEntry, Input } from '@sebas-chan/shared-types';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  ready: boolean;
  engine: 'starting' | 'running' | 'stopped';
  database: boolean;
  agent: boolean;
  timestamp: string;
}

export class ServerAPIClient {
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async getHealth(): Promise<HealthStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return await res.json();
    } catch (error) {
      return {
        status: 'unhealthy',
        ready: false,
        engine: 'stopped',
        database: false,
        agent: false,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getIssues(): Promise<Issue[]> {
    const res = await fetch(`${this.baseUrl}/api/issues`);
    const data = await res.json();
    return data.data || [];
  }

  async getPondEntries(): Promise<PondEntry[]> {
    const res = await fetch(`${this.baseUrl}/api/pond`);
    const data = await res.json();
    return data.data || [];
  }

  async getState(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/system/state`);
    const data = await res.json();
    return data.data || '';
  }

  async getPendingInputs(): Promise<Input[]> {
    const res = await fetch(`${this.baseUrl}/api/inputs/pending`);
    const data = await res.json();
    return data.data || [];
  }
}
