import type { Input, Issue, Flow, PondEntry } from '@sebas-chan/shared-types';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';

export class ServerAPIClient {
  async getInputs(): Promise<Input[]> {
    const res = await fetch(`${API_BASE}/inputs/pending`);
    if (!res.ok) throw new Error('Failed to fetch inputs');
    const data = await res.json();
    return data.data;
  }
  
  async getIssues(): Promise<Issue[]> {
    const res = await fetch(`${API_BASE}/issues`);
    if (!res.ok) throw new Error('Failed to fetch issues');
    const data = await res.json();
    return data.data;
  }
  
  async getState(): Promise<string> {
    const res = await fetch(`${API_BASE}/state`);
    if (!res.ok) throw new Error('Failed to fetch state');
    const data = await res.json();
    return data.state;
  }

  async getPond(): Promise<PondEntry[]> {
    const res = await fetch(`${API_BASE}/pond`);
    if (!res.ok) throw new Error('Failed to fetch pond');
    const data = await res.json();
    return data.data;
  }

  async getFlows(): Promise<Flow[]> {
    const res = await fetch(`${API_BASE}/flows`);
    if (!res.ok) throw new Error('Failed to fetch flows');
    const data = await res.json();
    return data.data;
  }

  async getIssueById(id: string): Promise<Issue> {
    const res = await fetch(`${API_BASE}/issues/${id}`);
    if (!res.ok) throw new Error('Failed to fetch issue');
    const data = await res.json();
    return data.data;
  }
}