/**
 * A-3: EXTRACT_KNOWLEDGE ワークフロー
 *
 * 解決済みの追跡事項やパターンから再利用可能な知識を抽出し、Knowledge DBに保存する。
 *
 * このワークフローの役割：
 * - ユーザーが完了した追跡事項から学習し、将来の参考となる知識を抽出
 * - 繰り返し発生するパターンを認識し、効率的な対処法を記録
 * - 知識の重複を避けつつ、既存知識の信頼度を更新
 * - ユーザーの経験を体系化し、忘れても再利用できる形で保存
 */

import type {
  SystemEvent,
  IssueStatusChangedEvent,
  RecurringPatternDetectedEvent,
  KnowledgeExtractableEvent,
} from '@sebas-chan/shared-types';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult, WorkflowDefinition } from '../workflow-types.js';
import { RecordType } from '../recorder.js';
import {
  getContentFromEvent,
  extractKnowledge,
  createNewKnowledge,
  updateExistingKnowledge,
  isDuplicateKnowledge,
} from './actions.js';

/**
 * A-3: EXTRACT_KNOWLEDGE ワークフロー実行関数
 *
 * 処理の流れ:
 * 1. イベントタイプとペイロードから知識抽出対象を特定
 * 2. ソースから実際のコンテンツを取得
 * 3. 既存の類似知識を検索
 * 4. AIで知識を抽出・構造化
 * 5. 重複チェックと新規作成or既存更新
 * 6. システムStateの更新
 */
async function executeExtractKnowledge(
  event: SystemEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, createDriver, recorder } = context;

  // 処理開始を記録
  recorder.record(RecordType.INPUT, {
    workflowName: 'ExtractKnowledge',
    event: event.type,
    payload: event.payload,
  });

  try {
    // 1. イベントからコンテンツを取得（意図: 複数のイベントタイプに対応）
    recorder.record(RecordType.INFO, {
      step: 'getContentFromEvent',
      eventType: event.type,
    });

    const { content, sourceType, sourceId, confidence } = await getContentFromEvent(
      event.type,
      event.payload as
        | KnowledgeExtractableEvent['payload']
        | IssueStatusChangedEvent['payload']
        | RecurringPatternDetectedEvent['payload'],
      storage
    );

    if (!content) {
      recorder.record(RecordType.ERROR, {
        workflowName: 'ExtractKnowledge',
        error: 'No content to extract knowledge from',
        sourceType,
        sourceId,
      });
      return {
        success: false,
        context,
        error: new Error('No content to extract knowledge from'),
      };
    }

    recorder.record(RecordType.INFO, {
      step: 'contentRetrieved',
      sourceType,
      sourceId,
      confidence,
      contentLength: content.length,
    });

    // 2. 既存の類似知識を検索（意図: 重複を避け、関連知識を強化）
    recorder.record(RecordType.INFO, {
      step: 'searchExistingKnowledge',
      query: content.substring(0, 100),
    });

    const existingKnowledge = await storage.searchKnowledge(content);

    recorder.record(RecordType.DB_QUERY, {
      type: 'searchKnowledge',
      existingCount: existingKnowledge.length,
    });

    // 3. 単一のドライバーインスタンスを作成（意図: オーバーヘッド削減）
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning'],
    });

    // 4. AIで知識を抽出とState更新を同時に実行（意図: 1回のAI呼び出しで完結）
    recorder.record(RecordType.AI_CALL, {
      step: 'extractKnowledge',
      model: 'structured-reasoning',
      temperature: 0.2,
    });

    const extraction = await extractKnowledge(
      driver,
      sourceType,
      confidence,
      content,
      existingKnowledge,
      context.state
    );

    recorder.record(RecordType.INFO, {
      step: 'knowledgeExtracted',
      knowledgeLength: extraction.extractedKnowledge.length,
    });

    // 5. 重複チェックと保存処理
    const isDuplicate = isDuplicateKnowledge(extraction.extractedKnowledge, existingKnowledge);
    let knowledgeId: string | null = null;

    if (!isDuplicate && extraction.extractedKnowledge.length > 50 && confidence > 0.5) {
      // 新規Knowledge作成
      knowledgeId = await createNewKnowledge(
        storage,
        recorder,
        emitter,
        extraction.extractedKnowledge,
        sourceType,
        sourceId,
        confidence
      );
    } else if (existingKnowledge.length > 0 && !isDuplicate) {
      // 既存知識の評価を更新
      const targetKnowledge = existingKnowledge[0];
      knowledgeId = await updateExistingKnowledge(
        storage,
        recorder,
        targetKnowledge,
        sourceType,
        sourceId,
        confidence
      );
    } else {
      recorder.record(RecordType.INFO, {
        step: 'knowledgeSkipped',
        reason: isDuplicate ? 'duplicate' : 'low_quality',
      });
    }

    // 処理完了を記録
    recorder.record(RecordType.OUTPUT, {
      workflowName: 'ExtractKnowledge',
      success: true,
      knowledgeId,
      isDuplicate,
      confidence,
    });

    return {
      success: true,
      context: {
        ...context,
        state: extraction.updatedState, // AIが生成したStateを使用
      },
      output: {
        knowledgeId,
        isDuplicate,
        confidence,
        extractedContent: extraction.extractedKnowledge,
        existingKnowledgeCount: existingKnowledge.length,
      },
    };
  } catch (error) {
    // エラーを記録
    recorder.record(RecordType.ERROR, {
      workflowName: 'ExtractKnowledge',
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
 * EXTRACT_KNOWLEDGE ワークフロー定義
 */
export const extractKnowledgeWorkflow: WorkflowDefinition = {
  name: 'ExtractKnowledge',
  description: '解決済みIssueやパターンから再利用可能な知識を抽出し、Knowledge DBに保存する',
  triggers: {
    eventTypes: ['KNOWLEDGE_EXTRACTABLE', 'ISSUE_STATUS_CHANGED', 'RECURRING_PATTERN_DETECTED'],
    condition: (event) => {
      // ISSUE_STATUS_CHANGEDの場合はresolvedのみ
      if (event.type === 'ISSUE_STATUS_CHANGED') {
        const payload = (event as IssueStatusChangedEvent).payload;
        return payload.to === 'closed';
      }
      // RECURRING_PATTERN_DETECTEDの場合は信頼度が高いもののみ
      if (event.type === 'RECURRING_PATTERN_DETECTED') {
        const payload = (event as RecurringPatternDetectedEvent).payload;
        return payload.confidence > 0.7;
      }
      return true;
    },
    priority: 20, // 低めの優先度：バックグラウンド処理
  },
  executor: executeExtractKnowledge,
};
