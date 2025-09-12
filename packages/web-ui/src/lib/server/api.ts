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

  async getPond(params?: {
    q?: string;
    source?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    data: PondEntry[];
    meta: { total: number; limit: number; offset: number; hasMore: boolean };
  }> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value));
        }
      });
    }

    const url = searchParams.toString() ? `${API_BASE}/pond?${searchParams}` : `${API_BASE}/pond`;
    console.log('[API] Pond検索リクエスト:', { url, params });

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch pond');
    const result = await res.json();

    console.log('[API] Pond検索レスポンス:', {
      dataCount: result.data?.length || 0,
      meta: result.meta,
    });

    return {
      data: result.data,
      meta: result.meta,
    };
  }

  async getPondSources(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/pond/sources`);
    if (!res.ok) throw new Error('Failed to fetch pond sources');
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
