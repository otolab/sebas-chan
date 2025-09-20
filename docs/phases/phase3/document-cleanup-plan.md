# ドキュメント統廃合計画

## 実施日: 2025-09-19

## 1. 削除対象ファイル

### 古い・不要なファイル
- `docs/IMPLEMENTATION_PLAN.md` - 古い計画書、現在のROADMAP.mdに置き換え済み
- `docs/ideas/` ディレクトリ全体 - アーカイブ済み初期設計メモ

### Phase 3作業完了メモ（phases/phase3/archive/へ移動後削除）
- `docs/phases/phase3/document-reorganization-plan.md` - Issue #22で実施済み

## 2. 統合対象ファイル

### ワークフロー関連の重複解消
- **維持**: `docs/workflows/SPECIFICATION.md` - 正式仕様書
- **維持**: `docs/workflows/DEVELOPER_GUIDE.md` - 開発者ガイド
- **更新**: `docs/WORKFLOW_ARCHITECTURE.md` - 実装例に特化（重複削除済み）

### 実装状況の整理
- **維持**: `docs/IMPLEMENTATION_STATUS.md` - 全体サマリー
- **統合**: `docs/phases/phase3/implementation-status.md`の内容を上記に統合

## 3. 移動対象ファイル

### Phase 3作業メモのアーカイブ化
移動先: `docs/phases/phase3/archive/`
- `workflow-catalog-issue.md`
- `workflow-improvement-plan.md`
- `event-to-workflow-design.md`
- `design-decisions.md`

## 4. 更新対象ファイル

### WORKFLOW_LOGGING_SPEC.md
- 最新の実装に合わせて更新が必要
- 不正確な記述の修正

### TEST_SPECIFICATIONS.md
- 実装済みテストと仕様の同期

## 5. 実施手順

1. ✅ 統廃合計画の作成（このファイル）
2. 不要ファイルの削除
3. Phase 3作業メモのアーカイブ化
4. 重複内容の統合
5. DOCUMENT_INDEX.mdの更新
6. 変更内容のコミット

## 6. 期待される効果

- ドキュメント数: 31 → 約20ファイル
- 重複排除により保守性向上
- 作業メモと正式ドキュメントの明確な分離
- ナビゲーションの改善