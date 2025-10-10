/**
 * MaterialElement変換ユーティリティ
 *
 * WorkflowのmaterialsセクションでIssue、Flow、Knowledgeなどの
 * エンティティをMaterialElement型に変換するための標準化されたユーティリティ
 */

import type { Issue, Flow, Knowledge } from '@sebas-chan/shared-types';

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
export function issueToMaterial(issue: Issue): MaterialElement {
  const content = [
    `ID: ${issue.id}`,
    `説明: ${issue.description}`,
    `優先度: ${issue.priority}`,
    `ステータス: ${issue.status}`,
    `作成日: ${issue.createdAt}`,
    issue.updatedAt ? `更新日: ${issue.updatedAt}` : '',
    issue.labels?.length > 0 ? `ラベル: ${issue.labels.join(', ')}` : '',
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
export function flowToMaterial(flow: Flow): MaterialElement {
  const content = [
    `ID: ${flow.id}`,
    `説明: ${flow.description}`,
    `ステータス: ${flow.status}`,
    `優先度スコア: ${flow.priorityScore || 0}`,
    `Issue数: ${flow.issueIds.length}`,
    flow.issueIds.length > 0 ? `Issue一覧: ${flow.issueIds.join(', ')}` : '',
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
export function knowledgeToMaterial(knowledge: Knowledge): MaterialElement {
  const content = [
    `ID: ${knowledge.id}`,
    `タイプ: ${knowledge.type}`,
    `内容: ${knowledge.content}`,
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
    `作成日: ${knowledge.createdAt}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    type: 'material' as const,
    id: `knowledge-${knowledge.id}`,
    title: `Knowledge: ${knowledge.type}`,
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
  issue: Issue & Record<string, unknown>,
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
  flow: Flow;
  issues: Issue[];
  completionRate?: number;
  staleness?: number;
  perspectiveRelevance?: number;
}

export function flowAnalysisToMaterial(analysis: FlowAnalysis): MaterialElement {
  const content = [
    `Flow ID: ${analysis.flow.id}`,
    `タイトル: ${analysis.flow.title}`,
    `説明: ${analysis.flow.description}`,
    `ステータス: ${analysis.flow.status}`,
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
