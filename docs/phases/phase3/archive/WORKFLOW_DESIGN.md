# ワークフロー詳細設計

## 設計原則

1. **目的の明確化**: 各ワークフローは単一の明確な目的を持つ
2. **入力と出力の定義**: 期待される入力と生成される出力を明示
3. **副作用の管理**: データ変更とイベント発行を明確に定義
4. **エラー処理**: 失敗ケースと回復戦略を定義

## A系: 基本ワークフロー

### A-0: PROCESS_USER_REQUEST（ユーザーリクエスト処理）

#### 目的

ユーザーからの自然言語リクエストを解釈し、適切なアクションに変換する。

#### 入力

```typescript
{
  request: string;        // ユーザーの自然言語リクエスト
  context?: {
    recentIssues: Issue[];  // 最近のIssue（文脈理解用）
    currentFlow?: Flow;     // 現在のFlow
  }
}
```

#### 手順

1. **リクエスト分析**
   - Moduler Promptでリクエストを分析
   - format(schema)で以下の構造を取得：

   ```typescript
   {
     intent: 'create_task' | 'query_info' | 'update_status' | 'schedule' | 'other';
     entities: {
       date?: string;
       time?: string;
       person?: string;
       location?: string;
       task?: string;
     };
     urgency: 'critical' | 'high' | 'normal' | 'low';
     needsFollowUp: boolean;
   }
   ```

2. **Issue作成判断**
   - intent が行動を必要とする場合、新規Issueを作成
   - 既存Issueの更新が必要な場合は更新

3. **イベント発行**
   - 作成/更新されたIssueに対して ISSUE_CREATED/ISSUE_UPDATED を発行
   - needsFollowUp の場合、FOLLOW_UP_REQUIRED を発行

#### 出力

```typescript
{
  processedRequest: {
    originalRequest: string;
    interpretation: InterpretationResult;
    createdIssues: Issue[];
    updatedIssues: Issue[];
  }
}
```

### A-1: INGEST_INPUT（Input取り込み）

#### 目的

外部ソース（Reporter）からのInputを受け取り、Pondに保存し、必要に応じてIssueを生成する。

#### 入力

```typescript
{
  input: {
    source: string;      // 'gmail' | 'slack' | 'calendar' | 'manual'
    content: string;     // 生データ
    metadata: {
      timestamp: Date;
      sender?: string;
      subject?: string;
      [key: string]: any;
    }
  }
}
```

#### 手順

1. **Pondへの永続化**
   - すべてのInputを無条件でPondに保存
   - ベクトル化して検索可能にする

2. **即座の処理判断**
   - Moduler Promptで緊急性を判定
   - format(schema)：

   ```typescript
   {
     requiresImmediate: boolean;
     category: 'action_required' | 'information' | 'noise';
     suggestedPriority: number; // -100 to 100
   }
   ```

3. **Issue生成**
   - requiresImmediate = true の場合、Issueを生成
   - カテゴリと優先度を設定

4. **イベント発行**
   - INPUT_INGESTED を常に発行
   - Issue生成時は ISSUE_CREATED を発行

#### 出力

```typescript
{
  pondEntry: PondEntry;
  createdIssue?: Issue;
  classification: ClassificationResult;
}
```

### A-2: ANALYZE_ISSUE_IMPACT（Issue影響分析）

#### 目的

新規または更新されたIssueの影響範囲を分析し、関連するFlowを更新する。

#### 入力

```typescript
{
  issueId: string;
  trigger: 'created' | 'updated' | 'status_changed';
}
```

#### 手順

1. **関連Issue検索**
   - Pondからベクトル検索で関連情報を取得
   - 既存Issueとの関連性を判定

2. **影響分析**
   - Moduler Promptで影響を分析
   - format(schema)：

   ```typescript
   {
     impactLevel: 'critical' | 'high' | 'medium' | 'low';
     affectedAreas: string[];
     relatedIssues: {
       issueId: string;
       relation: 'blocks' | 'relates_to' | 'duplicates';
       confidence: number;
     }[];
     suggestedFlow: {
       title: string;
       priority: number;
     };
   }
   ```

