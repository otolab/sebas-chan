import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult } from '../workflow-types.js';
import type { WorkflowDefinition } from '../workflow-types.js';
import type { IssueUpdate } from '@sebas-chan/shared-types';
import { compile } from '@moduler-prompt/core';

// リクエストの型定義
interface UserRequest {
  id?: string;
  content?: string;
}

// 分析結果の型定義
interface AnalysisResult {
  interpretation: string;
  requestType: string;
  events?: Array<{
    type: string;
    reason: string;
    payload: Record<string, unknown>;
  }>;
  actions?: Array<{
    type: string;
    target: string;
    details: string;
  }>;
  response: string;
}

/**
 * 次のイベントを決定する
 * 新しいイベント体系に基づいて適切なイベントを発行
 */
function determineNextEvents(
  requestType: string,
  request: UserRequest,
  aiResponse: string
): Array<{
  type: string;
  payload: Record<string, unknown>;
}> {
  const events: Array<{
    type: string;
    payload: Record<string, unknown>;
  }> = [];

  const timestamp = new Date().toISOString();

  switch (requestType) {
    case 'issue':
      // 問題報告の場合、まずIssueを作成するイベント
      events.push({
        type: 'ISSUE_CREATED',
        payload: {
          issueId: `issue-${Date.now()}`, // 仮ID（実際はシステムが生成）
          issue: {
            title: `User reported: ${request.content?.substring(0, 50)}...`,
            description: request.content || '',
            status: 'open',
            labels: ['user-reported'],
            priority: undefined, // AIで判定される
          },
          createdBy: 'user',
          sourceWorkflow: 'ProcessUserRequest',
        },
      });
      break;

    case 'question':
      // 質問の場合、知識抽出可能イベント
      events.push({
        type: 'KNOWLEDGE_EXTRACTABLE',
        payload: {
          sourceType: 'question',
          sourceId: request.id || `question-${Date.now()}`,
          confidence: 0.8,
          reason: 'User asked a question that may contain valuable knowledge',
          suggestedCategory: 'reference',
        },
      });
      break;

    case 'feedback':
      // フィードバックの場合も知識抽出可能イベント
      events.push({
        type: 'KNOWLEDGE_EXTRACTABLE',
        payload: {
          sourceType: 'feedback',
          sourceId: request.id || `feedback-${Date.now()}`,
          confidence: 0.9,
          reason: 'User provided feedback that should be captured as knowledge',
          suggestedCategory: 'best_practice',
        },
      });
      break;

    case 'action':
      // アクション要求の場合
      events.push({
        type: 'HIGH_PRIORITY_DETECTED',
        payload: {
          entityType: 'task',
          entityId: request.id || `action-${Date.now()}`,
          priority: 85,
          reason: 'User requested immediate action',
          requiredAction: aiResponse,
        },
      });
      break;
  }

  return events;
}

/**
 * リクエストタイプを分類
 */
function classifyRequest(content: string): string {
  const lowerContent = content.toLowerCase();

  if (
    lowerContent.includes('エラー') ||
    lowerContent.includes('error') ||
    lowerContent.includes('問題') ||
    lowerContent.includes('issue') ||
    lowerContent.includes('バグ') ||
    lowerContent.includes('bug')
  ) {
    return 'issue';
  }

  if (
    lowerContent.includes('どうやって') ||
    lowerContent.includes('how to') ||
    lowerContent.includes('？') ||
    lowerContent.includes('?')
  ) {
    return 'question';
  }

  return 'feedback';
}

/**
 * A-1: PROCESS_USER_REQUEST ワークフロー実行関数
 * ユーザーからのリクエストを処理し、適切な後続処理を起動
 */
