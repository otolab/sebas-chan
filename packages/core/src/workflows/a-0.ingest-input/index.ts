/**
 * A-0: INGEST_INPUT ワークフロー
 *
 * 外部データの到着を処理し、エラー検出やIssue作成を行う
 */

import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import { RecordType } from '../recorder.js';
import {
  analyzeInput,
  updateRelatedIssues,
  createNewIssue,
  emitHighPriorityEvent,
} from './actions.js';

/**
 * DATA_ARRIVEDイベントのペイロード型
 */
interface DataArrivedPayload {
  source: string;
  content: string;
  format?: string;
  pondEntryId: string; // すでにPondに保存済み
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * A-0: INGEST_INPUT ワークフロー実行関数
 *
 * 処理の流れ:
 * 1. データ到着イベントの受信
 * 2. AIによる内容分析と関連Issue特定
 * 3. 既存Issueの更新または新規Issue作成
 * 4. エラー検出イベントの発行（必要に応じて）
 * 5. システムStateの更新
 */
async function executeIngestInput(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, createDriver, recorder } = context;
  const payload = event.payload as unknown as DataArrivedPayload;

  // 処理開始を記録
  recorder.record(RecordType.INPUT, {
    workflowName: 'IngestInput',
    event: event.type,
    source: payload.source,
    contentLength: payload.content?.length || 0,
    pondEntryId: payload.pondEntryId,
  });

  try {
    // 1. すでにPondに保存されているので、そのIDを使用
    const pondEntryId = payload.pondEntryId;

    // 2. 単一のドライバーインスタンスを作成（意図: オーバーヘッド削減）
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'fast'],
    });

    // 3. 関連する既存Issueを検索
    recorder.record(RecordType.INFO, {
      step: 'searchRelatedIssues',
      query: payload.content.substring(0, 100),
    });

    const relatedIssues = await storage.searchIssues(payload.content);

    recorder.record(RecordType.DB_QUERY, {
      type: 'searchIssues',
      resultCount: relatedIssues.length,
    });

    // 4. AIによる分析とState更新を同時に実行（意図: 1回のAI呼び出しで完結）
    recorder.record(RecordType.AI_CALL, {
      step: 'analyzeInput',
      model: 'structured-japanese',
      temperature: 0.3,
    });

    const analysis = await analyzeInput(
      driver,
      payload.source,
      payload.format,
      payload.content,
      relatedIssues,
      context.state
    );

    recorder.record(RecordType.INFO, {
      step: 'analysisComplete',
      relatedIssueIds: analysis.relatedIssueIds,
      needsNewIssue: analysis.needsNewIssue,
      severity: analysis.severity,
    });

    // 5. 既存Issueの更新
    const updatedIssueIds = await updateRelatedIssues(
      storage,
      recorder,
      emitter,
      analysis,
      pondEntryId,
      payload.content
    );

    // 6. 新規Issue作成（必要な場合）
    const createdIssueId = await createNewIssue(
      storage,
      recorder,
      emitter,
      analysis,
      pondEntryId,
      payload.content,
      payload.source
    );

    const createdIssueIds = createdIssueId ? [createdIssueId] : [];

    // 7. 高優先度イベントの発行（深刻度が高い場合）
    emitHighPriorityEvent(
      emitter,
      recorder,
      analysis,
      createdIssueId || updatedIssueIds[0]
    );

    // 処理完了を記録
    recorder.record(RecordType.OUTPUT, {
      workflowName: 'IngestInput',
      success: true,
      pondEntryId,
      updatedIssues: updatedIssueIds.length,
      createdIssues: createdIssueIds.length,
      severity: analysis.severity,
    });

    return {
      success: true,
      context: {
        ...context,
        state: analysis.updatedState, // AIが生成したStateを使用
      },
      output: {
        pondEntryId: pondEntryId,
        analyzedContent: true,
        updatedIssueIds,
        createdIssueIds,
        severity: analysis.severity,
      },
    };
  } catch (error) {
    // エラーを記録
    recorder.record(RecordType.ERROR, {
      workflowName: 'IngestInput',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      context,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * INGEST_INPUT ワークフロー定義
 */
export const ingestInputWorkflow: WorkflowDefinition = {
  name: 'IngestInput',
  description: '外部データの到着を処理し、エラー検出やIssue作成を行う',
  triggers: {
    eventTypes: ['DATA_ARRIVED'],
    priority: 40, // 通常優先度
  },
  executor: executeIngestInput,
};