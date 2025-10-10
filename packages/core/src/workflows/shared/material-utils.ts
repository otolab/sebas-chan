/**
 * MaterialElement変換ユーティリティ
 *
 * WorkflowのmaterialsセクションでIssue、Flow、Knowledgeなどの
 * エンティティをMaterialElement型に変換するための標準化されたユーティリティ
 */

import type { Issue, Flow, Knowledge } from '@sebas-chan/shared-types';
import type { ExtendedIssue, ExtendedFlow, ExtendedKnowledge } from '../extended-types.js';

/** MaterialElement型（ModulerPrompt仕様） */
export interface MaterialElement {
  type: 'material';
  id: string;
  title: string;
  content: string;
}

/**
 * IssueをMaterialElementに変換
 */
export function issueToMaterial(issue: Issue | ExtendedIssue): MaterialElement {
  const extIssue = issue as ExtendedIssue;
  const content = [
    `ID: ${issue.id}`,
    `説明: ${issue.description}`,
    `優先度: ${issue.priority}`,
    `ステータス: ${issue.status}`,
    `作成日: ${issue.createdAt}`,
    issue.updatedAt ? `更新日: ${issue.updatedAt}` : '',
    issue.labels?.length > 0 ? `ラベル: ${issue.labels.join(', ')}` : '',
    extIssue.source ? `ソース: ${extIssue.source}` : '',
    extIssue.flowIds && extIssue.flowIds.length > 0
      ? `所属Flow: ${extIssue.flowIds.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    type: 'material' as const,
    id: `issue-${issue.id}`,
    title: `Issue: ${issue.title}`,
    content,
  };
}

/**
 * FlowをMaterialElementに変換
 */
export function flowToMaterial(flow: Flow | ExtendedFlow): MaterialElement {
  const extFlow = flow as ExtendedFlow;
  const content = [
    `ID: ${flow.id}`,
    extFlow.perspective ? `観点タイプ: ${extFlow.perspective.type}` : '',
    extFlow.perspective ? `観点説明: ${extFlow.perspective.description}` : '',
    extFlow.relationships ? `関係性: ${extFlow.relationships}` : '',
    extFlow.completionCriteria ? `完了条件: ${extFlow.completionCriteria}` : '',
    `優先度スコア: ${flow.priorityScore || 0}`,
    extFlow.urgencyLevel ? `緊急度: ${extFlow.urgencyLevel}` : '',
    `Issue数: ${flow.issueIds.length}`,
    flow.issueIds.length > 0 ? `Issue一覧: ${flow.issueIds.join(', ')}` : '',
    extFlow.health ? `健全性: ${extFlow.health}` : '',
    extFlow.deadline ? `締切: ${extFlow.deadline}` : '',
    extFlow.recommendedTimeSlot ? `推奨時間帯: ${extFlow.recommendedTimeSlot}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    type: 'material' as const,
    id: `flow-${flow.id}`,
    title: `Flow: ${flow.title}`,
    content,
  };
}

/**
 * KnowledgeをMaterialElementに変換
 */
export function knowledgeToMaterial(knowledge: Knowledge | ExtendedKnowledge): MaterialElement {
  const extKnowledge = knowledge as ExtendedKnowledge;
  const content = [
    `ID: ${knowledge.id}`,
    `タイプ: ${knowledge.type}`,
    `内容: ${knowledge.content}`,
    extKnowledge.summary ? `要約: ${extKnowledge.summary}` : '',
    extKnowledge.confidence !== undefined ? `信頼度: ${extKnowledge.confidence}` : '',
    knowledge.sources?.length > 0
      ? `ソース: ${knowledge.sources
          .map((s) =>
            typeof s === 'object' && 'type' in s
              ? s.type === 'issue'
                ? `issue:${s.issueId}`
                : s.type === 'pond'
                  ? `pond:${s.pondEntryId}`
                  : s.type === 'knowledge'
                    ? `knowledge:${s.knowledgeId}`
                    : s.type === 'user_direct'
                      ? 'user_direct'
                      : 'unknown'
              : 'unknown'
          )
          .join(', ')}`
      : '',
    extKnowledge.tags && extKnowledge.tags.length > 0
      ? `タグ: ${extKnowledge.tags.join(', ')}`
      : '',
    extKnowledge.metadata ? `メタデータ: ${JSON.stringify(extKnowledge.metadata)}` : '',
    `作成日: ${knowledge.createdAt}`,
  ]
    .filter(Boolean)
    .join('\n');

  const title = extKnowledge.title || `Knowledge: ${knowledge.type}`;

  return {
    type: 'material' as const,
    id: `knowledge-${knowledge.id}`,
    title,
    content,
  };
}

