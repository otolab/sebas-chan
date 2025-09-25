import type { AgentEvent } from '../../types.js';
import type { WorkflowContextInterface, WorkflowEventEmitterInterface } from '../context.js';
import type { WorkflowResult } from '../workflow-types.js';
import type { WorkflowDefinition } from '../workflow-types.js';

/**
 * 入力内容から影響分析が必要かを判定
 */
function shouldTriggerAnalysis(content: string): boolean {
  // キーワードベースの簡易判定
  const keywords = ['エラー', 'error', '失敗', 'failed', '問題', 'issue', 'バグ', 'bug'];
  const lowerContent = content.toLowerCase();
  return keywords.some((keyword) => lowerContent.includes(keyword.toLowerCase()));
}

/**
 * Stateを更新
 */
function updateState(currentState: string, input: any, pondEntryId: string): string {
  const timestamp = new Date().toISOString();
  const addition = `
## 最新の入力処理 (${timestamp})
- Input ID: ${input.id}
- Source: ${input.source}
- Pond Entry ID: ${pondEntryId}
- Content preview: ${input.content.substring(0, 100)}...
`;
  return currentState + addition;
}

/**
 * エラーメッセージから深刻度を判定
 */
function determineSeverity(analysisResult: string): 'low' | 'medium' | 'high' | 'critical' {
  const lowerResult = analysisResult.toLowerCase();
  if (lowerResult.includes('critical') || lowerResult.includes('致命的')) {
    return 'critical';
  }
  if (lowerResult.includes('high') || lowerResult.includes('重大')) {
    return 'high';
  }
  if (lowerResult.includes('medium') || lowerResult.includes('中程度')) {
    return 'medium';
  }
  return 'low';
}

/**
 * エラーメッセージを抽出
 */
function extractErrorMessage(analysisResult: string): string {
  // 最初の100文字を返す
  return analysisResult.substring(0, 100);
}

/**
 * Issue作成が必要か判定
 */
function shouldCreateIssue(analysisResult: string, content: string): boolean {
  const lowerResult = analysisResult.toLowerCase();
  const lowerContent = content.toLowerCase();
  
  return (
    lowerResult.includes('問題') ||
    lowerResult.includes('issue') ||
    lowerResult.includes('対応が必要') ||
    lowerContent.includes('報告') ||
    lowerContent.includes('report')
  );
}

/**
 * Issueのタイトルを抽出
 */
function extractIssueTitle(content: string): string {
  // 最初の50文字または最初の改行まで
  const firstLine = content.split('\n')[0];
  return firstLine.substring(0, 50) + (firstLine.length > 50 ? '...' : '');
}

/**
 * ラベルを決定
 */
function determineLabels(source: string, analysisResult: string): string[] {
  const labels: string[] = [`source:${source}`];
  
  const lowerResult = analysisResult.toLowerCase();
  if (lowerResult.includes('error') || lowerResult.includes('エラー')) {
    labels.push('error');
  }
  if (lowerResult.includes('performance') || lowerResult.includes('パフォーマンス')) {
    labels.push('performance');
  }
  if (lowerResult.includes('security') || lowerResult.includes('セキュリティ')) {
    labels.push('security');
  }
  
  return labels;
}

/**
 * 優先度を決定
 */
function determinePriority(analysisResult: string): number | undefined {
  const severity = determineSeverity(analysisResult);
  switch (severity) {
    case 'critical': return 90;
    case 'high': return 70;
    case 'medium': return 50;
    case 'low': return 30;
    default: return undefined;
  }
}

/**
 * A-0: INGEST_INPUT ワークフロー実行関数
 * InputデータをPondに取り込み、必要に応じて後続の処理を起動
 */