async function executeProcessUserRequest(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { createDriver, storage } = context;
  interface ProcessUserRequestPayload {
    userId?: string;
    content?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }
  const payload = event.payload as unknown as ProcessUserRequestPayload;

  try {
    // 1. 既存のIssue、Knowledge、Pondを検索
    const [relatedIssues, relatedKnowledge, relatedPondEntries] = await Promise.all([
      storage.searchIssues(payload.content || ''),
      storage.searchKnowledge(payload.content || ''),
      storage.searchPond(payload.content || ''),
    ]);

    // 2. AIを使ってリクエストを分析し、適切なイベントを決定
    const driver = await createDriver({
      requiredCapabilities: ['structured'],
      preferredCapabilities: ['japanese', 'reasoning'],
    });

    const eventCatalogSummary = `
利用可能なイベント:
- DATA_ARRIVED: 外部データ到着（Pond自動保存）
- ISSUE_CREATED: 新Issue作成
- ISSUE_UPDATED: Issue更新
- ISSUE_STATUS_CHANGED: Issueステータス変更
- ERROR_DETECTED: エラー検出
- PATTERN_FOUND: パターン発見
- KNOWLEDGE_EXTRACTABLE: 知識抽出可能
- HIGH_PRIORITY_DETECTED: 高優先度検出
- SCHEDULED_TIME_REACHED: スケジュール時刻到達
`;

    const prompt = `
ユーザーリクエストを分析し、適切なアクションとイベントを決定してください。

ユーザーリクエスト: ${payload.content}

既存データ:
- 関連Issue: ${relatedIssues.length}件
${relatedIssues.slice(0, 5).map(i => `  - [${i.id}] ${i.title} (${i.status})`).join('\n')}
- 関連Knowledge: ${relatedKnowledge.length}件
${relatedKnowledge.slice(0, 3).map(k => `  - ${k.content.substring(0, 50)}...`).join('\n')}
- 関連Pondエントリ: ${relatedPondEntries.length}件

${eventCatalogSummary}

ユーザーのリクエストから以下を判定してください：
1. 何が起きたか/何をすべきか
2. 発行すべきイベント（複数可）
3. 検索や参照が必要なデータ
4. 実行すべきアクション

JSONで応答してください：
{
  "interpretation": "リクエストの解釈",
  "requestType": "issue|question|action|feedback|schedule|search",
  "events": [
    {
      "type": "イベントタイプ",
      "reason": "発行理由",
      "payload": {}
    }
  ],
  "actions": [
    {
      "type": "search|create|update|analyze",
      "target": "issue|knowledge|pond",
      "details": "具体的な内容"
    }
  ],
  "response": "ユーザーへの応答メッセージ"
}
`;

    const promptModule = {
      instructions: [prompt],
      output: {
        schema: {
          type: 'object',
          properties: {
            interpretation: { type: 'string' },
            requestType: {
              type: 'string',
              enum: ['issue', 'question', 'feedback', 'request', 'other']
            },
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  reason: { type: 'string' },
                  payload: { type: 'object' }
                }
              }
            },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  target: { type: 'string' },
                  details: { type: 'string' }
                }
              }
            },
            response: { type: 'string' }
          },
          required: ['interpretation', 'requestType', 'response']
        }
      }
    };
    const compiledPrompt = compile(promptModule);
    const result = await driver.query(compiledPrompt, { temperature: 0.3 });

    let analysis: AnalysisResult;
    if (result.structuredOutput) {
      analysis = result.structuredOutput as AnalysisResult;
    } else {
      try {
        analysis = JSON.parse(result.content) as AnalysisResult;
      } catch {
        // JSON解析失敗時のフォールバック
        analysis = {
          interpretation: result.content,
          requestType: classifyRequest(String(payload.content)),
          events: [],
          actions: [],
          response: result.content,
        };
      }
    }

    // 3. アクションの実行とイベント発行
    const executedActions: string[] = [];
    
    // アクションを実行
    if (analysis.actions && analysis.actions.length > 0) {
      for (const action of analysis.actions) {
        if (action.type === 'create' && action.target === 'issue') {
          // 新規Issue作成
          const issueId = `issue-${Date.now()}`;
          const newIssue = await storage.createIssue({
            title: action.details || payload.content?.substring(0, 50) || 'User Request',
            description: payload.content || '',
            status: 'open',
            labels: ['user-reported'],
            priority: undefined,
            updates: [],
            relations: [],
            sourceInputIds: [],
          });
          
          executedActions.push(`Issue作成: ${newIssue.id}`);
          
          // Issue作成イベントを追加
          if (!analysis.events) analysis.events = [];
          analysis.events.push({
            type: 'ISSUE_CREATED',
            reason: 'ユーザーリクエストから新規Issue作成',
            payload: {
              issueId: newIssue.id,
              issue: newIssue,
              createdBy: 'user',
              sourceWorkflow: 'ProcessUserRequest',
            },
          });
        } else if (action.type === 'update' && action.target === 'issue' && relatedIssues.length > 0) {
          // 既存Issue更新
          const targetIssue = relatedIssues[0];
          const update: IssueUpdate = {
            timestamp: new Date(),
            content: `ユーザーからの追加情報: ${payload.content}`,
            author: 'user' as const,
          };
          
          await storage.updateIssue(targetIssue.id, {
            updates: [...targetIssue.updates, update],
          });
          
          executedActions.push(`Issue更新: ${targetIssue.id}`);
          
          // Issue更新イベントを追加
          if (!analysis.events) analysis.events = [];
          analysis.events.push({
            type: 'ISSUE_UPDATED',
            reason: 'ユーザーリクエストによる更新',
            payload: {
              issueId: targetIssue.id,
              updates: {
                before: {},
                after: {},
                changedFields: ['updates'],
              },
              updatedBy: 'user',
            },
          });
        } else if (action.type === 'search') {
          executedActions.push(`${action.target}を検索: ${action.details}`);
        }
      }
    }

    // 4. 分析に基づいてイベントを発行
    if (analysis.events && analysis.events.length > 0) {
      for (const eventConfig of analysis.events) {
        // ユーザーリクエストの内容をPondに保存（DATA_ARRIVEDイベントの場合）
        if (eventConfig.type === 'DATA_ARRIVED') {
          const pondEntry = await storage.addPondEntry({
            content: payload.content || '',
            source: 'user_request',
            metadata: {
              userId: payload.userId,
              sessionId: payload.sessionId,
              ...payload.metadata,
            },
          });
          
          emitter.emit({
            type: 'DATA_ARRIVED',
            payload: {
              source: 'user_request',
              content: payload.content || '',
              format: 'text',
              pondEntryId: pondEntry.id,
              metadata: payload.metadata,
              timestamp: new Date().toISOString(),
            },
          });
        } else {
          // その他のイベントをそのまま発行
          emitter.emit({
            type: eventConfig.type,
            payload: eventConfig.payload || {},
          });
        }
      }
    }

    // デフォルトのイベント発行（何も決定されなかった場合）
    if (!analysis.events || analysis.events.length === 0) {
      // リクエストタイプに基づいてデフォルトイベントを決定
      const defaultEvents = determineNextEvents(
        analysis.requestType || 'feedback',
        { content: payload.content },
        analysis.response || ''
      );
      
      for (const defaultEvent of defaultEvents) {
        emitter.emit(defaultEvent);
      }
    }

    // 5. State更新
    const timestamp = new Date().toISOString();
    const updatedState =
      context.state +
      `
## ユーザーリクエスト処理 (${timestamp})
- User ID: ${payload.userId || 'anonymous'}
- Request Type: ${analysis.requestType}
- Interpretation: ${analysis.interpretation}
- Related Issues: ${relatedIssues.length}
- Related Knowledge: ${relatedKnowledge.length}
- Events Emitted: ${analysis.events?.map(e => e.type).join(', ') || 'None'}
- Actions Executed: ${executedActions.join(', ') || 'None'}
`;

    return {
      success: true,
      context: {
        ...context,
        state: updatedState,
      },
      output: {
        requestType: analysis.requestType,
        interpretation: analysis.interpretation,
        response: analysis.response,
        eventsEmitted: analysis.events?.map(e => e.type) || [],
        actionsExecuted: executedActions,
        relatedData: {
          issues: relatedIssues.length,
          knowledge: relatedKnowledge.length,
          pondEntries: relatedPondEntries.length,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      context,
      error: error as Error,
    };
  }
}

/**
 * PROCESS_USER_REQUEST ワークフロー定義
 */
export const processUserRequestWorkflow: WorkflowDefinition = {
  name: 'ProcessUserRequest',
  description: 'ユーザーリクエストを分類し、適切な後続ワークフローへルーティングする',
  triggers: {
    eventTypes: ['PROCESS_USER_REQUEST'],
  },
  executor: executeProcessUserRequest,
};
