# ドキュメント一覧

## カテゴリ別ドキュメント構成

### 1. プロジェクト概要・コンセプト
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [CONCEPT.md](CONCEPT.md) | プロジェクトの基本コンセプトと目的 | 正式 | 維持 |
| [ROADMAP.md](ROADMAP.md) | 開発ロードマップとマイルストーン | 正式 | 更新要 |
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | 各フェーズの実装状況 | 正式 | 最新 |

### 2. アーキテクチャ・設計
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | システムアーキテクチャ全体像 | 正式 | 最新 |
| [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | システム設計の詳細 | 正式 | 維持 |
| [INTERFACES.md](INTERFACES.md) | モジュール間インターフェース仕様 | 正式 | 最新 |
| [INFORMATION_MODEL.md](INFORMATION_MODEL.md) | データモデル定義 | 正式 | 維持 |

### 3. コア機能仕様
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [CORE_ENGINE_AGENT_SPEC.md](CORE_ENGINE_AGENT_SPEC.md) | Core EngineとCore Agentの詳細仕様 | 正式 | 維持 |
| [COGNITIVE_WORKFLOWS.md](COGNITIVE_WORKFLOWS.md) | 認知ワークフローの設計 | 正式 | 維持 |
| [pond-filtering-spec.md](pond-filtering-spec.md) | Pondフィルタリング機能仕様 | 正式 | 維持 |

### 4. ワークフロー関連
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [workflows/SPECIFICATION.md](workflows/SPECIFICATION.md) | ワークフロー技術仕様書 | 正式 | 最新 |
| [workflows/DEVELOPER_GUIDE.md](workflows/DEVELOPER_GUIDE.md) | ワークフロー開発者ガイド | 正式 | 最新 |
| [WORKFLOW_ARCHITECTURE.md](WORKFLOW_ARCHITECTURE.md) | ワークフローアーキテクチャ詳細 | 正式 | 維持 |
| [WORKFLOW_LOGGING_SPEC.md](WORKFLOW_LOGGING_SPEC.md) | ワークフローログ仕様 | 正式 | 維持 |

### 5. テスト関連
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | テスト戦略と方針 | 正式 | 維持 |
| [TEST_SPECIFICATIONS.md](TEST_SPECIFICATIONS.md) | テスト仕様書 | 正式 | 維持 |
| [TEST_ANALYSIS.md](TEST_ANALYSIS.md) | テスト分析レポート | 正式 | 維持 |

### 6. 開発計画・作業メモ
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | 実装計画書 | 計画 | 古い |
| [ideas/1.設計仕様書.md](ideas/1.設計仕様書.md) | 初期設計メモ | メモ | アーカイブ |
| [ideas/2.実装メモ.md](ideas/2.実装メモ.md) | 実装時のメモ | メモ | アーカイブ |
| [ideas/3.実装に向けた設計方針.md](ideas/3.実装に向けた設計方針.md) | 実装方針メモ | メモ | アーカイブ |

### 7. フェーズ別作業記録
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [phases/README.md](phases/README.md) | フェーズ別作業記録の概要 | インデックス | 維持 |
| [phases/PHASE_001_PROJECT_INITIALIZATION.md](phases/PHASE_001_PROJECT_INITIALIZATION.md) | Phase 1作業記録 | 記録 | 完了 |
| [phases/PHASE_002_REPORTER_SDK_DEVELOPMENT.md](phases/PHASE_002_REPORTER_SDK_DEVELOPMENT.md) | Phase 2作業記録 | 記録 | 完了 |
| [phases/PHASE_003_WORKFLOW_IMPLEMENTATION.md](phases/PHASE_003_WORKFLOW_IMPLEMENTATION.md) | Phase 3作業記録 | 記録 | 進行中 |

### 8. Phase 3作業メモ
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [phases/phase3/README.md](phases/phase3/README.md) | Phase 3作業の概要 | メモ | 作業中 |
| [phases/phase3/design-decisions.md](phases/phase3/design-decisions.md) | 設計決定事項 | メモ | 作業中 |
| [phases/phase3/event-to-workflow-design.md](phases/phase3/event-to-workflow-design.md) | イベント→ワークフロー設計 | メモ | 作業中 |
| [phases/phase3/implementation-status.md](phases/phase3/implementation-status.md) | Phase 3実装状況詳細 | メモ | 作業中 |
| [phases/phase3/workflow-catalog-issue.md](phases/phase3/workflow-catalog-issue.md) | ワークフローカタログ課題 | メモ | 作業中 |
| [phases/phase3/workflow-improvement-plan.md](phases/phase3/workflow-improvement-plan.md) | ワークフロー改善計画 | メモ | 作業中 |

## ドキュメント種別

- **正式**: プロジェクトの正式なドキュメント
- **計画**: 開発計画や提案
- **メモ**: 作業メモや一時的な記録
- **記録**: フェーズ別の作業記録
- **インデックス**: 他のドキュメントへの索引

## 状態

- **最新**: 最近更新され、現状を正確に反映
- **維持**: 有効だが定期的な更新が必要
- **更新要**: 内容が古く更新が必要
- **古い**: 参考程度、アーカイブ候補
- **アーカイブ**: 歴史的記録として保存
- **作業中**: 現在進行中の作業メモ
- **完了**: 完了したフェーズの記録
- **進行中**: 進行中のフェーズの記録

## 重複・整理が必要な項目

1. **ワークフロー関連**
   - `WORKFLOW_ARCHITECTURE.md`と`workflows/SPECIFICATION.md`に一部重複
   - 統合または役割分担の明確化が必要

2. **設計関連**
   - `SYSTEM_DESIGN.md`と`ARCHITECTURE.md`の役割分担
   - `ideas/`以下の内容の一部が正式ドキュメントと重複

3. **実装状況**
   - `IMPLEMENTATION_STATUS.md`と`phases/phase3/implementation-status.md`の重複
   - フェーズ別記録との整合性確認が必要

## 推奨アクション

1. **作業メモの整理**: `ideas/`と`phases/phase3/`の作業メモを整理
2. **重複内容の統合**: ワークフロー関連ドキュメントの整理
3. **古いドキュメントのアーカイブ**: `IMPLEMENTATION_PLAN.md`など
4. **インデックスの作成**: `docs/README.md`で全体像を提供