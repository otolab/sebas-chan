# ワークフロー開発ドキュメント

sebas-chanのワークフローシステムに関する開発文書です。

## 📚 ドキュメント一覧

| ドキュメント | 内容 | 重要度 |
|------------|------|--------|
| [SPECIFICATION.md](SPECIFICATION.md) | ワークフロー技術仕様書 | ⭐⭐⭐ |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | ワークフロー開発者ガイド | ⭐⭐⭐ |
| [EVENT_CATALOG.md](EVENT_CATALOG.md) | イベントカタログ | ⭐⭐⭐ |
| [RECORDING_SPEC.md](RECORDING_SPEC.md) | ワークフロー実行記録仕様 | ⭐⭐ |
| [PERSPECTIVE.md](PERSPECTIVE.md) | ワークフローの世界観 | ⭐⭐ |
| [COGNITIVE_DESIGN.md](COGNITIVE_DESIGN.md) | 認知ワークフロー設計 | ⭐ |

## 🎯 読む順序

### ワークフロー開発者（必読）
1. **EVENT_CATALOG.md** - どんなイベントがあるか理解
2. **SPECIFICATION.md** - 技術仕様を理解
3. **DEVELOPER_GUIDE.md** - 開発手順を学習
4. **[../ai/MODULER_PROMPT_GUIDE.md](../ai/MODULER_PROMPT_GUIDE.md)** - AI処理の実装

### 設計者向け
1. **PERSPECTIVE.md** - ワークフローの制約と能力
2. **COGNITIVE_DESIGN.md** - 高度な設計パターン
3. **RECORDING_SPEC.md** - トレーサビリティ設計

## 🚀 クイックスタート

### 新しいワークフローを作成

```typescript
import type { WorkflowDefinition } from '@sebas-chan/core';

export const myWorkflow: WorkflowDefinition = {
  name: 'MyWorkflow',
  description: 'ワークフローの説明',
  triggers: {
    eventTypes: ['MY_EVENT'],
    priority: 0
  },
  executor: async (event, context, emitter) => {
    // ワークフロー処理
    return { success: true, context };
  }
};
```

詳細は[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)を参照。

## 📊 実装済みワークフロー

### A系（基本ワークフロー）
- **A-0**: ProcessUserRequest - ユーザーリクエスト処理
- **A-1**: IngestInput - データ取り込み
- **A-2**: AnalyzeIssueImpact - Issue影響分析
- **A-3**: ExtractKnowledge - 知識抽出

## 🔗 関連ドキュメント

- [システム設計](../design/) - 全体アーキテクチャ
- [AI統合](../ai/) - AI処理実装
- [データ設計](../data/) - データモデル
- [実装状況](../IMPLEMENTATION_STATUS.md) - 開発進捗