/**
 * 複数のIssueをMaterialElement配列に変換
 */
export function issuesToMaterials(issues: Issue[]): MaterialElement[] {
  return issues.map(issueToMaterial);
}

/**
 * 複数のFlowをMaterialElement配列に変換
 */
export function flowsToMaterials(flows: Flow[]): MaterialElement[] {
  return flows.map(flowToMaterial);
}

/**
 * 複数のKnowledgeをMaterialElement配列に変換
 */
export function knowledgesToMaterials(knowledges: Knowledge[]): MaterialElement[] {
  return knowledges.map(knowledgeToMaterial);
}

/**
 * カスタムフィールドを含むIssueをMaterialElementに変換
 * @param additionalFields 追加で含めたいフィールドの定義
 */
export function issueToMaterialWithFields(
  issue: Issue & Record<string, any>,
  additionalFields?: { [key: string]: string }
): MaterialElement {
  const baseContent = [
    `ID: ${issue.id}`,
    `説明: ${issue.description}`,
    `優先度: ${issue.priority}`,
    `ステータス: ${issue.status}`,
    `作成日: ${issue.createdAt}`,
    issue.updatedAt ? `更新日: ${issue.updatedAt}` : '',
    issue.labels?.length > 0 ? `ラベル: ${issue.labels.join(', ')}` : '',
  ];

  // 追加フィールドを含める
  if (additionalFields) {
    for (const [key, label] of Object.entries(additionalFields)) {
      if (issue[key] !== undefined && issue[key] !== null) {
        const value = Array.isArray(issue[key]) ? issue[key].join(', ') : String(issue[key]);
        baseContent.push(`${label}: ${value}`);
      }
    }
  }

  return {
    type: 'material' as const,
    id: `issue-${issue.id}`,
    title: `Issue: ${issue.title}`,
    content: baseContent.filter(Boolean).join('\n'),
  };
}

/**
 * 関連性を含むFlowAnalysis型をMaterialElementに変換
 */
export interface FlowAnalysis {
  flow: Flow | ExtendedFlow;
  issues: Issue[];
  completionRate?: number;
  staleness?: number;
  perspectiveRelevance?: number;
}

export function flowAnalysisToMaterial(analysis: FlowAnalysis): MaterialElement {
  const extFlow = analysis.flow as ExtendedFlow;
  const content = [
    `Flow ID: ${analysis.flow.id}`,
    `タイトル: ${analysis.flow.title}`,
    extFlow.perspective ? `観点タイプ: ${extFlow.perspective.type}` : '',
    extFlow.perspective ? `観点説明: ${extFlow.perspective.description}` : '',
    extFlow.relationships ? `関係性記述: ${extFlow.relationships}` : '',
    analysis.completionRate !== undefined ? `完了率: ${analysis.completionRate}%` : '',
    analysis.staleness !== undefined ? `停滞期間: ${analysis.staleness}日` : '',
    analysis.perspectiveRelevance !== undefined
      ? `観点妥当性スコア: ${analysis.perspectiveRelevance}`
      : '',
    `所属Issue数: ${analysis.issues.length}`,
    '',
    '所属Issue一覧:',
    ...analysis.issues.map((i) => `  - ${i.id}: ${i.title} (${i.status})`),
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n');

  return {
    type: 'material' as const,
    id: `flow-analysis-${analysis.flow.id}`,
    title: `Flow分析: ${analysis.flow.title}`,
    content,
  };
}