async function executeIngestInput(
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
): Promise<WorkflowResult> {
  const { storage, createDriver } = context;
  
  // DATA_ARRIVEDイベントのペイロード
  interface DataArrivedPayload {
    source: string;
    content: string;
    format?: string;
    pondEntryId: string;  // すでにPondに保存済み
    metadata?: Record<string, unknown>;
    timestamp: string;
  }
  
  const payload = event.payload as DataArrivedPayload;

  try {
    // 1. すでにPondに保存されているので、そのIDを使用
    const pondEntryId = payload.pondEntryId;
    
    // 2. AIを使ってコンテンツを分析し、関連Issueを特定
    const driver = await createDriver({
      requiredCapabilities: ['fast'],
      preferredCapabilities: ['japanese'],
    });

    // 3. 関連する既存Issueを検索
    const relatedIssues = await storage.searchIssues(payload.content);
    
    const promptModule = {
      instructions: [`
以下のデータを分析し、既存のIssueとの関連性を判定してください。

データソース: ${payload.source}
データ形式: ${payload.format || '不明'}
内容:
${payload.content}

既存のIssue (${relatedIssues.length}件):
${relatedIssues.slice(0, 10).map(issue => 
  `- [${issue.id}] ${issue.title} (status: ${issue.status}, labels: ${issue.labels.join(', ')})`
).join('\n')}

以下を判定してください：
1. 既存Issueとの関連性（どのIssueに情報を追加すべきか）
2. 新規Issueの必要性（既存で対応できない場合）
3. 問題の深刻度・優先度
4. 適用すべきラベル

JSONで以下の形式で応答してください：
{
  "relatedIssueIds": ["既存IssueのID"],
  "needsNewIssue": boolean,
  "newIssueTitle": "新規Issueが必要な場合のタイトル",
  "severity": "low|medium|high|critical",
  "updateContent": "既存Issueに追加する情報",
  "labels": ["適用すべきラベル"]
}
`],
      output: {
        schema: {
          type: 'object',
          properties: {
            relatedIssueIds: {
              type: 'array',
              items: { type: 'string' }
            },
            needsNewIssue: { type: 'boolean' },
            newIssueTitle: { type: 'string' },
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low']
            },
            updateContent: { type: 'string' },
            labels: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['relatedIssueIds', 'needsNewIssue', 'severity', 'labels']
        }
      }
    };

    const { compile } = await import('@moduler-prompt/core');
    const compiledPrompt = compile(promptModule);
    const result = await driver.query(compiledPrompt, { temperature: 0.3 });

    // 構造化出力またはJSON形式で解析
    let analysisResult;
    if (result.structuredOutput) {
      analysisResult = result.structuredOutput;
    } else {
      try {
        analysisResult = JSON.parse(result.content);
      } catch {
        // JSON解析に失敗した場合はテキストとして扱う
        analysisResult = {
          relatedIssueIds: [],
          needsNewIssue: true,
          newIssueTitle: extractIssueTitle(payload.content),
          severity: 'medium',
          updateContent: result.content,
          labels: determineLabels(payload.source, result.content),
        };
      }
    }

    const createdIssueIds: string[] = [];
    const updatedIssueIds: string[] = [];

    // 4. 既存Issueの更新
    if (analysisResult.relatedIssueIds && analysisResult.relatedIssueIds.length > 0) {
      for (const issueId of analysisResult.relatedIssueIds) {
        const issue = await storage.getIssue(issueId);
        if (issue) {
          const update: IssueUpdate = {
            timestamp: new Date(),
            content: analysisResult.updateContent || `関連データ受信:\n${payload.content.substring(0, 500)}`,
            author: 'system' as const,
            metadata: {
              source: payload.source,
              pondEntryId: pondEntryId,
            },
          };
          
          await storage.updateIssue(issueId, {
            updates: [...issue.updates, update],
            sourceInputIds: [...(issue.sourceInputIds || []), pondEntryId],
            // 優先度の更新が必要な場合
            ...(analysisResult.severity === 'critical' && (!issue.priority || issue.priority < 90) 
              ? { priority: 90 } 
              : {}),
          });
          
          updatedIssueIds.push(issueId);
          
          // Issue更新イベントを発行
          emitter.emit({
            type: 'ISSUE_UPDATED',
            payload: {
              issueId: issueId,
              updates: {
                before: { priority: issue.priority },
                after: { priority: analysisResult.severity === 'critical' ? 90 : issue.priority },
                changedFields: ['updates', 'sourceInputIds'],
              },
              updatedBy: 'IngestInput',
            },
          });
        }
      }
    }

    // 5. 新規Issue作成（必要な場合）
    if (analysisResult.needsNewIssue && (!analysisResult.relatedIssueIds || analysisResult.relatedIssueIds.length === 0)) {
      const issueId = `issue-${Date.now()}`;
      const newIssue = {
        id: issueId,
        title: analysisResult.newIssueTitle || extractIssueTitle(payload.content),
        description: payload.content,
        status: 'open' as const,
        labels: analysisResult.labels || determineLabels(payload.source, payload.content),
        priority: determinePriority(analysisResult.severity || 'medium'),
        sourceInputIds: [pondEntryId],
        createdAt: new Date(),
        updatedAt: new Date(),
        updates: [],
        relations: [],
      };
      
      const createdIssue = await storage.createIssue(newIssue);
      createdIssueIds.push(createdIssue.id);
      
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
    }

    // 6. エラー検出（深刻度が高い場合）
    if (analysisResult.severity === 'critical' || analysisResult.severity === 'high') {
      emitter.emit({
        type: 'ERROR_DETECTED',
        payload: {
          errorType: 'application',
          severity: analysisResult.severity,
          message: analysisResult.updateContent || payload.content.substring(0, 200),
          affectedComponent: payload.source,
          sourceData: {
            pondEntryId: pondEntryId,
            issueId: createdIssueIds[0] || updatedIssueIds[0],
          },
        },
      });
    }

    // 7. State更新
    const timestamp = new Date().toISOString();
    const updatedState = context.state + `
## データ取り込み処理 (${timestamp})
- Source: ${payload.source}
- Pond Entry ID: ${pondEntryId}
- Related Issues Found: ${relatedIssues.length}
- Issues Updated: ${updatedIssueIds.join(', ') || 'None'}
- Issues Created: ${createdIssueIds.join(', ') || 'None'}
- Severity: ${analysisResult.severity || 'N/A'}
`;

    return {
      success: true,
      context: {
        ...context,
        state: updatedState,
      },
      output: {
        pondEntryId: pondEntryId,
        analyzedContent: true,
        updatedIssueIds,
        createdIssueIds,
        severity: analysisResult.severity,
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
 * INGEST_INPUT ワークフロー定義
 */
export const ingestInputWorkflow: WorkflowDefinition = {
  name: 'IngestInput',
  description: '外部データの到着を処理し、エラー検出やIssue作成を行う',
  triggers: {
    eventTypes: ['DATA_ARRIVED'],
    priority: 40,
  },
  executor: executeIngestInput,
};;
