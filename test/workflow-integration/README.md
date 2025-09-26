# ワークフロー統合テスト

このディレクトリには、AI処理を含むワークフローの統合テストを配置します。

## 目的

- 生成AIを使って意図した結果が得られるかを検証
- Recorderの出力を確認し、ワークフローの動作を追跡
- 実際のWorkflowContext環境での動作確認

## AIドライバー自動選択

テストは実行環境から利用可能なAIドライバーを自動選択します：

1. **MLXドライバー優先**: 利用可能な場合は `mlx-community/gemma-3-27b-it-qat-4bit` を使用
2. **フォールバック**: MLXが利用できない場合は他の利用可能なドライバーを使用
3. **スキップ条件**: 利用可能なドライバーがない場合、テスト全体をスキップ

この仕組みにより、環境に依存せずテストを実行できます。

## テスト構造

```
test/workflow-integration/
├── README.md                          # このファイル
├── process-user-request.test.ts       # ユーザーリクエスト処理
├── ingest-input.test.ts              # データ取り込み処理
├── analyze-issue-impact.test.ts      # Issue影響分析
├── extract-knowledge.test.ts         # 知識抽出
└── helpers/
    ├── mock-driver.ts                 # 構造化出力対応のMockDriver
    ├── test-context.ts                # テスト用Context生成
    └── recorder-assertions.ts        # Recorder検証用ヘルパー
```

## テストの特徴

### 1. AI処理の実行
- TestDriverまたはMockDriverを使用
- 構造化出力（structuredOutput）のテスト
- プロンプトの妥当性検証

### 2. Recorder出力の検証
- 各ステップのログ記録確認
- RecordTypeの適切な使用
- タイムスタンプとworkflowNameの自動付与

### 3. イベント駆動の検証
- 発行されるイベントの種類と内容
- イベントの順序
- ペイロードの妥当性

## 実行方法

```bash
# 全ワークフロー統合テストを実行
npm test test/workflow-integration

# 特定のワークフローのみ
npm test test/workflow-integration/process-user-request.test.ts

# Recorderの出力を表示しながら実行
npm test test/workflow-integration -- --reporter=verbose
```

## Mock vs 実DB

### 現在の方針: Mockを使用
- **理由**: テストの高速化と独立性
- Storage操作は最小限のMockで代替
- AI処理はMockDriverで制御

### 将来的な検討事項
- 実DBを使用したE2Eテストの追加
- Fixtureデータの管理
- テスト実行時間とのバランス

## 開発ガイドライン

### 新しいワークフローテストの追加

1. `test/workflow-integration/[workflow-name].test.ts`を作成
2. 以下の観点でテストケースを設計:
   - 正常系: 意図した分類・処理
   - 異常系: エラーハンドリング
   - 境界値: 曖昧な入力の処理
   - Recorder: ログ出力の検証

3. MockDriverの応答を設定:
```typescript
const mockDriver = new MockDriver({
  responses: {
    'process-user-request': {
      structuredOutput: {
        requestType: 'issue',
        // ...
      }
    }
  }
});
```

4. Recorderの検証:
```typescript
const logs = recorder.getBuffer();
expectLogSequence(logs, [
  { type: RecordType.INFO, message: /開始/ },
  { type: RecordType.DEBUG, message: /検索/ },
  // ...
]);
```

## 注意事項

- テストは独立して実行可能であること
- 外部サービスへの依存を避ける
- Recorderのバッファは各テスト後にクリアする
- AI応答の再現性を保つため、Mockを使用