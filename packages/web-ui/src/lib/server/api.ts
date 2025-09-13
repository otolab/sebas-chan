import type { Input, Issue, Flow, PondEntry, Knowledge } from '@sebas-chan/shared-types';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001/api';

export class ServerAPIClient {
  async getInputs(): Promise<Input[]> {
    const res = await fetch(`${API_BASE}/inputs/pending`);
    if (!res.ok) throw new Error('Failed to fetch inputs');
    const data = await res.json();
    return data.data;
  }

  async getIssues(query?: string): Promise<Issue[]> {
    const url = query ? `${API_BASE}/issues?q=${encodeURIComponent(query)}` : `${API_BASE}/issues`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch issues');
    const data = await res.json();
    return data.data || [];
  }

  async getState(): Promise<{ content: string; lastUpdate: Date | null }> {
    const res = await fetch(`${API_BASE}/state`);
    if (!res.ok) throw new Error('Failed to fetch state');
    const data = await res.json();
    return {
      content: data.data?.content || '',
      lastUpdate: data.data?.lastUpdate ? new Date(data.data.lastUpdate) : null,
    };
  }

  async getKnowledge(query?: string): Promise<Knowledge[]> {
    const url = query ? `${API_BASE}/knowledge?q=${encodeURIComponent(query)}` : `${API_BASE}/knowledge`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch knowledge');
    const data = await res.json();
    return data.data || [];
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

  async getLogs(params?: {
    executionId?: string;
    workflowType?: string;
    level?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    data: any[];
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

    const url = searchParams.toString() ? `${API_BASE}/logs?${searchParams}` : `${API_BASE}/logs`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch logs');
    const result = await res.json();

    return {
      data: result.data || [],
      meta: result.meta || { total: 0, limit: 50, offset: 0, hasMore: false },
    };
  }

  async getLogDetail(executionId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/logs/${executionId}`);
    if (!res.ok) throw new Error('Failed to fetch log detail');
    const data = await res.json();
    return data.data;
  }
}
