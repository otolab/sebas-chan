# ドキュメント再編成計画

## 背景

Issue #22の作業として、ドキュメントの重複を解消し、役割を明確化する。

## 重複内容の分析

### 1. ワークフロー関連

#### 現状

- `WORKFLOW_ARCHITECTURE.md` (402行): 実装例中心、具体的なワークフロー実装
- `workflows/SPECIFICATION.md` (326行): 仕様定義、インターフェース詳細

#### 問題点

- WorkflowDefinition、WorkflowContext等の型定義が両方に存在
- 役割分担が不明確

#### 整理方針

- **SPECIFICATION.md**: 正式な仕様書として維持（インターフェース、型定義、要件）
- **WORKFLOW_ARCHITECTURE.md**: 実装例とパターン集に特化
  - 型定義はSPECIFICATION.mdを参照
  - 実装されたワークフローの説明に集中

### 2. 設計関連

#### 現状

- `ARCHITECTURE.md`: システム全体のアーキテクチャ
- `SYSTEM_DESIGN.md`: 詳細設計

#### 問題点

- 内容の重複は少ないが、参照関係が不明確

#### 整理方針

- 現状維持（役割が異なるため）
- 相互参照を追加

### 3. 実装状況

#### 現状

- `IMPLEMENTATION_STATUS.md`: プロジェクト全体の実装状況
- `phases/phase3/implementation-status.md`: Phase 3の詳細

#### 問題点

- Phase 3の情報が2箇所に分散

#### 整理方針

- **IMPLEMENTATION_STATUS.md**: 各フェーズのサマリーのみ
- **phases/phase3/implementation-status.md**: Phase 3の詳細記録

## 実施計画

### Phase 1: ワークフロードキュメントの整理

1. `WORKFLOW_ARCHITECTURE.md`から型定義セクションを削除
2. SPECIFICATION.mdへの参照を追加
3. 実装例とパターンに特化した内容に再編

### Phase 2: 作業メモの整理

1. `ideas/`ディレクトリの内容確認
2. 有用な内容を正式ドキュメントに移行
3. アーカイブ化

### Phase 3: 相互参照の追加

1. 各ドキュメントに「関連ドキュメント」セクション追加
2. 役割の明確化

## 期待される効果

1. **明確な役割分担**: 各ドキュメントの目的が明確に
2. **保守性向上**: 重複排除により更新箇所が減少
3. **可読性向上**: 必要な情報への到達が容易に

## タイムライン

- ドキュメント一覧作成: ✅ 完了
- docs/README.md作成: ✅ 完了
- 重複分析: ✅ 完了
- ワークフロードキュメント整理: 🔄 次のステップ
- 作業メモ整理: 📋 予定
