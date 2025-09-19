# ドキュメント一覧

## カテゴリ別ドキュメント構成

### 1. プロジェクト概要・コンセプト
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [CONCEPT.md](CONCEPT.md) | プロジェクトの基本コンセプトと目的 | 正式 | 維持 |
| [ROADMAP.md](ROADMAP.md) | 開発ロードマップとマイルストーン | 正式 | 最新 |
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | 各フェーズの実装状況 | 正式 | 最新 |

### 2. アーキテクチャ・設計
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [architecture/README.md](architecture/README.md) | アーキテクチャドキュメントの概要 | インデックス | 最新 |
| [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) | システムアーキテクチャ全体像 | 正式 | 最新 |
| [architecture/SYSTEM_DESIGN.md](architecture/SYSTEM_DESIGN.md) | システム設計の詳細 | 正式 | 維持 |
| [architecture/INTERFACES.md](architecture/INTERFACES.md) | モジュール間インターフェース仕様 | 正式 | 最新 |
| [architecture/INFORMATION_MODEL.md](architecture/INFORMATION_MODEL.md) | データモデル定義 | 正式 | 維持 |
| [architecture/CORE_ENGINE_AGENT_SPEC.md](architecture/CORE_ENGINE_AGENT_SPEC.md) | Core EngineとCore Agentの詳細仕様 | 正式 | 維持 |

### 3. 機能仕様
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [features/README.md](features/README.md) | 機能仕様ドキュメントの概要 | インデックス | 最新 |
| [features/pond-filtering-spec.md](features/pond-filtering-spec.md) | Pondフィルタリング機能仕槕 | 正式 | 維持 |

### 4. ワークフロー関連
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [workflows/README.md](workflows/README.md) | ワークフロードキュメントの概要 | インデックス | 最新 |
| [workflows/SPECIFICATION.md](workflows/SPECIFICATION.md) | ワークフロー技術仕様書 | 正式 | 最新 |
| [workflows/DEVELOPER_GUIDE.md](workflows/DEVELOPER_GUIDE.md) | ワークフロー開発者ガイド | 正式 | 最新 |
| [workflows/ARCHITECTURE.md](workflows/ARCHITECTURE.md) | ワークフローアーキテクチャ詳細 | 正式 | 維持 |
| [workflows/COGNITIVE_WORKFLOWS.md](workflows/COGNITIVE_WORKFLOWS.md) | 認知ワークフローの設計 | 正式 | 維持 |
| [workflows/LOGGING_SPEC.md](workflows/LOGGING_SPEC.md) | ワークフローログ仕様 | 正式 | 維持 |

### 5. テスト関連
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [testing/README.md](testing/README.md) | テストドキュメントの概要 | インデックス | 最新 |
| [testing/STRATEGY.md](testing/STRATEGY.md) | テスト戦略と方針 | 正式 | 維持 |
| [testing/SPECIFICATIONS.md](testing/SPECIFICATIONS.md) | テスト仕様書 | 正式 | 維持 |

### 6. フェーズ別作業記録

###
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [phases/README.md](phases/README.md) | フェーズ別作業記録の概要 | インデックス | 維持 |
| [phases/PHASE_001_PROJECT_INITIALIZATION.md](phases/PHASE_001_PROJECT_INITIALIZATION.md) | Phase 1作業記録 | 記録 | 完了 |
| [phases/PHASE_002_REPORTER_SDK_DEVELOPMENT.md](phases/PHASE_002_REPORTER_SDK_DEVELOPMENT.md) | Phase 2作業記録 | 記録 | 完了 |
| [phases/PHASE_003_WORKFLOW_IMPLEMENTATION.md](phases/PHASE_003_WORKFLOW_IMPLEMENTATION.md) | Phase 3作業記録 | 記録 | 進行中 |

### 7. Phase 3アーカイブ
| ファイル | 内容 | 種別 | 状態 |
|---------|------|------|------|
| [phases/phase3/archive/](phases/phase3/archive/) | Phase 3作業メモアーカイブ | メモ | アーカイブ |
| [phases/phase3/README.md](phases/phase3/README.md) | Phase 3作業の概要 | メモ | 完了 |

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

## 統廃合完了項目（2025-09-19）

1. **削除済み**
   - `IMPLEMENTATION_PLAN.md` - ROADMAPに統合
   - `ideas/` ディレクトリ全体 - アーカイブ済み初期メモ
   - `phases/phase3/implementation-status.md` - IMPLEMENTATION_STATUS.mdに統合

2. **アーカイブ済み**
   - Phase 3作業メモ → `phases/phase3/archive/`へ移動

3. **整理済み**
   - ワークフロー関連ドキュメントの役割分担を明確化

## ドキュメント数の変化

- 統廃合前: 31ファイル
- 統廃合後: 約23ファイル（カテゴリREADME含む）
- 整理効果: カテゴリ別構成によりナビゲーション改善