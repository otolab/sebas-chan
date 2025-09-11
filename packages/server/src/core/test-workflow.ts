/**
 * Test Workflow - 生成AIを使わない確定的なテスト用ワークフロー
 *
 * このワークフローは、入力に対して確定的な出力を返すことで、
 * システムの動作を検証可能にします。
 */

import { Event } from './engine';
import { StateManager } from './state-manager';
import { Issue, Flow, Knowledge } from '@sebas-chan/shared-types';

/**
 * TestWorkflow - テスト用の確定的なワークフロー
 *
 * このクラスはテスト目的のためにデータをローカルに保持します。
 * 本番環境ではDBパッケージを使用してデータを永続化します。
 * StateManagerは本来の仕様通り、State文書（自然言語テキスト）のみを管理します。
 */
export class TestWorkflow {
  // テスト用のローカルデータストレージ
  // 本番ではDBパッケージがこの役割を担う
  private testData: {
    issues: Issue[];
    flows: Flow[];
    knowledge: Knowledge[];
  } = {
    issues: [],
    flows: [],
    knowledge: [],
  };

  constructor(private stateManager: StateManager) {}

  /**
   * テスト用: ユーザーリクエスト処理
   * 確定的なレスポンスを返す
   */
  async processUserRequest(event: Event): Promise<void> {
    const { request } = event.payload as { request: string };

    // テスト用の確定的な処理
    if (request.includes('test')) {
      // テスト用Issueを作成
      const issue: Issue = {
        id: `test-issue-${Date.now()}`,
        title: 'Test Issue',
        description: `Created from request: ${request}`,
        status: 'open',
        labels: ['test', 'auto-generated'],
        updates: [],
        relations: [],
        sourceInputIds: [],
      };

      // テストデータに保存
      this.testData.issues.push(issue);

      // State文書にも記録
      const currentState = this.stateManager.getState();
      const updatedState = `${currentState}\n- Created test issue: ${issue.id}`;
      this.stateManager.updateState(updatedState);

      // テスト用のログ
      console.log('[TestWorkflow] Created test issue:', issue.id);
    }
  }

  /**
   * テスト用: Input取り込み
   * 確定的にIssueを生成
   */
  async ingestInput(event: Event): Promise<void> {
    const { input } = event.payload as { input: { id: string; content: string; source?: string } };

    // キーワードベースの確定的な分類
    const labels: string[] = [];
    if (input.content.includes('bug')) labels.push('bug');
    if (input.content.includes('feature')) labels.push('feature');
    if (input.content.includes('urgent')) labels.push('urgent');

    const issue: Issue = {
      id: `issue-${input.id}`,
      title: `Issue from ${input.source || 'unknown'}`,
      description: input.content,
      status: 'open',
      labels,
      updates: [],
      relations: [],
      sourceInputIds: [input.id],
    };

    // テストデータに保存
    this.testData.issues.push(issue);

    // State文書にも記録
    const currentState = this.stateManager.getState();
    const updatedState = `${currentState}\n- Ingested input as issue: ${issue.id}`;
    this.stateManager.updateState(updatedState);

    console.log('[TestWorkflow] Ingested input as issue:', issue.id);
  }

  /**
   * テスト用: Issue影響分析
   * 確定的なFlow更新
   */
  async analyzeIssueImpact(event: Event): Promise<void> {
    const { issueId } = event.payload as { issueId: string };

    const issues = this.testData.issues;
    const issue = issues.find((i: Issue) => i.id === issueId);

    if (!issue) {
      console.warn('[TestWorkflow] Issue not found:', issueId);
      return;
    }

    // 確定的なFlowマッピング
    let flowStatus: Flow['status'] = 'active';
    let priorityScore = 0.5;

    if (issue.labels.includes('urgent')) {
      flowStatus = 'focused';
      priorityScore = 0.9;
    } else if (issue.labels.includes('bug')) {
      flowStatus = 'active';
      priorityScore = 0.7;
    } else if (issue.labels.includes('feature')) {
      flowStatus = 'backlog';
      priorityScore = 0.3;
    }

    const flow: Flow = {
      id: `flow-${issueId}`,
      title: issue.title,
      description: `Flow for ${issue.title}`,
      status: flowStatus,
      priorityScore,
      issueIds: [issueId],
    };

    // テストデータに保存
    const existing = this.testData.flows.findIndex((f: Flow) => f.id === flow.id);
    if (existing >= 0) {
      this.testData.flows[existing] = flow;
    } else {
      this.testData.flows.push(flow);
    }

    // State文書にも記録
    const currentState = this.stateManager.getState();
    const updatedState = `${currentState}\n- Created flow: ${flow.id} with priority ${flow.priorityScore}`;
    this.stateManager.updateState(updatedState);

    console.log('[TestWorkflow] Analyzed issue impact, created flow:', flow.id);
  }

