# sebas-chan システムアーキテクチャ概要

## システム全体構造

```
┌──────────────────────────────────────────────────────┐
│                    Server Process                     │
│                  (@sebas-chan/server)                 │
│  ┌────────────────────────────────────────────────┐  │
│  │             Core Engine (制御層)                │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │          REST API エンドポイント          │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │         ↓                       ↓              │  │
│  │  ┌──────────────┐     ┌──────────────────┐  │  │
│  │  │ Event Queue   │     │ WorkflowContext   │  │  │
│  │  └──────────────┘     └──────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
│                      ↓                               │
│  ┌────────────────────────────────────────────────┐  │
│  │          Core Agent (思考エンジン)              │  │
│  │            (@sebas-chan/core)                  │  │
│  └────────────────────────────────────────────────┘  │
│                      ↓                               │
│  ┌────────────────────────────────────────────────┐  │
│  │      DB Bridge → Python/LanceDB                │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
           ↑               ↑               ↑
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │Reporters │    │  Web UI  │    │MCP Server│
    │          │    │(SvelteKit)│    │ (Phase4) │
    └──────────┘    └──────────┘    └──────────┘
```

## 情報管理モデル

```
[外部情報源] → Reporters → Input → Issue → Knowledge
                            ↓
                          Pond
                    (未整理情報ストア)
```

### データフローの概念

1. **Input**: Reportersが外部から収集した生の情報
2. **Issue**: 行動可能な課題として整理された情報（open/close状態管理）
3. **Knowledge**: 長期的価値を持つ知識として昇華された情報
4. **Pond**: 将来価値を持つ可能性のある未整理情報のストア

## 主要コンポーネント概要

### Core Engine（@sebas-chan/server）
システム全体の制御層として機能
- REST APIエンドポイント提供
- イベントキュー管理
- ワークフロー実行制御

### Core Agent（@sebas-chan/core）
イベント駆動型の思考エンジン
- ワークフローの実行
- LLM呼び出し
- 状態管理（State文書）

### DB Bridge（@sebas-chan/db）
TypeScriptとPython/LanceDBのブリッジ
- ベクトル検索（日本語対応）
- イベントストア
- JSON-RPC通信

### Reporters
外部情報の収集エージェント群
- 各種サービスからの情報収集
- REST API経由でInputを投稿

### Web UI（@sebas-chan/web-ui）
管理インターフェース
- Pond検索
- Issue管理
- システムモニタリング

## 通信フロー

### 基本的な処理フロー

```
1. ユーザーリクエスト処理
   Web UI → REST API → Core Engine → Core Agent → Workflow実行

2. 情報収集フロー
   External Service → Reporter → REST API → Event生成 → Core Agent

3. データアクセス
   Core Agent → WorkflowContext → DB Bridge → LanceDB
```

### イベント駆動アーキテクチャ

```typescript
Event {
  type: WorkflowType    // ワークフロー種別
  priority: number      // -100〜100の優先度
  payload: any          // イベントデータ
}
```

優先度付きイベントキューにより、重要な処理を優先的に実行。

## エージェントタイプ

### 1. Core Agent（思考エンジン）
中央制御型の思考処理エンジン

### 2. Reporters（情報収集）
- Web Reporter
- Email Reporter
- Calendar Reporter
- File Reporter

### 3. Workflows（処理単位）
- **A系**: 基本ワークフロー（ユーザーリクエスト、Input処理等）
- **B系**: 横断的ワークフロー（クラスタリング、関係更新等）
- **C系**: 提案系ワークフロー（次のアクション提案等）
- **D系**: 自己調整ワークフロー（システム最適化等）

## 関連ドキュメント

- [コンポーネント詳細](COMPONENTS.md) - 各コンポーネントの詳細設計
- [技術的決定事項](TECHNICAL_DECISIONS.md) - 技術選定と設計方針
- [インターフェース仕様](INTERFACES.md) - API仕様と通信プロトコル
- [ワークフロー仕様](../workflows/SPECIFICATION.md) - ワークフロー詳細