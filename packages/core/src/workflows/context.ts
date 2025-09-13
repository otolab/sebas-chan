import type { Issue, Knowledge, PondEntry, Input } from '@sebas-chan/shared-types';
import type { WorkflowLogger } from './logger.js';

/**
 * ワークフローが動作する環境のインターフェース
 * Engineが実装を提供する
 */
export interface WorkflowContext {
  /**
   * 現在のState（StateMachineのState）
   * ワークフローを跨いで引き継がれる状態
   */
  state: string;

  /**
   * データストレージへのアクセス
   */
  storage: WorkflowStorage;

  /**
   * ワークフロー専用ログ
   */
  logger: WorkflowLogger;

  /**
   * AIドライバー（オプション）
   * @moduler-prompt/driverのインスタンス（1モデル固定）
   */
  driver?: any;

  /**
   * 実行時設定
   */
  config?: WorkflowConfig;

  /**
   * 実行時メタデータ
   */
  metadata?: Record<string, any>;
}

/**
 * データストレージインターフェース
 */
export interface WorkflowStorage {
  // 検索系
  searchIssues(query: string): Promise<Issue[]>;
  searchKnowledge(query: string): Promise<Knowledge[]>;
  searchPond(query: string): Promise<PondEntry[]>;

  // Issue操作
  getIssue(id: string): Promise<Issue | null>;
  createIssue(issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt'>): Promise<Issue>;
  updateIssue(id: string, update: Partial<Issue>): Promise<Issue>;

  // Pond操作
  addPondEntry(entry: Omit<PondEntry, 'id' | 'timestamp'>): Promise<PondEntry>;

  // Knowledge操作
  createKnowledge(knowledge: Omit<Knowledge, 'id' | 'createdAt'>): Promise<Knowledge>;
  updateKnowledge(id: string, update: Partial<Knowledge>): Promise<Knowledge>;
}

/**
 * ワークフロー実行設定
 */
export interface WorkflowConfig {
  /**
   * AIモデル設定（driverインスタンスで固定されるため、主にtemperature等のパラメータ）
   */
  temperature?: number;
  maxTokens?: number;

  /**
   * リトライ設定
   */
  maxRetries?: number;
  retryDelay?: number;

  /**
   * タイムアウト設定
   */
  timeout?: number;
}

/**
 * イベントエミッター（次のワークフロー起動用）
 */
export interface WorkflowEventEmitter {
  /**
   * 次のイベントを発行
   */
  emit(event: {
    type: string;
    priority?: 'high' | 'normal' | 'low';
    payload: any;
  }): void;
}