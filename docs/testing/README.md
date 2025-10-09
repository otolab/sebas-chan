# テストドキュメント

このディレクトリには、sebas-chanのテスト戦略と仕様に関するドキュメントが含まれています。

## ドキュメント一覧

| ドキュメント                                       | 説明                                   |
| -------------------------------------------------- | -------------------------------------- |
| [STRATEGY.md](STRATEGY.md)                        | テスト戦略と方針                       |
| [SPECIFICATIONS.md](SPECIFICATIONS.md)            | テスト仕様書                           |
| [PROMPT_TESTING_GUIDE.md](PROMPT_TESTING_GUIDE.md) | プロンプトテストガイドライン（新規）   |

## 読む順序

1. **STRATEGY.md** - テスト戦略と分類を理解
2. **SPECIFICATIONS.md** - 具体的なテスト仕様を確認
3. **PROMPT_TESTING_GUIDE.md** - AI駆動ワークフローのテスト方法を学習

## テストの実行

```bash
# 全テスト実行
npm test

# 特定パッケージのテスト
npm test -w @sebas-chan/core

# プロンプトテスト（ユニットテストのみ）
SKIP_AI_TESTS=true npm test -- prompts.test.ts

# プロンプトテスト（AI実行含む）
npm test -- prompts.test.ts  # .env.localにAPI設定が必要

# カバレッジ付きテスト
npm run test:coverage
```

## 関連ドキュメント

- [ワークフロー仕様](../workflows/) - ワークフローのテスト方法
- [開発者ガイド](../workflows/DEVELOPER_GUIDE.md) - テスト作成のベストプラクティス
