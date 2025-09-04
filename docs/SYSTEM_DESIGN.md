# sebas-chan システム設計（確定版）

## システム全体構造

### コアプロセス構成

```
sebas-chan Core Process (Node.js)
├── Core Agent（思考ループ）
├── Core API（内部API層）
├── REST API Server（外部インターフェース）
└── DB Bridge（Python子プロセス）→ LanceDB
```

### 外部コンポーネント

```
[独立プロセス/ツール]
├── MCP Server（独立コマンド、AIエージェントのプラグイン）
├── Reporters（複数の独立プロセス）
└── Web UI（SvelteKit、別サーバー）
```

## 通信アーキテクチャ

```
                    ┌─────────────────┐
                    │   MCP Clients   │
                    │ (Claude, etc.)  │
                    └────────┬────────┘
                             │ stdio
                    ┌────────▼────────┐
                    │   MCP Server    │
                    │ (独立コマンド)   │
                    └────────┬────────┘
                             │ HTTP
                             ▼
┌──────────────────────────────────────────────────────┐
│                    REST API Server                   │
│              （すべての外部通信の入口）                 │
└──────────┬───────────────┬───────────────┬──────────┘
           │               │               │
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │Reporters │    │  Web UI  │    │  Direct  │
    │          │    │(SvelteKit)│    │   API    │
    └──────────┘    └──────────┘    └──────────┘

[REST API内部]
           │
           ▼
    ┌──────────────┐
    │   Core API   │────► DB Bridge ────► LanceDB
    └──────┬───────┘
           │
    ┌──────▼───────┐
    │  Core Agent  │
    │ (思考ループ) │
    └──────────────┘
```

## コンポーネント詳細

### 1. REST API Server
- **役割**: すべての外部通信の統一インターフェース
- **責務**:
  - HTTPエンドポイントの提供
  - リクエストのルーティング
  - 認証・認可（将来実装）
- **公開エンドポイント**:
  - `/request` - 自然言語リクエスト
  - `/issues/*` - Issue管理
  - `/flows/*` - Flow管理
  - `/knowledge/*` - Knowledge管理
  - `/state` - State文書
  - `/inputs` - Reporter用入力

### 2. Core API
- **役割**: ビジネスロジックとデータアクセスの中間層
- **責務**:
  - データモデルの管理
  - DB Bridgeとの通信
  - State文書の管理
  - イベントキューの管理（インメモリ）
- **特徴**:
  - REST APIと同一プロセス内
  - Core Agentからの内部呼び出し

### 3. Core Agent
- **役割**: 思考エンジン
- **責務**:
  - イベントループの実行
  - ワークフローの実行
  - LLM呼び出し
  - 新規イベントの生成
- **特徴**:
  - Core APIを通じてデータアクセス
  - State文書を参照して思考

### 4. MCP Server
- **役割**: MCP対応AIエージェントのプラグイン
- **特徴**:
  - 独立した実行可能コマンド
  - stdio通信（JSON-RPC）
  - REST APIのクライアント
  - sebas-chanの「外側」の存在

### 5. Reporters
- **役割**: 外部情報の収集
- **実装方針**:
  - 独立したプロセス/スクリプト
  - REST APIクライアントSDKを利用
  - `/inputs`エンドポイントにPOST
- **種類**:
  - Gmail Reporter
  - Slack Reporter
  - Calendar Reporter
  - Manual Input Reporter

### 6. Web UI
- **役割**: 管理画面とデータ可視化
- **技術**: SvelteKit
- **接続**: REST APIクライアント

## データフロー

### 1. ユーザーリクエスト処理
```
1. External Client → MCP Server（stdio）
2. MCP Server → REST API `/request`（HTTP）
3. REST API → Core API → Core Agent
4. Core Agent → ワークフロー実行
5. ワークフロー → Core API → DB Bridge → LanceDB
6. 結果を逆順で返却
```

### 2. 情報収集フロー
```
1. Reporter → 外部サービスから情報収集
2. Reporter → REST API `/inputs`（HTTP POST）
3. REST API → Core API → イベント生成
4. Core Agent → INGEST_INPUTワークフロー
5. Issue作成 → DB保存
```

### 3. State文書アクセス
```
読み取り: REST API → Core API → メモリ/DB
書き込み: REST API → Core API → Core Agent（リクエスト経由）
```

## 実装計画

詳細な実装フェーズと計画については[ロードマップ](ROADMAP.md)を参照してください。

### 概要
- **Phase 1**: 最小構成（Core API + REST API + DB Bridge）
- **Phase 2**: 基本機能（Reporter SDK + Web UI + 主要ワークフロー）
- **Phase 3**: MCP統合（MCP Server + 拡張ワークフロー）
- **Phase 4**: 実用化（複数Reporter + 自己調整機能）

## 技術的決定事項

### 確定した方針
1. **REST APIが唯一の外部インターフェース**
2. **MCPサーバーは独立コマンド（プラグイン）**
3. **単一Node.jsプロセス構成（初期実装）**
4. **インメモリイベントキュー**
5. **State文書はCore APIが管理**
6. **ReportersはREST APIクライアント**

### 技術スタック
- **言語**: TypeScript（Core）、Python（DB層）
- **フレームワーク**: Express（REST API）、SvelteKit（UI）
- **DB**: LanceDB（ベクトルDB）
- **通信**: HTTP（外部）、JSON-RPC/stdio（MCP、DB Bridge）

## パッケージ構成（最終版）

```
packages/
├── core/           # Core Agent + Core API
├── api-rest/       # REST API Server
├── db/             # DB Bridge（TypeScript + Python）
├── mcp-server/     # MCP Server（独立コマンド）
├── reporter-sdk/   # Reporter用クライアントSDK
├── reporters/      # 各種Reporter実装
├── web-ui/         # SvelteKit管理画面
└── shared-types/   # 共有型定義
```

この設計により、シンプルで拡張可能なシステムを段階的に構築できます。