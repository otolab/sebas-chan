# データベーススキーマ仕様書

## 概要

sebas-chanのデータベーススキーマとデータ型の正式仕様を定義します。本文書は、仕様変更の経緯を経て確定した最新の仕様を記載しています。

作成日: 2025年9月26日
バージョン: 1.0.0

## データベース構成

- **データベースエンジン**: LanceDB（ベクトルデータベース）
- **ベクトル次元数**: 256次元
- **埋め込みモデル**: ruri-v3（日本語特化）
- **ブリッジ層**: Python/TypeScript間のデータ型変換

## テーブル定義

### 1. Issues テーブル

課題管理の中核となるテーブル。

| フィールド名     | Python型           | TypeScript型       | 説明                       | 必須 | デフォルト値 |
| ---------------- | ------------------ | ------------------ | -------------------------- | ---- | ------------ |
| id               | string             | string             | ユニークID                 | ✓    | -            |
| title            | string             | string             | タイトル                   | ✓    | -            |
| description      | string             | string             | 詳細説明（ベクトル化対象） | ✓    | -            |
| status           | string             | 'open' \| 'closed' | ステータス                 | ✓    | 'open'       |
| priority         | int32              | number             | 優先度（0-100）            | ×    | undefined    |
| labels           | list[string]       | string[]           | ラベル配列                 | ✓    | []           |
| updates          | string (JSON)      | IssueUpdate[]      | 更新履歴                   | ✓    | []           |
| relations        | string (JSON)      | IssueRelation[]    | 他Issueとの関係            | ✓    | []           |
| source_input_ids | list[string]       | string[]           | ソースInput ID             | ✓    | []           |
| created_at       | timestamp(ms)      | Date               | 作成日時                   | ✓    | -            |
| updated_at       | timestamp(ms)      | Date               | 更新日時                   | ✓    | -            |
| vector           | list[float32, 256] | number[]           | ベクトル表現               | ✓    | -            |

#### 優先度定数

```typescript
const PRIORITY = {
  CRITICAL: 90, // 緊急
  HIGH: 70, // 高
  MEDIUM: 50, // 中
  LOW: 30, // 低
  NONE: 10, // なし
};
```

#### IssueUpdate型

```typescript
interface IssueUpdate {
  timestamp: Date;
  content: string;
  author: 'user' | 'ai'; // ユーザーのメモか、AIの提案か
}
```

#### IssueRelation型

```typescript
interface IssueRelation {
  type: 'blocks' | 'relates_to' | 'duplicates' | 'parent_of';
  targetIssueId: string;
}
```

### 2. Pond テーブル

すべてのイベントとInputが保存されるベクトル化ストア。

| フィールド名 | Python型           | TypeScript型             | 説明                 | 必須 | デフォルト値 |
| ------------ | ------------------ | ------------------------ | -------------------- | ---- | ------------ |
| id           | string             | string                   | ユニークID           | ✓    | -            |
| content      | string             | string                   | コンテンツ本文       | ✓    | -            |
| source       | string             | string                   | データソース         | ✓    | -            |
| context      | string             | string?                  | 自然言語コンテキスト | ×    | null         |
| metadata     | string (JSON)      | Record<string, unknown>? | メタデータ           | ×    | null         |
| timestamp    | timestamp(ms)      | Date                     | タイムスタンプ       | ✓    | -            |
| vector       | list[float32, 256] | number[]                 | ベクトル表現         | ✓    | -            |

#### sourceの値

- `'slack'`, `'teams'`, `'email'`, `'webhook'`, `'user_request'`
- ワークフロー名（例: `'IngestInput'`, `'ProcessUserRequest'`）
- その他カスタム値

#### contextの例

- `"work: ECサイトAPI開発"`
- `"personal: タスク管理"`
- `"project: sebas-chan"`

### 3. Knowledge テーブル

抽出・蒸留された永続的な知識。

