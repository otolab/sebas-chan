# B-3, B-4 実装仕様書

## 前提：人とAIの協調システム

sebas-chanは人だけでもAIだけでも存在し得ないシステムです。

- **ユーザー**: 「忘れるため」にシステムに依存
- **システム**: 「忘れ去られないため」に活動
- **緊張関係**: 両者の目的は異なるが、そのために協調が必要

この前提に基づいて、B-3とB-4を実装します。

## B-3: UPDATE_FLOW_PRIORITIES 実装仕様

### 設計原則

#### 避けるべき失敗

1. **重要なことを見逃す** - 致命的な信頼の失墜
2. **多すぎて埋もれる** - システムの価値の喪失

この2つは矛盾しており、本質的に「正解」は存在しません。

#### 信頼を得るための戦略

1. **システムは忘れない**: 必要なことを確実に思い出させる
2. **勝手に完了しない**: ユーザーの確認なしに事項を閉じない
3. **嘘をつかない**: おもねって都合の良い情報だけを提示しない
4. **コンテキストを理解する**: state文書を活用した柔軟な判断

### 実装詳細

```typescript
interface UpdateFlowPrioritiesInput {
  trigger: 'scheduled' | 'status_change' | 'manual';
  targetFlowIds?: string[]; // 指定しない場合は全Flow
}

interface PriorityContext {
  // コンテキスト情報（state文書から抽出）
  currentFocus?: string;      // 現在のユーザーの焦点
  recentActivity?: string[];  // 最近の活動履歴
  explicitPriorities?: Map<string, number>; // ユーザー明示の優先度
}
```

#### 優先度計算アルゴリズム

```typescript
// 基本的な優先度要因
interface PriorityFactors {
  urgency: number;     // 0-1: 期限・ブロッカー
  importance: number;  // 0-1: 含まれるIssueの重要度
  staleness: number;   // 0-1: 更新からの経過時間
  momentum: number;    // 0-1: 最近の活動頻度

  // コンテキスト要因（state文書から）
  contextRelevance: number; // 0-1: 現在のコンテキストとの関連性
}

// 停滞チェック（ユーザーへの確認用）
interface StalenessCheck {
  flowId: string;
  daysSinceUpdate: number;
  status: 'active_check' | 'warning' | 'stale' | 'abandoned';
  thresholds: {
    activeCheck: 1,  // 1日 - 生存確認
    warning: 3,      // 3日 - 注意喚起
    stale: 7,        // 7日 - 停滞判定
    abandoned: 14    // 14日 - 放置可能性
  };
  // システムは判定のみ、アクションはユーザーが決定
  suggestedAction?: 'continue' | 'pause' | 'close' | 'escalate';
}
```

#### 出力と説明責任

```typescript
interface UpdateFlowPrioritiesOutput {
  updates: Array<{
    flowId: string;
    oldPriority: number;
    newPriority: number;

    // 透明性のための説明
    explanation: {
      mainFactor: string;        // 最も影響した要因
      factors: PriorityFactors;  // 全要因の値
      contextNotes?: string;     // コンテキストからの判断メモ
    };

    // ユーザーへの問いかけ（必要時）
    userQuery?: {
      type: 'confirm_stale' | 'confirm_priority' | 'clarify_context';
      message: string;
      options: string[];
    };
  }>;

  // システムの自己評価
  confidence: number; // 0-1: この判断の確信度
  contextQuality: 'good' | 'partial' | 'poor'; // コンテキスト理解の品質
}
```

### state文書の活用

state文書は曖昧な入力を許容し、Flow優先度判断の柔軟性を提供します：

```typescript
// state文書から抽出する情報例
interface StateContext {
  // 明示的な記述
  "今週の重点": string;
  "締切": Date[];

  // 暗黙的な情報
  mentionedFlows: string[];      // 言及されたFlow
  emotionalTone: string;          // 焦り、余裕など
  impliedPriorities: string[];    // 文脈から推測される優先事項
}
```

## B-4: SALVAGE_FROM_POND 実装仕様

### 設計原則

#### 観点ベースの探索

処理済み管理はせず、「観点」を通じて繰り返し探索します：

1. **Flowからの観点**: 生きているFlowをキーとして検索
2. **定型の観点**: 定期的なパターン（月次報告など）
3. **サンプリングによる観点**: ランダムに選んだ情報から類似を探索

#### 効率度外視の探索

「暇な時にやる作業」として、セレンディピティを重視：
- 同じ情報を異なる観点で何度も見る
- 時間経過で価値が変わることを前提
- 偶然の発見を促進

### 実装詳細

```typescript
interface SalvageFromPondInput {
  trigger: 'scheduled' | 'manual' | 'idle';

  // 観点の生成方法
  perspectiveStrategy: {
    fromFlows: boolean;      // Flowベースの観点
    fromPatterns: boolean;   // 定型パターンの観点
    fromSampling: boolean;   // サンプリングの観点
  };

  // サンプリング設定（効率度外視）
  sampling: {
    method: 'random' | 'temporal_spread' | 'source_diversity';
    size: number; // デフォルト: 100件程度
  };
}
```

