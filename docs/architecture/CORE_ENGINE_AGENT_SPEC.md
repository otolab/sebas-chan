# CoreEngine と CoreAgent の仕様書

## 概要

sebas-chanシステムにおいて、CoreEngineとCoreAgentは明確に異なる役割を持つ、協調して動作する2つのコンポーネントです。

## アーキテクチャ上の位置づけ

```
[External] → REST API → CoreEngine → CoreAgent
                  ↓           ↓
              DB Bridge    WorkflowContext
                  ↓           ↓
              LanceDB     DB Bridge
                              ↓
                          LanceDB
```

**現在の実装**:
- State文書もDB経由で管理
- CoreAgentはWorkflowContextを通じてDB操作を実行
- DB Bridgeは単一インスタンスをCoreEngineが管理

## CoreEngine（中継者・管理者）

### 役割
- **情報の中継点**: 外部からの入力を受け取り、適切に変換・配信
- **リソース管理**: DB接続、イベントキューなどの管理
- **インターフェース変換**: REST APIとCoreAgentの間の変換層
- **整合性維持**: システム全体の状態整合性を保つ

### 責務
1. **I/O処理**
   - REST APIからのリクエスト処理
   - DBクライアントの管理とデータ永続化
   - イベントキューの管理

2. **WorkflowContext提供**
   - DB操作インターフェース（WorkflowStorage）
   - ログ記録（WorkflowLogger）
   - AIドライバーファクトリ（DriverFactory）
   - 実行時メタデータ

3. **CoreAgentの管理**
   - CoreAgentインスタンスの生成と管理
   - ワークフロー実行の制御
   - エラーハンドリング

### 実装場所
`packages/server/src/core/engine.ts`

### 主要メソッド
- `initialize()`: DB接続とCoreAgent初期化
- `processNextEvent()`: イベントキューから処理
- `createWorkflowContext()`: WorkflowContext生成
- `handleRequest()`: REST APIリクエスト処理

## CoreAgent（ワークフロー実行エンジン）

### 役割
- **ワークフロー実行**: 各種ワークフローの実行
- **イベント処理**: 優先度付きイベントの処理
- **ワークフローレジストリ管理**: ワークフローの登録と解決

### 責務
1. **ワークフロー処理**
   - WorkflowDefinitionに基づく実行
   - WorkflowRegistryによる管理
   - イベントからワークフローへのマッピング

2. **状態管理**
   - WorkflowContext経由でのDB操作
   - ワークフロー間のデータ共有
   - 実行結果の返却

3. **純粋性の維持**
   - I/O処理を直接行わない
   - CoreEngineが提供するインターフェースのみ使用
   - 関数ベースのワークフロー実装

### 実装場所
`packages/core/src/index.ts`（CoreAgentクラス）

### 主要メソッド
- `executeWorkflow()`: ワークフロー実行
- `getWorkflowRegistry()`: レジストリ取得

## Engine-Agent インターフェース

### 設計原則
- **Agentから見て整理されたインターフェース**: データ管理の実装詳細に引きずられない
- **単方向の依存**: ServerパッケージがCoreパッケージに依存（逆はなし）
- **疎結合**: 将来的にAgentを別プロセスに分離可能な設計

### インターフェース定義

```typescript
// CoreEngineがCoreAgentに提供するWorkflowContext
// packages/core/src/workflows/context.ts
interface WorkflowContextInterface {
  state: string;                    // システムの現在状態
  storage: WorkflowStorage;         // DB操作インターフェース
  logger: WorkflowLogger;          // ログ記録
  createDriver: DriverFactory;      // AIドライバーファクトリ
  metadata?: Record<string, any>;  // 実行時メタデータ
}

// ワークフロー定義
// packages/core/src/workflows/workflow-types.ts
interface WorkflowDefinition {
  name: string;
  description: string;
  triggers: WorkflowTrigger;
  executor: WorkflowExecutor;
}

// イベント定義
interface AgentEvent {
  type: string;
  priority: 'high' | 'normal' | 'low';
  payload: unknown;
  timestamp: Date;
}
```

## データアクセスパターン

### 現在の実装
1. **CoreEngine**
   - DBClientを直接保持
   - WorkflowContextを生成してCoreAgentに提供

2. **CoreAgent**
   - WorkflowContext.storageを通じてDB操作
   - 直接のDB接続は持たない

### データフロー例
```typescript
// 1. REST APIからリクエスト
POST /api/inputs
  ↓
// 2. CoreEngineが処理
engine.handleRequest()
  ↓
// 3. WorkflowContext生成
const context = engine.createWorkflowContext()
  ↓
// 4. CoreAgentでワークフロー実行
agent.executeWorkflow(workflow, event, context, emitter)
  ↓
// 5. WorkflowContext.storageでDB操作
await context.storage.createIssue(data)
```

## 実装済み機能

### ワークフロー
- `ingestInputWorkflow`: Input取り込み
- `processUserRequestWorkflow`: リクエスト分類
- `analyzeIssueImpactWorkflow`: 影響分析
- `extractKnowledgeWorkflow`: 知識抽出

### DB操作
- Pond: エントリ追加、検索、フィルタリング
- Issue: 作成、更新、検索
- Knowledge: 作成、検索
- Input: 作成、取得

### Web UI統合
- `/api/pond`: Pond検索API
- `/api/state`: システム状態取得
- `/api/knowledge`: Knowledge検索
- `/api/issues/:id`: Issue詳細取得

---

更新日: 2025-09-19
バージョン: 2.0.0（実装に合わせて更新）