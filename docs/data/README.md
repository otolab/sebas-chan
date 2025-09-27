# データ設計ドキュメント

sebas-chanシステムのデータモデルとスキーマ設計です。

## 📚 ドキュメント一覧

| ドキュメント | 内容 | 対象読者 |
|------------|------|---------|
| [INFORMATION_MODEL.md](INFORMATION_MODEL.md) | 概念的な情報モデル | 全員 |
| [LANCEDB_SCHEMA.md](LANCEDB_SCHEMA.md) | LanceDB物理スキーマ | DB設計者、開発者 |

## 🎯 読む順序

### 新規参加者
1. **INFORMATION_MODEL.md** - データの概念を理解

### データベース設計者
1. **INFORMATION_MODEL.md** - 概念モデル
2. **LANCEDB_SCHEMA.md** - 物理実装

## 📊 データフロー

```
[外部情報源] → Input → Pond → Issue → Knowledge
                         ↓
                    （未整理情報）
```

### 主要エンティティ

| エンティティ | 役割 | 永続化 |
|------------|------|--------|
| **Input** | 外部からの生データ | Pondに保存 |
| **Pond** | 未整理情報のプール | LanceDB |
| **Issue** | 行動可能な課題 | LanceDB |
| **Knowledge** | 再利用可能な知識 | LanceDB |

## 🔗 関連ドキュメント

- [システム設計](../design/ARCHITECTURE.md) - 全体アーキテクチャ
- [ワークフロー](../workflows/) - データ処理フロー
- [API](../api/) - データアクセスインターフェース