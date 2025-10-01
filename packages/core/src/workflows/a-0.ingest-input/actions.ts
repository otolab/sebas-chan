/**
 * IngestInputワークフローのヘルパー関数
 */

import type { Issue, IssueUpdate } from '@sebas-chan/shared-types';
import { PRIORITY } from '@sebas-chan/shared-types';
import type { WorkflowEventEmitterInterface, WorkflowStorageInterface, WorkflowRecorder } from '../context.js';
import type { AIDriver } from '@moduler-prompt/driver';
import { compile } from '@moduler-prompt/core';
import { ingestInputPromptModule, type InputAnalysisContext } from './prompts.js';
import { RecordType } from '../recorder.js';

/**
 * AI分析結果の型定義
 */
export interface InputAnalysisResult {
  relatedIssueIds: string[];
  needsNewIssue: boolean;
  newIssueTitle?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  updateContent?: string;
  labels: string[];
  updatedState: string; // State更新も含む
}

/**
 * 入力データをAIで分析
 * 意図: 入力内容から関連Issue特定、新規Issue作成の必要性、優先度を判定
 */
export async function analyzeInput(
  driver: AIDriver,
  source: string,
  format: string | undefined,
  content: string,
  relatedIssues: Issue[],
  currentState: string
): Promise<InputAnalysisResult> {
  // 意図: PromptModuleのコンテキストに必要なデータを集約
  const analysisContext: InputAnalysisContext = {
    source,
    format,
    content,
    relatedIssues,
    currentState, // updateStatePromptModuleが必要とする現在のState
  };

  const compiledPrompt = compile(ingestInputPromptModule, analysisContext);
  const result = await driver.query(compiledPrompt, { temperature: 0.3 });

  // 意図: 構造化出力は必須（ワークフローの前提条件）
  if (result.structuredOutput) {
    return result.structuredOutput as InputAnalysisResult;
  }

  throw new Error('AI分析結果の取得に失敗しました');
}

/**
 * Issueのタイトルを抽出
 * 意図: コンテンツの最初の部分を読みやすいタイトルに変換
 */
export function extractIssueTitle(content: string): string {
  const firstLine = content.split('\n')[0];
  return firstLine.substring(0, 50) + (firstLine.length > 50 ? '...' : '');
}


/**
 * 深刻度から優先度を決定
 * 意図: AI判定の深刻度を具体的な優先度数値に変換
 */
export function determinePriority(severity: 'low' | 'medium' | 'high' | 'critical'): number {
  switch (severity) {
    case 'critical': return PRIORITY.CRITICAL;
    case 'high': return PRIORITY.HIGH;
    case 'medium': return PRIORITY.MEDIUM;
    case 'low': return PRIORITY.LOW;
  }
}

/**
 * 既存Issueを更新
 * 意図: 関連するIssueに新しい情報を追加し、必要に応じて優先度を上げる
 */
export async function updateRelatedIssues(
  storage: WorkflowStorageInterface,
  recorder: WorkflowRecorder,
  emitter: WorkflowEventEmitterInterface,
  analysis: InputAnalysisResult,
  pondEntryId: string,
  content: string
): Promise<string[]> {
  const updatedIssueIds: string[] = [];

  if (analysis.relatedIssueIds && analysis.relatedIssueIds.length > 0) {
    for (const issueId of analysis.relatedIssueIds) {
      const issue = await storage.getIssue(issueId);
      if (issue) {
        const update: IssueUpdate = {
          timestamp: new Date(),
          content: analysis.updateContent || `関連データ受信:\n${content.substring(0, 500)}`,
          author: 'ai' as const,
        };

        await storage.updateIssue(issueId, {
          updates: [...issue.updates, update],
          sourceInputIds: [...(issue.sourceInputIds || []), pondEntryId],
          // 優先度の更新が必要な場合
          ...(analysis.severity === 'critical' && issue.priority !== PRIORITY.CRITICAL
            ? { priority: PRIORITY.CRITICAL }
            : {}),
        });

        updatedIssueIds.push(issueId);

        recorder.record(RecordType.DB_QUERY, {
          type: 'updateIssue',
          issueId,
          action: 'addUpdate',
        });

        // Issue更新イベントを発行
        emitter.emit({
          type: 'ISSUE_UPDATED',
          payload: {
            issueId: issueId,
            updates: {
              before: { priority: issue.priority },
              after: { priority: analysis.severity === 'critical' ? PRIORITY.CRITICAL : issue.priority },
              changedFields: ['updates', 'sourceInputIds'],
            },
            updatedBy: 'IngestInput',
          },
        });
      }
    }
  }

  return updatedIssueIds;
}

/**
 * 新規Issueを作成
 * 意図: 既存Issueで対応できない新しい追跡事項を記録
 */
export async function createNewIssue(
  storage: WorkflowStorageInterface,
  recorder: WorkflowRecorder,
  emitter: WorkflowEventEmitterInterface,
  analysis: InputAnalysisResult,
  pondEntryId: string,
  content: string,
  source: string
): Promise<string | null> {
  if (!analysis.needsNewIssue || (analysis.relatedIssueIds && analysis.relatedIssueIds.length > 0)) {
    return null;
  }

  const issueId = `issue-${Date.now()}`;
  const newIssue = {
    title: analysis.newIssueTitle || extractIssueTitle(content),
    description: content,
    status: 'open' as const,
    labels: analysis.labels || [`source:${source}`],
    priority: determinePriority(analysis.severity),
    sourceInputIds: [pondEntryId],
    updates: [],
    relations: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createdIssue = await storage.createIssue(newIssue);

  recorder.record(RecordType.DB_QUERY, {
    type: 'createIssue',
    issueId: createdIssue.id,
    title: newIssue.title,
  });

  // Issue作成イベントを発行
  emitter.emit({
    type: 'ISSUE_CREATED',
    payload: {
      issueId: createdIssue.id,
      issue: createdIssue,
      createdBy: 'system',
      sourceWorkflow: 'IngestInput',
    },
  });

  return createdIssue.id;
}

/**
 * 高優先度イベントを発行
 * 意図: 深刻度が高い事項を即座にシステム全体に通知
 */
export function emitHighPriorityEvent(
  emitter: WorkflowEventEmitterInterface,
  recorder: WorkflowRecorder,
  analysis: InputAnalysisResult,
  issueId?: string
): void {
  if (analysis.severity === 'critical' || analysis.severity === 'high') {
    emitter.emit({
      type: 'HIGH_PRIORITY_ISSUE_DETECTED',
      payload: {
        issueId: issueId || `pending-${Date.now()}`,
        priority: determinePriority(analysis.severity),
        reason: `High severity ${analysis.severity} issue detected`,
        requiredAction: analysis.updateContent || 'Immediate attention required',
      },
    });

    recorder.record(RecordType.INFO, {
      step: 'eventEmitted',
      eventType: 'HIGH_PRIORITY_ISSUE_DETECTED',
      severity: analysis.severity,
    });
  }
}