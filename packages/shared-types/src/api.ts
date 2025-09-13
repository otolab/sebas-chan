/**
 * REST API関連の型定義
 */

import { Flow, Knowledge } from './index.js';

/**
 * APIレスポンス
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

/**
 * ページネーション
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * リクエストDTO
 */
export interface CreateIssueDto {
  title: string;
  description: string;
  labels?: string[];
  sourceInputIds?: string[];
}

export interface UpdateIssueDto {
  title?: string;
  description?: string;
  status?: 'open' | 'closed';
  labels?: string[];
}

export interface CreateFlowDto {
  title: string;
  description: string;
  issueIds?: string[];
}

export interface UpdateFlowDto {
  title?: string;
  description?: string;
  status?: Flow['status'];
  priorityScore?: number;
  issueIds?: string[];
}

export interface CreateKnowledgeDto {
  type: Knowledge['type'];
  content: string;
  sources?: Knowledge['sources'];
}

export interface UpdateKnowledgeReputationDto {
  action: 'upvote' | 'downvote';
}

export interface CreateInputDto {
  source: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessRequestDto {
  prompt: string;
  context?: Record<string, unknown>;
}

/**
 * システム統計
 */
export interface SystemStats {
  issues: {
    open: number;
    closed: number;
    total: number;
    avgCloseTime: number; // hours
  };
  flows: {
    active: number;
    blocked: number;
    completed: number;
    total: number;
  };
  knowledge: {
    total: number;
    byType: Record<Knowledge['type'], number>;
    avgReputation: number;
  };
  pond: {
    size: number;
    lastSalvage: Date | null;
  };
  agent: {
    loopCount: number;
    avgLoopTime: number; // ms
    lastActivity: Date;
  };
}