3. **Flow更新**
   - 既存Flowへの追加 or 新規Flow作成
   - 優先度の再計算

4. **イベント発行**
   - FLOW_UPDATED または FLOW_CREATED
   - 関連Issue更新時は ISSUE_RELATION_UPDATED

#### 出力

```typescript
{
  analysis: ImpactAnalysis;
  updatedFlows: Flow[];
  issueRelations: IssueRelation[];
}
```

### A-3: EXTRACT_KNOWLEDGE（Knowledge抽出）

#### 目的

完了したIssueや蓄積されたデータから再利用可能な知識を抽出する。

#### 入力

```typescript
{
  source: {
    type: 'issue' | 'flow' | 'pond_cluster';
    id: string;
  }
}
```

#### 手順

1. **コンテンツ収集**
   - ソースに関連するすべての情報を収集
   - Issue の場合：説明、更新履歴、解決方法

2. **知識抽出**
   - Moduler Promptで知識を抽出
   - format(schema)：

   ```typescript
   {
     knowledgeItems: {
       type: 'fact' | 'procedure' | 'insight';
       content: string;
       confidence: number;
       tags: string[];
       applicableContexts: string[];
     }[];
     suggestedDocumentation?: string;
   }
   ```

3. **Knowledge保存**
   - 抽出された知識をKnowledgeとして保存
   - 既存Knowledgeとの重複チェック

4. **評価メカニズム**
   - 初期reputation設定
   - 将来の利用でupvote/downvote可能

#### 出力

```typescript
{
  extractedKnowledge: Knowledge[];
  updatedKnowledge: Knowledge[];  // 既存を更新した場合
}
```

## B系: 横断的ワークフロー

### B-1: CLUSTER_ISSUES（Issue群のクラスタリング）

#### 目的

関連するIssueをグループ化し、より大きなパターンや機会を発見する。

#### 入力

```typescript
{
  trigger: 'scheduled' | 'threshold_reached';
  scope?: {
    status?: 'open' | 'all';
    age?: number;  // days
  }
}
```

#### 手順

1. **Issue収集**
   - スコープに基づいてIssueを収集
   - ベクトル化して類似度計算の準備

2. **クラスタリング分析**
   - Moduler Promptでパターンを発見
   - format(schema)：

   ```typescript
   {
     clusters: {
       id: string;
       theme: string;
       issueIds: string[];
       commonPatterns: string[];
       suggestedAction: string;
       mergePotential: boolean;
     }[];
     insights: string[];
   }
   ```

3. **関係性更新**
   - Issue間の関係を更新
   - 必要に応じてメタIssueを作成

#### 出力

```typescript
{
  clusters: IssueCluster[];
  newRelations: IssueRelation[];
  insights: string[];
}
```

### B-2: UPDATE_FLOW_RELATIONS（Flow関係更新）

#### 目的

FlowとIssueの関係性を最新状態に保ち、Flowの妥当性を維持する。

#### 入力

```typescript
{
  flowId?: string;  // 特定Flow or 全Flow
  trigger: 'issue_changed' | 'scheduled';
}
```

#### 手順

1. **現状分析**
   - FlowとそのIssueの現在の状態を確認
   - 完了率、停滞状況を計算

2. **関係性評価**
   - Moduler Promptで関係性を評価
   - format(schema)：

   ```typescript
   {
     flowHealth: 'healthy' | 'needs_attention' | 'stale';
     issueRelevance: {
       issueId: string;
       stillRelevant: boolean;
       reason: string;
     }
     [];
     suggestedChanges: {
       action: 'remove_issue' | 'add_issue' | 'split_flow' | 'merge_flow';
       target: string;
       rationale: string;
     }
     [];
   }
   ```

3. **更新実行**
   - 提案された変更を適用
   - Flowのステータス更新

#### 出力

```typescript
{
  updatedFlows: Flow[];
  changes: FlowChange[];
}
```

### B-3: UPDATE_FLOW_PRIORITIES（Flow優先度更新）

#### 目的

外部要因や進捗に基づいてFlowの優先度を動的に調整する。

#### 入力

```typescript
{
  trigger: 'scheduled' | 'context_changed';
  context?: {
    upcomingDeadlines: Date[];
    userFeedback?: string;
  }
}
```

