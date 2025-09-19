/**
 * ワークフロー実行関連の型定義
 */

import type { AIDriver } from '@moduler-prompt/driver';
import {
  Issue,
  Flow,
  Knowledge,
  Input,
  PondEntry,
  PondSearchFilters,
  PondSearchResponse,
} from './index.js';
import { Event, WorkflowType } from './events.js';

/**
 * Core APIインターフェース
 */
export interface CoreAPI {
  // Issue操作
  getIssue(id: string): Promise<Issue>;
  createIssue(data: Omit<Issue, 'id'>): Promise<Issue>;
  updateIssue(id: string, data: Partial<Issue>): Promise<Issue>;
  searchIssues(query: string): Promise<Issue[]>;

  // Flow操作
  getFlow(id: string): Promise<Flow>;
  createFlow(data: Omit<Flow, 'id'>): Promise<Flow>;
  updateFlow(id: string, data: Partial<Flow>): Promise<Flow>;
  searchFlows(query: string): Promise<Flow[]>;

  // Knowledge操作
  getKnowledge(id: string): Promise<Knowledge>;
  createKnowledge(data: Omit<Knowledge, 'id'>): Promise<Knowledge>;
  updateKnowledge(id: string, data: Partial<Knowledge>): Promise<Knowledge>;
  searchKnowledge(query: string): Promise<Knowledge[]>;

  // Input操作
  getInput(id: string): Promise<Input>;
  createInput(data: Omit<Input, 'id'>): Promise<Input>;
  listPendingInputs(): Promise<Input[]>;

  // Pond操作
  addToPond(entry: Omit<PondEntry, 'id'>): Promise<PondEntry>;
  searchPond(filters: PondSearchFilters): Promise<PondSearchResponse>;

  // State文書
  getState(): string;
  updateState(content: string): void;

  // イベント発行
  emitEvent(event: Omit<Event, 'id' | 'timestamp'>): void;
}

/**
 * ドライバー選択基準
 */
export interface DriverSelectionCriteria {
  task?: string;
  model?: string;
  capabilities?: string[];
}

/**
 * ワークフロー実行コンテキスト
 */
export interface WorkflowContext {
  state: string; // 現在のState文書
  storage: {
    // DB操作インターフェース
    searchIssues(query: string): Promise<Issue[]>;
    searchKnowledge(query: string): Promise<Knowledge[]>;
    searchPond(query: string): Promise<PondEntry[]>;
    getIssue(id: string): Promise<Issue | null>;
    createIssue(issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Issue>;
    updateIssue(id: string, update: Partial<Issue>): Promise<Issue>;
    addPondEntry(entry: Omit<PondEntry, 'id' | 'timestamp'>): Promise<PondEntry>;
    createKnowledge(knowledge: Omit<Knowledge, 'id' | 'createdAt'>): Promise<Knowledge>;
    updateKnowledge(id: string, update: Partial<Knowledge>): Promise<Knowledge>;
  };
  createDriver: (criteria: DriverSelectionCriteria) => Promise<AIDriver>; // AIドライバーファクトリ
  logger: Logger; // ログ出力
  metadata?: Record<string, unknown>; // 実行時メタデータ
}

/**
 * ワークフロー実行結果
 */
export interface WorkflowResult {
  success: boolean;
  stateUpdate?: string; // State文書の更新内容
  logs: LogEntry[]; // 実行ログ
  error?: Error; // エラー情報
}

/**
 * ワークフロー定義
 */
export interface Workflow {
  name: WorkflowType;
  description: string;
  priority: 'high' | 'normal' | 'low';
  execute(context: WorkflowContext): Promise<WorkflowResult>;
}

/**
 * ログ関連
 */
export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  data?: unknown;
}