| フィールド名 | Python型           | TypeScript型      | 説明           | 必須 | デフォルト値 |
| ------------ | ------------------ | ----------------- | -------------- | ---- | ------------ |
| id           | string             | string            | ユニークID     | ✓    | -            |
| type         | string             | KnowledgeType     | 知識タイプ     | ✓    | -            |
| content      | string             | string            | 知識本文       | ✓    | -            |
| upvotes      | int32              | number            | ポジティブ評価 | ✓    | 0            |
| downvotes    | int32              | number            | ネガティブ評価 | ✓    | 0            |
| sources      | string (JSON)      | KnowledgeSource[] | 情報源         | ✓    | []           |
| created_at   | timestamp(ms)      | Date              | 作成日時       | ✓    | -            |
| vector       | list[float32, 256] | number[]          | ベクトル表現   | ✓    | -            |

#### KnowledgeType

```typescript
type KnowledgeType =
  | 'system_rule' // AIの振る舞いを定義するルール
  | 'process_manual' // 定型的な業務フローや手順書
  | 'entity_profile' // 特定の人物、組織、プロジェクトに関する情報
  | 'curated_summary' // 特定のトピックについて横断的に集められた要約情報
  | 'factoid'; // 再利用可能な単一の事実や情報
```

#### KnowledgeSource

```typescript
type KnowledgeSource =
  | { type: 'issue'; issueId: string }
  | { type: 'pond'; pondEntryId: string }
  | { type: 'user_direct' }
  | { type: 'knowledge'; knowledgeId: string };
```

### 4. Schedules テーブル

スケジュール管理テーブル。

| フィールド名    | Python型      | TypeScript型                           | 説明                   | 必須 | デフォルト値 |
| --------------- | ------------- | -------------------------------------- | ---------------------- | ---- | ------------ |
| id              | string        | string                                 | ユニークID             | ✓    | -            |
| issue_id        | string        | string                                 | 関連Issue ID           | ✓    | -            |
| request         | string        | string                                 | 元の自然言語リクエスト | ✓    | -            |
| action          | string        | ScheduleAction                         | アクションタイプ       | ✓    | -            |
| next_run        | timestamp(ms) | Date \| null                           | 次回実行時刻           | ×    | null         |
| last_run        | timestamp(ms) | Date \| null                           | 最終実行時刻           | ×    | null         |
| pattern         | string        | string?                                | 繰り返しパターン       | ×    | null         |
| occurrences     | int32         | number                                 | 実行回数               | ✓    | 0            |
| max_occurrences | int32         | number?                                | 最大実行回数           | ×    | null         |
| dedupe_key      | string        | string?                                | 重複防止キー           | ×    | null         |
| status          | string        | 'active' \| 'completed' \| 'cancelled' | ステータス             | ✓    | 'active'     |
| created_at      | timestamp(ms) | Date                                   | 作成日時               | ✓    | -            |
| updated_at      | timestamp(ms) | Date                                   | 更新日時               | ✓    | -            |

#### ScheduleAction

```typescript
type ScheduleAction =
  | 'reminder' // リマインダー通知
  | 'escalate' // エスカレーション
  | 'auto_close' // 自動クローズ
  | 'follow_up' // フォローアップ
  | 'check_progress'; // 進捗確認
```

### 5. Flows テーブル

複数のIssueをまとめた作業単位。

| フィールド名   | Python型      | TypeScript型 | 説明                    | 必須 | デフォルト値 |
| -------------- | ------------- | ------------ | ----------------------- | ---- | ------------ |
| id             | string        | string       | ユニークID              | ✓    | -            |
| title          | string        | string       | タイトル                | ✓    | -            |
| description    | string        | string       | 説明                    | ✓    | -            |
| status         | string        | FlowStatus   | ステータス              | ✓    | 'backlog'    |
| priority_score | float32       | number       | 優先度スコア（0.0-1.0） | ✓    | 0.5          |
| issue_ids      | list[string]  | string[]     | 関連Issue ID            | ✓    | []           |
| created_at     | timestamp(ms) | Date         | 作成日時                | ✓    | -            |
| updated_at     | timestamp(ms) | Date         | 更新日時                | ✓    | -            |

#### FlowStatus