#### 手順

1. **優先度要因の収集**
   - 締切、依存関係、停滞期間
   - ユーザーの最近の活動パターン

2. **優先度計算**
   - Moduler Promptで優先度を再評価
   - format(schema)：

   ```typescript
   {
     priorityUpdates: {
       flowId: string;
       currentPriority: number;
       suggestedPriority: number;
       factors: {
         factor: string;
         impact: number; // -10 to +10
       }
       [];
     }
     [];
   }
   ```

3. **優先度更新**
   - 計算された優先度を適用
   - 大幅な変更時は理由を記録

#### 出力

```typescript
{
  priorityChanges: PriorityChange[];
  rationale: string[];
}
```

### B-4: SALVAGE_FROM_POND（Pondからのサルベージ）

#### 目的

Pondに蓄積された未整理情報から、時間経過により価値が顕在化した情報を発見する。

#### 入力

```typescript
{
  trigger: 'scheduled'; // 定期実行
  config: {
    ageThreshold: number; // days
    sampleSize: number;
  }
}
```

#### 手順

1. **候補選定**
   - 古いが未処理のPondエントリを抽出
   - ランダムサンプリング or スコアベース

2. **価値評価**
   - 現在のコンテキストで再評価
   - format(schema)：

   ```typescript
   {
     evaluations: {
       pondEntryId: string;
       currentValue: 'high' | 'medium' | 'low' | 'none';
       reason: string;
       suggestedAction: 'create_issue' | 'create_knowledge' | 'discard' | 'keep';
       relatedToRecent: string[];  // 最近のIssue/FlowのID
     }[];
   }
   ```

3. **アクション実行**
   - 価値があるものをIssue or Knowledgeに変換
   - 関連付けを設定

#### 出力

```typescript
{
  salvagedItems: {
    pondEntryId: string;
    convertedTo: 'issue' | 'knowledge' | null;
    newId?: string;
  }[];
}
```

## C系: 提案系ワークフロー

### C-1: SUGGEST_NEXT_FLOW（次のFlow提案）

#### 目的

ユーザーの現在の状況とパターンから、次に取り組むべきFlowを提案する。

#### 入力

```typescript
{
  trigger: 'flow_completed' | 'user_request' | 'morning_routine';
  context: {
    completedFlow?: Flow;
    timeOfDay: string;
    userState?: string;
  }
}
```

#### 手順

1. **コンテキスト分析**
   - 完了したFlow、時間帯、ユーザーの状態
   - 過去の行動パターン

2. **提案生成**
   - Moduler Promptで次のFlow提案
   - format(schema)：

   ```typescript
   {
     suggestions: {
       flowId: string;
       reason: string;
       estimatedDuration: number; // minutes
       confidence: number;
       alternativeIf: {
         condition: string;
         alternativeFlowId: string;
       }
     }
     [];
   }
   ```

3. **提案の記録**
   - 提案内容と採否を記録（学習用）

#### 出力

```typescript
{
  suggestions: FlowSuggestion[];
  reasoning: string;
}
```

### C-2: SUGGEST_NEXT_ACTION（Issue対応提案）

#### 目的

特定のIssueに対する具体的なアクションを提案する。

#### 入力

```typescript
{
  issueId: string;
  requestDetail?: boolean;
}
```

#### 手順

1. **Issue分析**
   - Issueの内容、状態、履歴
   - 関連Knowledge検索

2. **アクション提案**
   - Moduler Promptで具体的アクション生成
   - format(schema)：

   ```typescript
   {
     actions: {
       type: 'immediate' | 'planned' | 'delegatable';
       description: string;
       steps: string[];
       prerequisites: string[];
       estimatedEffort: number;  // minutes
       tools: string[];
       relatedKnowledge: string[];
     }[];
   }
   ```

3. **実行支援情報**
   - 必要なツール、参考情報をまとめる

#### 出力

```typescript
{
  suggestedActions: Action[];
  supportingInfo: SupportInfo;
}
```

## 次のステップ

1. スケジュール管理ユースケースの定義
2. 各ワークフローの連携シナリオ作成
3. システム最低要件の確認
