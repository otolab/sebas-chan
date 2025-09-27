# AI・プロンプト統合ドキュメント

sebas-chanシステムのAI処理とプロンプト管理に関する文書です。

## 📚 ドキュメント一覧

| ドキュメント | 内容 | 対象読者 |
|------------|------|---------|
| [MODULER_PROMPT_GUIDE.md](MODULER_PROMPT_GUIDE.md) | Moduler Prompt利用ガイド | ワークフロー開発者 |

## 🎯 今後追加予定

- **AI_DRIVERS.md** - AIドライバー仕様と選択基準
- **PROMPT_PATTERNS.md** - 効果的なプロンプトパターン集

## 🤖 AI処理の原則

### Moduler Promptの重要概念

1. **PromptModuleは静的**
   - 関数外で定義
   - ローカル変数を参照しない
   - コンパイル時に動的値を解決

2. **3大セクション構造**
   - instructions: 静的指示
   - data: 動的データ
   - output: 出力定義

3. **セキュリティモデル**
   - ユーザーデータと指示を分離
   - プロンプトインジェクション対策

### AIドライバーのCapability

| Capability | 説明 | 用途 |
|-----------|------|------|
| structured | 構造化出力対応 | JSON応答 |
| fast | 高速応答 | リアルタイム処理 |
| japanese | 日本語特化 | 日本語処理 |
| reasoning | 推論・思考特化 | 複雑な分析 |

## 🔗 関連ドキュメント

- [ワークフロー開発](../workflows/DEVELOPER_GUIDE.md) - AI処理の実装方法
- [システム設計](../design/) - 全体アーキテクチャ