#### 観点の生成

```typescript
// 1. Flowからの観点
interface FlowPerspective {
  type: 'flow_based';
  flowId: string;
  flowTitle: string;
  searchQuery: string;  // Flowのdescriptionから生成

  // 例: "11月の予定"というFlowがあれば、
  // "11月", "予定", "November"などをキーにPondを検索
}

// 2. 定型の観点
interface PatternPerspective {
  type: 'pattern_based';
  patternName: string;  // "月次振り返り", "週次レポート"など
  temporalRange: { start: Date; end: Date };
  expectedKeywords: string[];
}

// 3. サンプリングによる観点
interface SamplingPerspective {
  type: 'sampling_based';
  seedEntryId: string;  // 起点となるPondEntry
  similarityThreshold: number;

  // ランダムに選んだエントリから、
  // 類似するものをベクトル検索で探索
}
```

#### 価値判定と知識化

```typescript
interface SalvageEvaluation {
  perspective: FlowPerspective | PatternPerspective | SamplingPerspective;
  findings: Array<{
    pondEntryIds: string[];
    pattern: 'recurring' | 'forgotten' | 'anomaly' | 'insight';

    // 生きているIssue/Flowとの関連
    relatedToLiving: {
      issues: string[];
      flows: string[];
    };

    // 価値判定（AIによる）
    value: {
      score: number;  // 0-1
      reason: string;
      confidence: number;
    };

    // 提案アクション
    suggestedAction: {
      type: 'create_knowledge' | 'update_issue' | 'notify_user' | 'ignore';

      // Knowledge化の場合（curated_summaryとして）
      knowledgeProposal?: {
        title: string;
        content: string;
        type: 'curated_summary'; // 基本的にこれを使用
        tags: string[];
      };
    };
  }>;
}
```

#### サルベージレシピ（将来実装）

ユーザー定義の探索手順：

```typescript
// Knowledgeとして保存される探索手順
interface SalvageRecipe {
  type: 'system_rule';  // Knowledgeの一種
  title: string;        // "月末の振り返り手順"

  content: string;      // 自然言語での手順記述
  // 例: "毎月末に、その月のSlackメッセージから
  //      プロジェクトの進捗に関する言及を抽出し、
  //      月次サマリーとしてまとめる"

  // 実行ヒント（構造化データ）
  hints?: {
    keywords: string[];
    sources: string[];
    frequency: string;
  };
}
```

### 処理フロー

```typescript
async function salvageFromPond(input: SalvageFromPondInput): Promise<SalvageOutput> {
  // 1. 観点の生成
  const perspectives = await generatePerspectives(input);

  // 2. 各観点での探索（並列実行可能）
  const evaluations = await Promise.all(
    perspectives.map(perspective =>
      explorePondWithPerspective(perspective)
    )
  );

  // 3. 価値のあるものをKnowledge化
  const createdKnowledge = [];
  for (const eval of evaluations) {
    for (const finding of eval.findings) {
      if (finding.suggestedAction.type === 'create_knowledge') {
        const knowledge = await createKnowledge(
          finding.suggestedAction.knowledgeProposal
        );
        createdKnowledge.push(knowledge);
      }
    }
  }

  return {
    perspectives: perspectives.length,
    findings: evaluations.flatMap(e => e.findings).length,
    createdKnowledge,

    // 次回の探索のヒント
    nextSuggestions: generateNextSuggestions(evaluations)
  };
}
```

## 実装の優先順位

### Phase 1: MVP実装

#### B-3: 基本的な優先度調整
- state文書からのコンテキスト抽出（簡易版）
- 4要因での優先度計算
- 停滞チェックとユーザーへの確認

#### B-4: 観点ベースサルベージ
- Flowからの観点生成
- サンプリング探索（ランダム100件）
- curated_summaryとしてのKnowledge作成

### Phase 2: 改善

#### B-3: コンテキスト理解の深化
- state文書の高度な解析
- ユーザーフィードバックの学習
- 説明の詳細化

#### B-4: 探索手法の拡充
- 定型パターンの実装
- 時系列を考慮した探索
- サルベージレシピの実装

### Phase 3: 最適化

- 両ワークフローの連携強化
- パフォーマンス最適化
- ユーザーインタラクションの洗練

## テスト戦略

### B-3のテスト

```typescript
describe('UpdateFlowPriorities', () => {
  it('重要なFlowを見逃さない', () => {
    // 高優先度Issueを含むFlowが上位になること
  });

  it('停滞しているFlowを検出する', () => {
    // 更新日時に基づく停滞判定
  });

  it('コンテキストを考慮した判定', () => {
    // state文書の内容が優先度に反映されること
  });
});
```

### B-4のテスト

```typescript
describe('SalvageFromPond', () => {
  it('Flowベースの観点で検索できる', () => {
    // 生きているFlowをキーにPondを検索
  });

  it('サンプリングで偶然の発見ができる', () => {
    // ランダムサンプルから類似を発見
  });

  it('同じ情報を異なる観点で再評価する', () => {
    // 処理済みフラグに関係なく探索
  });
});
```

---

**作成日**: 2025-10-13
**Issue**: #44