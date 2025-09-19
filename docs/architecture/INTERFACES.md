# sebas-chan インターフェース仕様

## システム全体の通信アーキテクチャ

```
[MCP Clients] ←stdio→ [MCP Server] ──┐
                                     │ HTTP
[Reporters] ─────────────────────────┼──→ [REST API] ←→ [Core API] ←→ [DB Bridge] ←→ [LanceDB]
                                     │                        ↑
[Web UI] ────────────────────────────┘                  [Core Agent]
```

**重要な変更点**:
- REST APIがすべての外部通信の統一入口
- Core APIがCore Agentとデータ層の間に位置
- MCPサーバーは独立コマンド（sebas-chanの外側）

## 1. Server インターフェース

サーバープロセスはメインのエントリーポイントとして、設定管理、REST API、CLIコマンドを提供します。

### REST API（主要）

REST APIはすべての外部通信の統一入口として機能します。

### エンドポイント一覧

#### コア機能
- `POST /request` - ユーザーからの自然言語リクエストを処理
- `GET /state` - 現在の状態文書を取得
- `PUT /state` - 状態文書を更新（Core Agent経由）
- `GET /stats` - システム統計情報を取得

#### Input管理（Reporter用）
- `POST /inputs` - Reporterからの入力を受付
- `GET /inputs` - 未処理のInput一覧

#### Issue管理
- `GET /issues` - Issue一覧を取得（フィルタ・検索可能）
- `GET /issues/:id` - 特定のIssueを取得
- `POST /issues` - 新規Issue作成
- `PUT /issues/:id` - Issue更新
- `DELETE /issues/:id` - Issue削除

#### Flow管理
- `GET /flows` - Flow一覧を取得
- `GET /flows/:id` - 特定のFlowを取得
- `POST /flows` - 新規Flow作成
- `PUT /flows/:id` - Flow更新

#### Knowledge管理
- `GET /knowledge` - Knowledge一覧を取得
- `GET /knowledge/:id` - 特定のKnowledgeを取得
- `POST /knowledge` - 新規Knowledge作成
- `PUT /knowledge/:id/reputation` - Knowledge評価の更新

## 2. MCP Server インターフェース

MCPサーバーはMCP対応AIエージェントのプラグインとして機能する独立コマンドです。

### 位置づけ
- **実装形態**: 独立した実行可能コマンド
- **通信方式**: stdin/stdout（JSON-RPC）
- **役割**: MCP対応クライアントとREST APIの橋渡し
- **特徴**: sebas-chanシステムの「外側」の存在

### 主要メソッド（MCP標準）

```typescript
// MCPクライアントから呼ばれるメソッド
interface MCPMethods {
  // 自然言語リクエスト
  request(prompt: string): Promise<Response>
  
  // データ取得
  get(params: GetParams): Promise<any>
  list(params: ListParams): Promise<any[]>
  search(params: SearchParams): Promise<SearchResults>
  
  // State文書操作
  getStateDocument(): Promise<string>
  updateStateDocument(content: string): Promise<void>
}
```

### 内部実装
MCPサーバーは受信したリクエストをHTTPリクエストに変換し、REST APIを呼び出します。


## 3. DB Bridge インターフェース

dbパッケージはTypeScriptとPython/LanceDBを繋ぐブリッジ層です。

### アーキテクチャ
```
TypeScript API ←→ JSON-RPC over stdio ←→ Python Worker ←→ LanceDB
```

### TypeScript側API

```typescript
// Issue操作
searchIssues(query: string): Promise<Issue[]>
getIssue(id: string): Promise<Issue>
createIssue(issue: Omit<Issue, 'id'>): Promise<Issue>
updateIssue(id: string, updates: Partial<Issue>): Promise<Issue>

// Flow操作
searchFlows(query: string): Promise<Flow[]>
getFlow(id: string): Promise<Flow>
createFlow(flow: Omit<Flow, 'id'>): Promise<Flow>

// Knowledge操作
searchKnowledge(query: string): Promise<Knowledge[]>
getKnowledge(id: string): Promise<Knowledge>
createKnowledge(knowledge: Omit<Knowledge, 'id'>): Promise<Knowledge>

// State文書操作
getStateDocument(): Promise<string>
updateStateDocument(content: string): Promise<void>

// Pond操作
addToPond(entry: PondEntry): Promise<void>
searchPond(query: string): Promise<PondEntry[]>
```

### Python側RPC仕様

JSON-RPCメソッド:
- `db.search` - ベクトル検索実行
- `db.get` - ID指定での取得
- `db.create` - 新規作成
- `db.update` - 更新
- `db.delete` - 削除
- `db.get_state` - State文書取得
- `db.update_state` - State文書更新

## 4. Core API インターフェース

Core APIはビジネスロジックとデータアクセスの中間層として機能します。

### 責務
- データモデルの管理
- DB Bridgeとの通信
- State文書の管理（メモリ/DB）
- イベントキューの管理（インメモリ）

