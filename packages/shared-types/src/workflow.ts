/**
 * ワークフロー実行関連の型定義
 */

import { Issue, Flow, Knowledge, Input, PondEntry } from './index';
import { Event, WorkflowType } from './events';

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
  searchPond(query: string): Promise<PondEntry[]>;
  
  // State文書
  getState(): string;
  updateState(content: string): void;
  
  // イベントキュー
  enqueueEvent(event: Omit<Event, 'id' | 'timestamp'>): void;
  dequeueEvent(): Event | null;
}

/**
 * LLMドライバーインターフェース
 */
export interface LLMDriver {
  complete(prompt: string, options?: LLMOptions): Promise<string>;
  embed(text: string): Promise<number[]>;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

/**
 * ワークフロー実行コンテキスト
 */
export interface WorkflowContext {
  state: string; // 現在のState文書
  coreAPI: CoreAPI; // Core API呼び出し
  llm: LLMDriver; // 生成AI呼び出しAPI
  enqueue: (event: Omit<Event, 'id' | 'timestamp'>) => void; // 新規イベント追加
  logger: Logger; // ログ出力
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
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, error?: any): void;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  data?: any;
}