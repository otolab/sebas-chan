# sebas-chan システムアーキテクチャ

## システム構成

### Core Agent（コアエージェント）

イベントキュー型の思考エンジンとして、以下の責務を持ちます：

- **思考ループ**: 常時稼働し、優先度付きキューからタスクを取り出して実行
- **ワークフロー管理**: TypeScriptで実装された思考ワークフローの実行制御
- **状態管理**: State文書を通じた短期記憶の管理

### 情報管理モデル

```
Input → Issue → Knowledge
         ↓
       Pond（未整理情報のストア）
```

- **Input**: Reportersから収集される生の情報
- **Issue**: 行動可能な課題単位（open/closeの状態管理）
- **Knowledge**: 永続的な知識（価値スコア付き）
- **Pond**: 将来価値を持つ可能性のある未整理情報

## エージェントタイプ

### 1. Core Agent (思考エンジン)

**役割**: システムの中心となる思考処理エンジン

**主要機能**:
- イベントキューからのタスク取得と実行
- ワークフローのオーケストレーション
- State文書の管理と更新
- 優先度に基づくタスク実行制御

**実装方針**:
- 単一のイベントループによるシリアル実行
- TypeScriptによる型安全な実装
- Modularプロンプトフレームワークの活用

### 2. Reporters (情報収集エージェント群)

**役割**: 外部からの情報を収集し、システムに入力する

**タイプ例**:
- **Web Reporter**: Webページの変更監視
- **Email Reporter**: メールの受信と解析
- **Calendar Reporter**: カレンダーイベントの監視
- **File Reporter**: ファイルシステムの変更追跡

**共通インターフェース**:
```typescript
interface Reporter {
  name: string;
  collect(): Promise<Input[]>;
  schedule?: CronExpression;
}
```

### 3. Workflow Agents (ワークフローエージェント)

**役割**: 特定のタスクを処理する小さな自己完結型の関数

#### 主要ワークフロー

**A-0: PROCESS_USER_REQUEST**
- ユーザーリクエストの意図分類
- 適切な後続ワークフローへのディスパッチ

**A-1: INGEST_INPUT**
- Inputの取り込みと初期処理
- IssueまたはPondへの振り分け

**A-2: MAINTAIN_STATE**
- State文書のサイズ監視
- 情報の構造化とIssue化

**A-3: SALVAGE_POND**
- Pondからの価値ある情報の抽出
- クラスタリングと関連性分析

**A-4: DEFINE_SYSTEM_RULE**
- システムルールの定義と更新
- 自己調整メカニズムの実装

**A-5: EVALUATE_KNOWLEDGE**
- Knowledge価値スコアの更新
- 陳腐化した情報の検出

### 4. MCP Server Agent

**役割**: 外部クライアントとの標準化された通信インターフェース

**機能**:
- MCPプロトコルによる機能公開
- 自己記述スキーマの提供
- REST API（api-rest）への内部通信
- リクエスト/レスポンスの処理

詳細は[インターフェース仕様](INTERFACES.md)を参照。

### 5. REST API (api-rest)

**役割**: Core Agentの機能を内部プロセスに公開

**主要エンドポイント**:
- `/request` - 自然言語リクエスト処理
- `/issues` - Issue管理
- `/flows` - Flow管理
- `/knowledge` - Knowledge管理
- `/state` - State文書管理

### 6. DB Bridge

**役割**: TypeScriptとPython/LanceDBを繋ぐブリッジ層

**構成**:
- TypeScriptラッパー（高レベルAPI）
- Python RPCワーカー（LanceDB操作）
- JSON-RPC over stdio通信

## エージェント間の通信

### 通信フロー
```
External Client ←MCP→ MCP Server ←HTTP→ REST API ←→ Core Agent ←JSON-RPC→ DB Bridge ←→ LanceDB
                                              ↑
                                         Reporters
```

### イベントキュー

```typescript
interface Event {
  id: string;
  type: WorkflowType;
  priority: 'high' | 'normal' | 'low';
  payload: any;
  timestamp: Date;
}
```

### State文書

- 全エージェントが参照可能な共有メモリ
- 楽観的ロックによる更新制御
- 自然言語による情報記述

## 開発ガイドライン

### ワークフロー実装規約

1. **ディレクトリ構成**: 1ワークフロー = 1ディレクトリ
2. **エントリーポイント**: 単一の非同期実行関数
3. **マニフェスト**: メタデータと定義情報を含む
4. **ログ**: 詳細な実行ログの記録

### テスト戦略

- ワークフロー単位での単体テスト
- イベントキューの統合テスト
- State文書の競合状態テスト

## 関連ドキュメント

- [インターフェース仕様](INTERFACES.md) - 詳細な通信仕様とAPI定義
- [実装状況](IMPLEMENTATION_STATUS.md) - 開発フェーズと進捗