### 内部API
```typescript
interface CoreAPI {
  // Issue操作
  getIssue(id: string): Promise<Issue>
  createIssue(data: CreateIssueDto): Promise<Issue>
  updateIssue(id: string, data: UpdateIssueDto): Promise<Issue>
  
  // Flow操作
  getFlow(id: string): Promise<Flow>
  createFlow(data: CreateFlowDto): Promise<Flow>
  
  // Knowledge操作
  getKnowledge(id: string): Promise<Knowledge>
  createKnowledge(data: CreateKnowledgeDto): Promise<Knowledge>
  
  // State文書
  getState(): string
  updateState(content: string): void
  
  // イベントキュー
  enqueueEvent(event: Event): void
  dequeueEvent(): Event | null
}
```

## 5. Core Agent 内部インターフェース

### イベントキュー

```typescript
interface Event {
  id: string;
  type: WorkflowType;
  priority: 'high' | 'normal' | 'low';
  payload: any;
  timestamp: Date;
}

interface EventQueue {
  enqueue(event: Event): void;
  dequeue(): Event | null;
  peek(): Event | null;
  size(): number;
}
```

### ワークフロー実行インターフェース

> **注**: 最新の仕様については[ワークフロー技術仕様書](workflows/SPECIFICATION.md)を参照してください。

```typescript
// ワークフロー定義
interface WorkflowDefinition {
  name: string;
  description: string;
  triggers: WorkflowTrigger;
  executor: WorkflowExecutor;
}

// トリガー条件
interface WorkflowTrigger {
  eventTypes: string[];
  condition?: (event: AgentEvent) => boolean;
  priority?: number;  // -100 ~ 100
}

// 実行関数
type WorkflowExecutor = (
  event: AgentEvent,
  context: WorkflowContextInterface,
  emitter: WorkflowEventEmitterInterface
) => Promise<WorkflowResult>;

// 実行結果
interface WorkflowResult {
  success: boolean;
  context: WorkflowContextInterface;
  output?: unknown;
  error?: Error;
}
```

## 6. Reporter インターフェース

Reportersは外部情報源から情報を収集し、REST API経由でシステムに送信します。

### 共通インターフェース

```typescript
interface Reporter {
  name: string;
  source: string;  // "gmail", "slack", "calendar", etc.
  
  // 情報収集実行
  collect(): Promise<Input[]>;
  
  // スケジュール設定（オプション）
  schedule?: CronExpression;
  
  // REST APIへの送信（Reporter SDKが提供）
  submit(inputs: Input[]): Promise<void>;
}

interface Input {
  id: string;
  source: string;
  content: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}
```

### Reporter SDK
TypeScriptで実装されたクライアントSDKを提供し、REST APIとの通信を簡素化します。

### Reporter → REST API通信
各ReporterはREST APIの`POST /inputs`エンドポイントを呼び出してInputを送信します。

## 7. Web UI インターフェース

SvelteKitで実装されるWeb UIは、REST APIを通じてシステムの状態を可視化します。

### 主要な画面と対応API

- **ダッシュボード**: `GET /stats`, `GET /state`
- **Issue管理**: `GET /issues`, `PUT /issues/:id`
- **Flow管理**: `GET /flows`, `PUT /flows/:id`
- **Knowledge管理**: `GET /knowledge`, `PUT /knowledge/:id/reputation`
- **システム設定**: `GET /knowledge?type=system_rule`
- **Input管理**: `GET /inputs`, `POST /inputs`（手動入力）

## 8. データフロー例

### ユーザーリクエストの処理フロー

1. **MCPクライアント** → MCPサーバーに自然言語リクエスト送信（stdio）
2. **MCPサーバー** → REST APIの`/request`エンドポイントを呼び出し（HTTP）
3. **REST API** → Core APIを介してイベント生成
4. **Core Agent** → `PROCESS_USER_REQUEST`ワークフローを実行
5. **ワークフロー** → Core APIを通じてデータアクセス
6. **Core API** → DB BridgeにJSON-RPC送信
7. **DB Bridge** → Python WorkerがLanceDBを操作
8. 結果を逆順で返却

### 情報収集フロー

1. **Reporter** → 外部サービスから情報収集
2. **Reporter SDK** → REST APIの`/inputs`エンドポイントにPOST
3. **REST API** → Core APIにInput登録
4. **Core API** → イベントキューに`INGEST_INPUT`イベント追加
5. **Core Agent** → ワークフロー実行、InputをIssueに変換
6. **Core API** → DB Bridgeを通じてIssue保存

### State文書アクセスフロー

- **読み取り**: REST API → Core API → メモリ（キャッシュ）またはDB
- **更新**: REST API → Core API → Core Agent（リクエスト経由で安全に更新）

## 9. 実装計画

実装の詳細なフェーズと優先順位については[ロードマップ](ROADMAP.md)を参照してください。