# 実装計画

## プロジェクト構成

npm workspacesを用いたモノレポ構成を採用し、関心事を明確に分離します。

```
/monorepo-root
  ├─ package.json
  └─ /packages
     ├─ core/          # 思考ロジックの本体
     ├─ api-rest/      # coreの機能を公開するRESTサーバー
     ├─ web-ui/        # データ閲覧用のSvelteKit UI
     ├─ mcp-server/    # 外部AIが使うサーバープロセス
     ├─ reporters/     # 各Reporterの実装
     ├─ db/            # LanceDBを操作するTypeScript/Pythonブリッジ
     │  ├─ src/
     │  │  ├─ index.ts      # TypeScriptラッパー
     │  │  └─ python/
     │  │     ├─ lancedb_worker.py # Python JSON-RPCワーカー
     │  │     └─ requirements.txt
     │  └─ package.json
     └─ shared-types/  # パッケージ間で共有する型定義
```

## Proof of Concept (PoC) 開発計画

### Step 1: プロジェクトセットアップとデータモデル定義
- npm workspacesの構成を作成
- shared-typesにデータモデルを定義

### Step 2: DBブリッジの実装
- stdinを監視してIssueを追加・検索できる最小限のPythonワーカー
- State文書を読み書きする機能
- JSON-RPCで通信するTypeScriptラッパー

### Step 3: CoreロジックとREST APIの実装
- INGEST_INPUTイベントの実装
- /request, /state, /statsエンドポイントの実装

### Step 4: エンドツーエンドでの疎通確認
- mcp-server → api-rest → core → db → Pythonワーカー → LanceDBの流れを確認

### Step 5: 簡易UIの実装
- Issueの一覧表示
- State文書の表示
- 基本的な統計情報の表示

## 主要な技術的決定事項

### DB層の設計

**JSON-RPC over stdio**を採用：
- HTTPサーバーは立てず、標準入出力で通信
- TypeScriptとPython/LanceDBを軽量に接続
- 非同期処理に対応

### 思考ワークフローの実装

**1ワークフロー = 1ディレクトリ**構成：
- マニフェストファイル（メタデータ）
- エントリーポイント関数
- 内部実装の自由度を確保

### システムの健全性管理

**主要メトリクス**：
- issue_count_open, issue_count_total
- issue_close_avg_hours
- flow_count_active, flow_count_total
- flow_churn_rate_weekly
- knowledge_count_total
- pond_size, pond_salvage_rate
- agent_loop_count_daily

これらのメトリクスを定期的に収集し、システムの自己調整に活用します。

## 開発の優先順位

1. **基本的なデータフロー**の確立
2. **最小限の思考ワークフロー**の実装
3. **MCPインターフェース**の構築
4. **自己調整メカニズム**の追加
5. **高度な思考ワークフロー**の拡充