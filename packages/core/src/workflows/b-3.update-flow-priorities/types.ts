/**
 * B-3: UPDATE_FLOW_PRIORITIES 型定義
 *
 * 循環参照を避けるため、共通の型定義を独立したファイルに配置
 */

/**
 * 優先度更新の結果
 */
export interface FlowPriorityUpdate {
  flowId: string;
  oldPriority: number;
  newPriority: number;
  explanation: {
    mainFactor: string; // 最も影響した要因
    reasoning: string; // 判断の理由（自然言語）
    contextNotes?: string; // コンテキストからの特記事項
  };
  userQuery?: {
    type: 'confirm_stale' | 'confirm_priority' | 'clarify_context';
    message: string;
    options?: string[];
  };
}

/**
 * 優先度判定のAI応答
 */
export interface PriorityCalculationResult {
  updates: Array<{
    flowId: string;
    newPriority: number;
    mainFactor: string;
    reasoning: string;
    contextNotes?: string;
    userQuery?: {
      type: string;
      message: string;
      options?: string[];
    };
  }>;
  overallAssessment: {
    confidence: number;
    contextQuality: 'good' | 'partial' | 'poor';
    suggestedFocus?: string;
    stateUpdate?: string;
  };
}

/**
 * 個別Flow分析の結果
 */
export interface IndividualFlowAnalysis {
  flowId: string;
  absoluteImportance: number; // 0.0-1.0: 絶対的な重要度
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  stalenessImpact: string; // 停滞の影響評価
  keyFactors: string[]; // 判断の主要因
  needsUserAttention: boolean;
  analysisConfidence: number;
}
