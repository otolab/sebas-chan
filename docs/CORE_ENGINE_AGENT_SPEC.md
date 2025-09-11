# CoreEngine と CoreAgent の仕様書

## 概要

sebas-chanシステムにおいて、CoreEngineとCoreAgentは明確に異なる役割を持つ、協調して動作する2つのコンポーネントです。

## アーキテクチャ上の位置づけ

```
[External] → REST API → CoreEngine → CoreAgent
                  ↓           ↓
              DB Bridge    State文書
                  ↓
              LanceDB
```

## CoreEngine（中継者・管理者）

### 役割
- **情報の中継点**: 外部からの入力を受け取り、適切に変換・配信
- **データ管理**: DB接続、State文書、イベントキューなどの管理
- **インターフェース変換**: REST APIとCoreAgentの間の変換層
- **整合性維持**: システム全体の状態整合性を保つ

### 責務
1. **I/O処理**
   - REST APIからのリクエスト処理
   - DBクライアントの管理とデータ永続化
   - イベントキューの管理

2. **データ管理**
   - State文書の管理（メモリ/DB）
   - Input/Issue/Knowledge/Flowの CRUD操作
   - Pondへのデータ格納

3. **CoreAgentの管理**
   - CoreAgentインスタンスの生成と管理
   - Agent向けの整理されたインターフェース提供
   - AgentからのリクエストをDBやAPIに変換

### 実装場所
`packages/server/src/core/engine.ts`

## CoreAgent（思考エンジン）

### 役割
- **純粋な思考ループ**: 生成AIによる自律的な思考処理
- **ワークフロー実行**: 各種思考ワークフローの実行
- **イベント処理**: 優先度付きイベントの処理

### 責務
1. **思考処理**
   - イベントループによる継続的な処理
   - ワークフロー（INGEST_INPUT等）の実行
   - LLM呼び出しによる判断・生成

2. **状態参照**
   - State文書を参照した文脈把握
   - 新規イベントの生成
   - 思考結果の出力

3. **純粋性の維持**
   - I/O処理を直接行わない
   - CoreEngineが提供するインターフェースのみ使用
   - データ管理の詳細を知らない

### 実装場所
`packages/core/src/index.ts`（CoreAgentクラス）

## Engine-Agent インターフェース

### 設計原則
- **Agentから見て整理されたインターフェース**: データ管理の実装詳細に引きずられない
- **単方向の依存**: ServerパッケージがCoreパッケージに依存（逆はなし）
- **疎結合**: 将来的にAgentを別プロセスに分離可能な設計

### インターフェース例

```typescript
// CoreEngineがCoreAgentに提供するインターフェース
interface AgentContext {
  // State文書の取得（読み取り専用）
  getState(): string;
  
  // データ検索（Engineが適切なDBアクセスを行う）
  searchIssues(query: string): Promise<Issue[]>;
  searchKnowledge(query: string): Promise<Knowledge[]>;
  
  // イベント生成（Engineがキューに追加）
  emitEvent(event: AgentEvent): void;
}

// CoreAgentがCoreEngineから受け取るイベント
interface AgentEvent {
  type: string;
  payload: any;
  context?: AgentContext;
}
```

## State文書の管理

### 管理責任
- **CoreEngine**: データの実際の管理（永続化、整合性）
- **CoreAgent**: ベストエフォートでの利用

### 更新フロー
1. Engine/Agent どちらも更新可能
2. 更新時はEngineが管理
3. AgentにはEngineから新しいStateが通知される
4. Agentは新しいStateをベストエフォートで反映

### 実装方針
- 同一プロセス内のshared memoryとして実装も検討
- 整合性はベストエフォート（厳密な同期は不要）

## 実装上の修正点

### 現在の問題
1. DBクライアントがCoreAgentに直接存在
2. ServerとCoreパッケージ間に依存関係がない
3. 重複した実装が存在

### 必要な修正
1. **依存関係の追加**
   - ServerパッケージにCoreパッケージへの依存を追加
   
2. **DBクライアントの移動**
   - CoreAgentからDBクライアントを削除
   - CoreEngineでDBクライアントを管理
   
3. **インターフェースの整理**
   - CoreEngineがCoreAgentに整理されたインターフェースを提供
   - CoreAgentはI/O処理をEngineに委譲

## 優先順位

**CoreAgentが主人公であり、最優先に実装される**

CoreEngineは：
- すべての中継点として機能
- 雑多な問題を整理
- インターフェースを変換
- 整合性を保つ
- システム最大の苦労人

この設計により、CoreAgentは純粋な思考処理に集中でき、システム全体の複雑性はCoreEngineが吸収します。