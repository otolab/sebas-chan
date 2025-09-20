# コンポーネント詳細設計

## Core Engine（@sebas-chan/server）

### 役割
Core Agentのラッパーとして機能し、システム全体の制御層を提供

### 主要機能
- **REST API提供**: 外部システムとの統一インターフェース
- **ワークフロー管理**: ワークフローの登録と実行制御
- **イベントキュー**: 優先度付きイベントの管理
- **ロギング**: システム全体のログ収集と管理

### 主要エンドポイント
```typescript
// ヘルス・状態管理
GET  /api/health              // ヘルスチェック
GET  /api/state               // システム状態取得

// データ操作
GET  /api/pond                // Pond検索
POST /api/inputs              // 入力投稿
GET  /api/knowledge           // Knowledge検索
GET  /api/issues/:id          // Issue詳細取得

// システム管理
GET  /api/logs                // ワークフローログ取得
POST /api/request             // 自然言語リクエスト処理
```

### 内部構成
```typescript
class CoreEngine {
  private eventQueue: PriorityQueue<Event>;
  private workflows: Map<string, WorkflowDefinition>;
  private coreAgent: CoreAgent;

  async processEvent(event: Event): Promise<WorkflowResult[]>;
  registerWorkflow(workflow: WorkflowDefinition): void;
}
```

## Core Agent（@sebas-chan/core）

### 役割
イベント駆動型の思考エンジン

### 主要機能
- **イベントループ**: 継続的なイベント処理
- **ワークフロー実行**: 登録されたワークフローの実行
- **LLM統合**: AI処理の実行
- **状態管理**: State文書による短期記憶管理

### 実装詳細
```typescript
class CoreAgent {
  private state: StateDocument;
  private context: WorkflowContext;

  async execute(workflow: WorkflowDefinition, event: Event): Promise<WorkflowResult>;
  async think(): Promise<void>; // 思考ループ
}
```

### WorkflowContext
ワークフローからDB操作を行うための統一インターフェース
```typescript
interface WorkflowContext {
  storage: {
    createIssue(data: IssueData): Promise<Issue>;
    updateIssue(id: string, data: Partial<Issue>): Promise<Issue>;
    searchPond(query: string): Promise<PondItem[]>;
    createKnowledge(data: KnowledgeData): Promise<Knowledge>;
  };
  logger: Logger;
  state: StateDocument;
}
```

## DB Bridge（@sebas-chan/db）

### 役割
TypeScriptとPython/LanceDBを繋ぐブリッジ層

### 構成
```
TypeScript側（親プロセス）
    ↓ JSON-RPC over stdio
Python側（子プロセス）
    ↓ LanceDB API
LanceDB（ベクトルDB）
```

### 主要機能
- **ベクトル検索**: 日本語対応（ruri-v3モデル、256次元）
- **SQLクエリ**: DataFusion SQLサポート
- **イベントストア**: 全イベントの永続化
- **トランザクション制御**: ACID特性の保証

### TypeScript側インターフェース
```typescript
class DBBridge {
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  async insert(table: string, data: any): Promise<void>;
  async update(table: string, id: string, data: any): Promise<void>;
  async query(sql: string): Promise<any[]>;
}
```

### Python側実装
```python
class LanceDBWorker:
    def search(self, query: str, **kwargs) -> List[Dict]:
        # ベクトル化と検索

    def insert(self, table: str, data: Dict) -> None:
        # データ挿入

    def query(self, sql: str) -> List[Dict]:
        # SQL実行
```

## Reporters

### 役割
外部情報源からの情報収集

### 共通インターフェース
```typescript
interface Reporter {
  name: string;
  collect(): Promise<Input[]>;
  schedule?: CronExpression;

  // REST APIクライアント機能
  async submit(input: Input): Promise<void> {
    await fetch('/api/inputs', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }
}
```

### 実装例

#### Gmail Reporter
```typescript
class GmailReporter implements Reporter {
  name = 'gmail';
  schedule = '*/5 * * * *'; // 5分毎

  async collect(): Promise<Input[]> {
    const emails = await gmail.getUnreadEmails();
    return emails.map(email => ({
      type: 'email',
      source: this.name,
      content: email.body,
      metadata: {
        from: email.from,
        subject: email.subject,
        date: email.date
      }
    }));
  }
}
```

#### Slack Reporter
```typescript
class SlackReporter implements Reporter {
  name = 'slack';

  async collect(): Promise<Input[]> {
    const messages = await slack.getNewMessages();
    return messages.map(msg => ({
      type: 'message',
      source: this.name,
      content: msg.text,
      metadata: {
        channel: msg.channel,
        user: msg.user,
        timestamp: msg.ts
      }
    }));
  }
}
```

## Web UI（@sebas-chan/web-ui）

### 役割
管理インターフェースとデータ可視化

### 技術スタック
- **フレームワーク**: SvelteKit
- **スタイリング**: TailwindCSS
- **API通信**: REST APIクライアント

### 主要画面
```
/                     # ダッシュボード
/pond                 # Pond検索・管理
/issues               # Issue一覧・管理
/issues/:id           # Issue詳細
/knowledge            # Knowledge検索
/logs                 # システムログ表示
/settings             # システム設定
```

### コンポーネント構成
```
src/
├── routes/           # ページコンポーネント
├── lib/
│   ├── api/         # API クライアント
│   ├── components/  # 共通コンポーネント
│   └── stores/      # Svelteストア
└── app.html         # ベーステンプレート
```

## MCP Server（Phase 4で実装予定）

### 役割
外部AIエージェントとの標準化された通信インターフェース

### 設計方針
- **独立実行可能**: スタンドアロンコマンドとして動作
- **stdio通信**: JSON-RPCプロトコル
- **REST APIクライアント**: sebas-chanの機能を外部に公開

### 予定される機能
```typescript
interface MCPServer {
  // MCPプロトコル実装
  handleRequest(request: MCPRequest): Promise<MCPResponse>;

  // 機能公開
  capabilities: {
    search: boolean;
    createIssue: boolean;
    executeWorkflow: boolean;
  };
}
```

## 関連ドキュメント

- [システム概要](OVERVIEW.md) - 全体アーキテクチャ
- [技術的決定事項](TECHNICAL_DECISIONS.md) - 技術選定理由
- [インターフェース仕様](INTERFACES.md) - 詳細なAPI仕様