  /**
   * テスト用: Knowledge抽出
   * 確定的なKnowledge生成
   */
  async extractKnowledge(event: Event): Promise<void> {
    const { issueId } = event.payload as { issueId: string };

    const issues = this.testData.issues;
    const issue = issues.find((i: Issue) => i.id === issueId);

    if (!issue) {
      console.warn('[TestWorkflow] Issue not found for knowledge extraction:', issueId);
      return;
    }

    // 確定的なKnowledge生成ルール
    const knowledgeItems: Knowledge[] = [];

    // バグからは「問題」タイプのKnowledge
    if (issue.labels.includes('bug')) {
      knowledgeItems.push({
        id: `knowledge-problem-${issueId}`,
        type: 'factoid' as const,
        content: `Problem identified: ${issue.description}`,
        reputation: { upvotes: 0, downvotes: 0 },
        sources: [{ type: 'issue', issueId }],
      });
    }

    // 解決済みからは「解決策」タイプのKnowledge
    if (issue.status === 'closed') {
      knowledgeItems.push({
        id: `knowledge-solution-${issueId}`,
        type: 'factoid' as const,
        content: `Solution for: ${issue.title}`,
        reputation: { upvotes: 1, downvotes: 0 },
        sources: [{ type: 'issue', issueId }],
      });
    }

    // 一般的な情報は「factoid」として保存
    if (knowledgeItems.length === 0) {
      knowledgeItems.push({
        id: `knowledge-fact-${issueId}`,
        type: 'factoid',
        content: issue.description.substring(0, 200),
        reputation: { upvotes: 0, downvotes: 0 },
        sources: [{ type: 'issue', issueId }],
      });
    }

    // テストデータに保存
    this.testData.knowledge.push(...knowledgeItems);

    // State文書にも記録
    const currentState = this.stateManager.getState();
    const updatedState = `${currentState}\n- Extracted ${knowledgeItems.length} knowledge items from issue ${issueId}`;
    this.stateManager.updateState(updatedState);

    console.log('[TestWorkflow] Extracted knowledge items:', knowledgeItems.length);
  }

  /**
   * テスト用: Issue関連付け
   * 確定的な関連性判定
   */
  async clusterIssues(_event: Event): Promise<void> {
    const issues = this.testData.issues;

    // 同じラベルを持つIssueをクラスタリング
    const clusters = new Map<string, Issue[]>();

    for (const issue of issues) {
      for (const label of issue.labels) {
        if (!clusters.has(label)) {
          clusters.set(label, []);
        }
        clusters.get(label)!.push(issue);
      }
    }

    // 関連性を設定
    for (const clusterIssues of clusters.values()) {
      if (clusterIssues.length > 1) {
        for (let i = 0; i < clusterIssues.length; i++) {
          for (let j = i + 1; j < clusterIssues.length; j++) {
            const issue1 = clusterIssues[i];
            const issue2 = clusterIssues[j];

            // 相互に関連付け
            if (!issue1.relations.some((r) => r.targetIssueId === issue2.id)) {
              issue1.relations.push({
                type: 'relates_to' as const,
                targetIssueId: issue2.id,
              });
            }

            if (!issue2.relations.some((r) => r.targetIssueId === issue1.id)) {
              issue2.relations.push({
                type: 'relates_to' as const,
                targetIssueId: issue1.id,
              });
            }
          }
        }
      }
    }

    // テストデータは既に更新済み
    // State文書にクラスタリング結果を記録
    const currentState = this.stateManager.getState();
    const updatedState = `${currentState}\n- Clustered ${issues.length} issues into ${clusters.size} groups`;
    this.stateManager.updateState(updatedState);
    console.log('[TestWorkflow] Clustered issues by labels');
  }

  /**
   * テスト用ワークフローのエントリーポイント
   */
  async processEvent(event: Event): Promise<void> {
    console.log('[TestWorkflow] Processing event:', event.type);

    switch (event.type) {
      case 'PROCESS_USER_REQUEST':
        await this.processUserRequest(event);
        break;

      case 'INGEST_INPUT':
        await this.ingestInput(event);
        break;

      case 'ANALYZE_ISSUE_IMPACT':
        await this.analyzeIssueImpact(event);
        break;

      case 'EXTRACT_KNOWLEDGE':
        await this.extractKnowledge(event);
        break;

      case 'CLUSTER_ISSUES':
        await this.clusterIssues(event);
        break;

      default:
        console.log('[TestWorkflow] Unknown event type:', event.type);
    }
  }
}

export default TestWorkflow;
