/**
 * C-1: SUGGEST_NEXT_FLOW ワークフローのアクション関数
 */

import type { Flow } from '@sebas-chan/shared-types';
import type { AIDriver } from '@moduler-prompt/driver';
import type { WorkflowStorageInterface, WorkflowRecorder } from '../context.js';
import { RecordType } from '../recorder.js';
import { compile } from '@moduler-prompt/core';
import { nextFlowPromptModule } from './prompts.js';

/**
 * コンテキスト分析結果の型定義
 */
export interface ContextAnalysis {
  timeContext: {
    currentTime: Date;
    timezone: string;
    isWorkingHours: boolean;
  };
  userContext: {
    recentFlows: Flow[];
    currentEnergy: 'high' | 'medium' | 'low';
    availableTime: number;
  };
  flowContext: {
    activeFlows: Flow[];
    upcomingDeadlines: Flow[];
  };
  completedFlowAnalysis: Flow | null;
}

/**
 * Flow提案結果の型定義
 */
export interface FlowSuggestionResult {
  suggestions: Array<{
    flowId: string;
    score: number;
    reason: string;
    matchFactors: Array<{
      factor: 'priority' | 'deadline' | 'energy_match' | 'time_fit' | 'context_continuity' | 'user_preference' | 'dependency';
      score: number;
      description: string;
    }>;
    estimatedDuration: number;
    energyRequired: 'high' | 'medium' | 'low';
    bestTimeSlot?: {
      start: string;
      end: string;
    };
    alternativeIf?: {
      condition: string;
      alternativeFlowId: string;
      reason: string;
    };
    preparationSteps?: string[];
  }>;
  contextInsights: {
    currentFocus: string;
    productivityAdvice: string;
    bottleneck?: string;
  };
  fallbackSuggestion?: {
    action: 'take_break' | 'review_progress' | 'organize_thoughts';
    reason: string;
    duration: number;
  };
  updatedState: string;
}

/**
 * 次のFlowを提案
 */
export async function suggestNextFlow(
  driver: AIDriver,
  contextAnalysis: ContextAnalysis,
  constraints: any,
  currentState: string
): Promise<FlowSuggestionResult> {
  // Knowledgeの取得（実際はstorageから取得すべきだが、簡略化）
  const knowledgeBase: any[] = [];

  const context = {
    contextAnalysis,
    knowledgeBase,
    constraints,
    currentState,
  };

  const compiled = compile(nextFlowPromptModule, context);
  const result = await driver.query(compiled, { temperature: 0.4 });

  if (!result.structuredOutput) {
    throw new Error('Flow提案の構造化出力の取得に失敗しました');
  }

  return result.structuredOutput as FlowSuggestionResult;
}

/**
 * 提案を記録
 */
export async function recordSuggestion(
  trigger: string,
  suggestionResult: FlowSuggestionResult,
  contextAnalysis: ContextAnalysis,
  storage: WorkflowStorageInterface,
  recorder: WorkflowRecorder
): Promise<void> {
  // 提案の記録（学習用）
  // 実際はDBに保存すべきだが、ここではログのみ
  recorder.record(RecordType.INFO, {
    type: 'suggestion_recorded',
    trigger,
    suggestionsCount: suggestionResult.suggestions.length,
    primaryFlowId: suggestionResult.suggestions[0]?.flowId,
    timestamp: new Date(),
  });

  // ユーザーの選択は後で更新される
  // 実際の実装では、ユーザーがFlowを選択した際に
  // この記録を更新してフィードバックループを作る
}