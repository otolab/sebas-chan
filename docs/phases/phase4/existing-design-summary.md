# Phase 3 既存設計の総括

## 発見した重要ドキュメント

### 1. ワークフロー詳細設計
- **WORKFLOW_DETAILED_DESIGN.md** - A系ワークフローの完全な仕様
- **WORKFLOW_EVENT_DRIVEN_DESIGN.md** - イベント駆動の本質的な設計
- **A_SERIES_WORKFLOW_IMPROVEMENT.md** - ModulerPrompt活用の改善提案

### 2. イベント設計
- **WORKFLOW_TRIGGER_EVENTS.md** - イベント分類とトリガー定義
- **EVENT_CATALOG.md** (/docs/workflows/) - 実装済みイベントカタログ

### 3. ユースケース
- **SCHEDULE_MANAGEMENT_USE_CASE.md** - スケジュール管理の具体例
- **WORKFLOW_COLLABORATION_SCENARIOS.md** - ワークフロー連携シナリオ
- **archive/WORKFLOW_DESIGN.md** - B系・C系の初期設計

### 4. 実装計画
- **WORKFLOW_IMPLEMENTATION_PLAN.md** - B系・C系の実装計画
- **COGNITIVE_DESIGN.md** - 思考ワークフローの全体設計（D系含む）

## Phase 3で設計済みの内容

### A系ワークフロー（実装済み）

#### A-0: ProcessUserRequest
- **トリガー**: USER_REQUEST_RECEIVED
- **優先度**: 60
- **機能**: 自然言語解釈、意図分類、イベント生成
- **ModulerPrompt活用**: Schema定義による構造化出力

#### A-1: IngestInput
- **トリガー**: DATA_ARRIVED
- **優先度**: 40
- **機能**: Pond保存、緊急性判定、Issue生成

#### A-2: AnalyzeIssueImpact
- **トリガー**: ISSUE_CREATED/UPDATED
- **優先度**: 30
- **機能**: 影響分析、関連性判定、優先度設定

#### A-3: ExtractKnowledge
- **トリガー**: ISSUE_CLOSED, KNOWLEDGE_EXTRACTABLE
- **優先度**: 20
- **機能**: 知識抽出、一般化、構造化保存

### B系ワークフロー（設計済み・未実装）

#### B-1: ClusterIssues
- **目的**: 関連Issue群の自動グルーピング
- **トリガー**:
  - SCHEDULED_TIME_REACHED（定期実行）
  - ISSUE_CREATED（閾値超過時）
- **優先度**: 10
- **処理**:
  - ベクトル類似度によるクラスタリング
  - 共通パターンの抽出
  - Flow候補の提案

#### B-2: UpdateFlowRelations
- **目的**: Flow間の関係性更新
- **トリガー**:
  - FLOW_CREATED
  - ISSUE_UPDATED
- **優先度**: 15
- **処理**:
  - Issue-Flow関係の再計算
  - 依存関係の更新
  - 影響範囲の再評価

#### B-3: UpdateFlowPriorities
- **目的**: 優先度の動的調整
- **トリガー**:
  - SCHEDULED_TIME_REACHED（日次）
  - THRESHOLD_EXCEEDED
- **優先度**: 15
- **処理**:
  - 期限による優先度調整
  - 重要度の再評価
  - ユーザーフィードバック反映

#### B-4: SalvageFromPond
- **目的**: Pondからの価値ある情報の抽出
- **トリガー**:
  - SCHEDULED_TIME_REACHED（週次/月次）
- **優先度**: 5
- **処理**:
  - パターンマイニング
  - 頻出トピックの抽出
  - Knowledge候補の生成

### C系ワークフロー（設計済み・未実装）

#### C-1: SuggestNextFlow
- **目的**: 次に実行すべきFlowの提案
- **トリガー**:
  - FLOW_COMPLETED
  - USER_REQUEST（提案要求）
- **優先度**: 25
- **処理**:
  - コンテキスト分析
  - 優先度とタイミングの評価
  - 提案生成

#### C-2: SuggestNextAction
- **目的**: Issue解決のためのアクション提案
- **トリガー**:
  - ISSUE_STALLED（長期未更新）
  - ACTION_REQUESTED
- **優先度**: 25
- **処理**:
  - 過去の類似ケース検索
  - 成功パターンの適用
  - 具体的アクション生成

### D系ワークフロー（設計済み・未実装）

#### D-1: TuneSystemParameters
- **目的**: システムパラメータの自律的調整
- **トリガー**:
  - STATS_COLLECTED
  - THRESHOLD_EXCEEDED
- **優先度**: 10
- **処理**:
  - 統計情報と目標指標の比較
  - パラメータ調整案の生成
  - 段階的な適用と検証

#### D-2: CollectSystemStats
- **目的**: システム統計情報の収集
- **トリガー**:
  - SCHEDULED_TIME_REACHED（日次）
- **優先度**: 5
- **処理**:
  - 活動ログの集計
  - パフォーマンス指標の計算
  - トレンド分析

## Phase 3の設計原則

### イベント駆動の本質
1. **イベント = 事実の記録**（何が起きたか）
2. **ワークフロー = 反応・処理**（どう対応するか）
3. イベントは処理方法を含まない

### AI処理と機械的処理の分離

#### AI処理すべき部分
- 理解・解釈（自然言語、コンテキスト）
- 生成・創造（要約、提案、構造化）
- 判断・評価（重要度、優先度、類似性）

#### 機械的処理すべき部分
- データ操作（DB、ID、タイムスタンプ）
- ルールベース処理（閾値、条件分岐）
- 集計・計算（スコア、統計）

### ModulerPromptの活用方針
- JSONSchemaによる構造化出力
- モジュール化による再利用性
- コンテキスト管理の改善

## Phase 4で必要な追加設計

### 1. Flow中心の設計
- **Flowの「観点」システム** - Phase 4で新規追加
- **Flow自動生成メカニズム** - B-1で部分的に設計済み
- **Flow関係性の自然言語記述** - 未設計

### 2. 新規イベント定義
Phase 3には以下のイベントが未定義：
- FLOW_CREATED/UPDATED/COMPLETED
- PERSPECTIVE_APPLIED/UPDATED
- ISSUE_SPLIT_REQUESTED
- USER_INQUIRY_REQUIRED
- KNOWLEDGE_CORRUPTED

### 3. ユーザー問い合わせメカニズム
- 矛盾検出時の処理フロー - 未設計
- ユーザー応答の処理 - 未設計

### 4. サルベージレシピ
- B-4で概念設計のみ
- 具体的なレシピ定義が必要

## 活用すべき既存設計

1. **ワークフロー基本構造** - そのまま活用
2. **イベント分類体系** - 拡張して活用
3. **AI処理の分離原則** - 継承
4. **ModulerPrompt統合方針** - 全面採用
5. **優先度システム** - そのまま活用（-100〜100）

## 結論

Phase 3で非常に詳細な設計が行われており、B系・C系ワークフローの基本設計も完了している。Phase 4では：

1. これらの設計を**Flowの観点システム**と統合
2. **Flow関連イベント**を追加定義
3. **ユーザー問い合わせメカニズム**を新規設計
4. 既存設計に基づいて**B系・C系を実装**

これにより、Phase 3の成果を最大限活用しつつ、Phase 4の新要件を満たすことができる。