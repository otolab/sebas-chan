# Phase 3: ワークフロー実装

## 概要

Phase 3では、sebas-chanの思考エンジンとなるワークフローシステムの設計と実装を行いました。イベント駆動型アーキテクチャを採用し、関数ベースの純粋なワークフローとして実装しています。

## 現在の状態

- ✅ 基本ワークフロー（A-0〜A-3）実装完了
- ✅ イベント駆動設計の確立
- ✅ WorkflowDefinitionインターフェース定義
- 🚧 ModulerPrompt統合（進行中）
- 📋 B系・C系ワークフロー実装予定

## 主要ドキュメント

### 設計・仕様

#### 最新仕様

- [`WORKFLOW_EVENT_DRIVEN_DESIGN.md`](WORKFLOW_EVENT_DRIVEN_DESIGN.md) - イベント駆動設計の本質的理解
- [`WORKFLOW_TRIGGER_EVENTS.md`](WORKFLOW_TRIGGER_EVENTS.md) - 全ワークフローのトリガーイベント仕様
- [`WORKFLOW_DETAILED_DESIGN.md`](WORKFLOW_DETAILED_DESIGN.md) - ワークフロー詳細設計（Input/Output/Process）

#### 改善提案

- [`A_SERIES_WORKFLOW_IMPROVEMENT.md`](A_SERIES_WORKFLOW_IMPROVEMENT.md) - A系列ワークフローの改善提案
- [`OPTIMIZATION_PROPOSAL_V2.md`](OPTIMIZATION_PROPOSAL_V2.md) - システム最適化提案

### ユースケース検証

- [`SCHEDULE_MANAGEMENT_USE_CASE.md`](SCHEDULE_MANAGEMENT_USE_CASE.md) - スケジュール管理でのイベント駆動検証

### 実装計画

- [`WORKFLOW_IMPLEMENTATION_PLAN.md`](WORKFLOW_IMPLEMENTATION_PLAN.md) - 実装計画と優先順位

## 実装済みワークフロー

| ID  | 名前               | トリガーイベント              | 優先度 | 状態        |
| --- | ------------------ | ----------------------------- | ------ | ----------- |
| A-0 | ProcessUserRequest | USER_REQUEST_RECEIVED         | 60     | ✅ 実装済み |
| A-1 | IngestInput        | DATA_ARRIVED, ISSUE_REPORTED  | 40     | ✅ 実装済み |
| A-2 | AnalyzeIssueImpact | ISSUE_CREATED, ERROR_DETECTED | 30     | ✅ 実装済み |
| A-3 | ExtractKnowledge   | KNOWLEDGE_EXTRACTABLE         | 20     | ✅ 実装済み |

## 主要な設計決定

### 1. イベント駆動アーキテクチャ

- イベント = 「何が起きたか」の事実
- ワークフロー = イベントへの反応
- 疎結合で拡張性の高い設計

### 2. 関数ベースワークフロー

- 状態を持たない純粋関数
- 依存注入によるテスタビリティ
- TypeScriptによる型安全性

### 3. 優先度システム

- -100〜100の優先度範囲
- 高優先度（50-100）: ユーザー応答
- 標準優先度（0-49）: 通常処理
- 低優先度（-100--1）: バックグラウンド

## 次のステップ

### Phase 4に向けて

1. ModulerPrompt統合の完了
2. B系ワークフロー（横断的分析）の実装
3. C系ワークフロー（提案系）の実装
4. MCP統合とReporter開発

### 技術的改善

- [ ] 構造化出力（Schema）の活用
- [ ] 1workflow 1dirへの移行
- [ ] テストカバレッジの向上
- [ ] パフォーマンス最適化

## アーカイブ

古い設計文書は[`archive/`](archive/)フォルダに移動されています。
