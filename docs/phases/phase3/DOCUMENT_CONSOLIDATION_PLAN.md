# Phase 3 ドキュメント整理計画

## 現状分析

Phase 3フォルダに多数のドキュメントが存在し、内容の重複や古い情報が混在している状況です。

## 整理方針

### 1. 最新の設計文書（維持）
以下は最新の理解を反映した重要文書として維持：
- `WORKFLOW_EVENT_DRIVEN_DESIGN.md` - イベント駆動の本質的理解
- `A_SERIES_WORKFLOW_IMPROVEMENT.md` - A系列の改善提案
- `SCHEDULE_MANAGEMENT_USE_CASE.md` - ユースケース検証
- `WORKFLOW_DETAILED_DESIGN.md` - 詳細設計（要更新）

### 2. アーカイブ対象
以下は古い理解に基づくため、archiveフォルダへ移動：
- `WORKFLOW_DESIGN.md` - 初期設計（WORKFLOW_DETAILED_DESIGNに統合済み）
- `WORKFLOW_VALIDATION_SUMMARY.md` - 古い検証結果
- `WORKFLOW_COLLABORATION_SCENARIOS.md` - 古いシナリオ
- `USE_CASE_SCHEDULE.md` - 新しいSCHEDULE_MANAGEMENT_USE_CASEで置換
- `SYSTEM_MINIMUM_REQUIREMENTS.md` - 古い要件定義
- `OPTIMIZATION_PROPOSAL.md` - V2で置換済み
- `document-cleanup-plan.md` - 実施済み
- `document-restructure-plan.md` - 実施済み

### 3. 統合が必要な文書
- `WORKFLOW_IMPLEMENTATION_PLAN.md` - A_SERIES_WORKFLOW_IMPROVEMENTに統合
- `OPTIMIZATION_PROPOSAL_V2.md` - 実装計画に反映

### 4. 新規作成
- `WORKFLOW_TRIGGER_EVENTS.md` - 全ワークフローのトリガーイベント一覧

## 実施手順

1. archiveフォルダへの移動
2. 統合文書の作成
3. README.mdの更新
4. 削除可能なファイルの削除