```typescript
type FlowStatus =
  | 'focused' // 最優先で集中
  | 'active' // アクティブ
  | 'monitoring' // 監視中
  | 'blocked' // ブロック中
  | 'pending_user_decision' // ユーザー判断待ち
  | 'pending_review' // レビュー待ち
  | 'backlog' // バックログ
  | 'paused' // 一時停止
  | 'someday' // いつかやる
  | 'completed' // 完了
  | 'cancelled' // キャンセル
  | 'archived'; // アーカイブ済み
```

### 6. State テーブル

システム状態管理テーブル。

| フィールド名 | Python型      | TypeScript型 | 説明                         | 必須 | デフォルト値 |
| ------------ | ------------- | ------------ | ---------------------------- | ---- | ------------ |
| id           | string        | string       | ユニークID（固定: 'system'） | ✓    | -            |
| content      | string        | string       | 状態文書（Markdown）         | ✓    | -            |
| updated_at   | timestamp(ms) | Date         | 更新日時                     | ✓    | -            |

## データ型変換規則

### Python → TypeScript

| Python型      | TypeScript型 | 変換方法     |
| ------------- | ------------ | ------------ |
| string        | string       | そのまま     |
| int32         | number       | そのまま     |
| float32       | number       | そのまま     |
| list[T]       | T[]          | 配列変換     |
| timestamp(ms) | Date         | new Date(ms) |
| string (JSON) | object       | JSON.parse() |

### TypeScript → Python

| TypeScript型 | Python型      | 変換方法         |
| ------------ | ------------- | ---------------- |
| string       | string        | そのまま         |
| number       | int32/float32 | 型に応じて変換   |
| T[]          | list[T]       | リスト変換       |
| Date         | timestamp(ms) | getTime()        |
| object       | string (JSON) | JSON.stringify() |

## バリデーション規則

### Issues

- `status`は `'open'` または `'closed'` のみ
- `priority`は 0〜100の範囲（設定する場合）
- `labels`は文字列配列
- `updates`と`relations`はJSON文字列として保存

### Schedules

- `status`は `'active'`, `'completed'`, `'cancelled'` のみ
- `issue_id`は必須（Issueとの関連）
- `occurrences`は0以上の整数
- `max_occurrences`が設定されている場合、`occurrences`がこの値に達したら`completed`に

### Knowledge

- `type`は定義された5種類のいずれか
- `upvotes`と`downvotes`は0以上の整数
- `sources`は有効なKnowledgeSource配列

## インデックス

各テーブルには以下のインデックスが設定されています：

### Issues

- Primary: `id`
- Index: `status`, `created_at`, `updated_at`
- Vector Index: `vector`

### Pond

- Primary: `id`
- Index: `source`, `timestamp`
- Vector Index: `vector`

### Knowledge

- Primary: `id`
- Index: `type`, `created_at`
- Vector Index: `vector`

### Schedules

- Primary: `id`
- Index: `issue_id`, `status`, `next_run`
- Unique: `issue_id` + `dedupe_key`（dedupeKeyが設定されている場合）

## 既存ドキュメントとの整合性確認

### INFORMATION_MODEL.mdとの整合性

✅ **整合性確認済み**

- Issue型定義: priority、createdAt、updatedAtフィールドが正しく反映
- PondEntry型定義: すべてのフィールドが一致
- Knowledge型定義: reputation構造が正しく実装
- KnowledgeSource: 4種類すべて実装（issue, pond, user_direct, knowledge）

### 相違点と対応

1. **Issueのpriority**
   - INFORMATION_MODEL.md: 記載なし
   - 実装: number型（0-100）として追加済み

2. **JSON文字列として保存されるフィールド**
   - Python側: string型
   - TypeScript側: 適切な型にパース
   - 対象: updates, relations, metadata, sources

3. **ベクトル次元数**
   - 統一: 256次元（ruri-v3モデル）

## 今後の課題

1. **Flow機能の完全実装**
   - テーブルは定義済み
   - ワークフロー実装が未完了

2. **Knowledge評価システム**
   - upvotes/downvotesフィールドは実装済み
   - 自動評価ロジックが未実装

3. **自動サルベージ機能**
   - Pondテーブルの定期スキャン
   - 価値ある情報の自動抽出

---

最終更新: 2025年9月26日
承認者: Phase 3実装チーム
