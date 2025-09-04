# 思考ワークフロー

## 概要

思考ワークフローは、TypeScriptでハードコードされた自己完結型の処理単位です。単一のイベントループによるシリアル実行モデルを採用し、各ワークフローは特定の目的を達成するための一連の処理手順を実装します。

## ワークフローカテゴリ

### A: 個別要素の処理 (Individual Scope)

#### A-0: PROCESS_USER_REQUEST
ユーザーからの自然言語リクエストを解釈し、適切な後続ワークフローを起動する最上位ワークフロー。

#### A-1: INGEST_INPUT
Reporterから投入されたInputをIssueに変換し、関連するFlowを探索して紐付ける。

#### A-2: ANALYZE_ISSUE_IMPACT
Issueが更新された際に、関連するFlowや他のIssueへの影響を分析。

#### A-3: EXTRACT_KNOWLEDGE
完了したIssueから再利用可能なKnowledgeを抽出・生成。

#### A-4: DEFINE_SYSTEM_RULE
ユーザーの指示に基づき、システムの振る舞いを定義するルールを生成。

### B: 横断的な分析と整理 (Global Scope)

#### B-1: CLUSTER_ISSUES
類似したIssueをクラスタリングし、新たなFlowの生成を提案。

#### B-2: UPDATE_FLOW_RELATIONS
Flowのdescriptionを解釈し、Issue間の依存関係を更新。

#### B-3: UPDATE_FLOW_PRIORITIES
全Flowの状態とシステムルールを考慮し、優先度スコアを再計算。

#### B-4: SALVAGE_FROM_POND
Pond内の情報をクラスタリングし、価値のある情報を発見。

#### B-5: REFLECT_AND_ORGANIZE_STATE
状態文書全体を整理・要約し、重要な情報の構造化を提案する自己言及的ワークフロー。

### C: ユーザーへの提案 (Suggestion Scope)

#### C-1: SUGGEST_NEXT_FLOW
Flowの優先度に基づき、ユーザーが次に着手すべきFlowを提案。

#### C-2: SUGGEST_NEXT_ACTION_FOR_ISSUE
特定のIssueについて、次に取るべき具体的なアクションを提案。

### D: システムの自己調整 (System Self-Tuning)

#### D-1: TUNE_SYSTEM_PARAMETERS
収集した統計情報と目標指標を比較し、システムパラメータを自律的に調整。

#### D-2: COLLECT_SYSTEM_STATS
システム全体の活動に関する統計情報を定期的に収集。

## 実行モデル

### イベントキュー

優先度付きキューを採用：
- **高優先度**: ユーザーからの直接リクエスト
- **低優先度**: バックグラウンドの整理タスク

### トリガー

ワークフローは以下によってトリガーされます：
- Reportersからの情報
- ユーザーのリクエスト
- 他のワークフローからの後続リクエスト
- 定期的なスケジュール

### 文脈共有

全てのワークフローは実行時に単一の「状態文書（State）」を読み込み、現在の全体文脈を把握した上で動作します。

## Modularプロンプトフレームワーク

各ワークフローは独自開発のModularプロンプトフレームワークを利用してLLMへの指示を構成します。構造化された部品（モジュール）を組み合わせることで、動的なデータに対応しつつも安定的で高品質なプロンプトの生成を担保します。