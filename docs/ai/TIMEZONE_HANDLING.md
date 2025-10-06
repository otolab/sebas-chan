# AIとのタイムゾーン処理に関する指針

## 概要

生成AIはタイムゾーンの変換計算を苦手とするため、sebas-chanでは**タイムゾーン変換を生成AIに期待しない**設計方針を採用しています。

## 基本原則

### 1. 単一タイムゾーンでの処理
- **入力と出力のタイムゾーンを統一する**
- タイムゾーン変換はアプリケーション側で行う
- AIには変換済みの時刻を渡し、同じタイムゾーンで返答を受け取る

### 2. 明示的なタイムゾーン指定
- プロンプトには必ずタイムゾーンを明記する
- 例：「日本時間（JST）」「UTC」など
- ISO8601形式でもタイムゾーン情報を明示

## 実装例

### 良い例：JST統一

```typescript
const promptModule: PromptModule<ScheduleContext> = {
  instructions: [
    'あなたはスケジュール解析器です。',
    (ctx) => {
      const jstTime = new Date(ctx.currentTime.getTime() + 9 * 60 * 60 * 1000);
      return `現在時刻（日本時間）: ${jstTime.toISOString().replace('Z', '+09:00').substring(0, 19)}`;
    },
    'タイムゾーン: 日本時間（JST, UTC+9）',
    '次回実行時刻を日本時間のISO8601形式で返してください。',
    'タイムゾーン変換は行わず、日本時間のまま返してください。'
  ]
};
```

### 悪い例：タイムゾーン変換を期待

```typescript
// ❌ 避けるべき実装
const promptModule = {
  instructions: [
    `現在時刻（UTC）: ${now.toISOString()}`,
    'ユーザーのタイムゾーン: Asia/Tokyo',
    '日本時間で「明日の午後3時」を計算してUTCで返してください。' // AIに変換を期待
  ]
};
```

## テスト実装での注意点

### AIの返答の解釈

```typescript
// AIはJST形式（タイムゾーン情報なし）で返す
const parsed = result.structuredOutput || JSON.parse(result.content);
// 例: "2025-10-05T15:00:00"

// JSTとして解釈する
const nextTimeJST = new Date(parsed.next + '+09:00');
```

### 期待値との比較

```typescript
// ローカル時刻での期待値設定
const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(15, 0, 0, 0);

// 時刻の比較（両方とも同じタイムゾーン）
const diff = Math.abs(nextTimeJST.getTime() - tomorrow.getTime());
expect(diff).toBeLessThan(3600000); // 1時間以内の誤差を許容
```

## 推奨事項

1. **プロンプト設計**
   - 1つのタイムゾーンで統一する
   - タイムゾーン情報を明示的に記載
   - 変換を要求しない

2. **実装**
   - アプリケーション側でタイムゾーン変換を行う
   - AIへの入力時に変換済みの時刻を渡す
   - AIからの出力を固定タイムゾーンとして解釈

3. **テスト**
   - タイムゾーン変換の正確性はAIに期待しない
   - 誤差の許容範囲を適切に設定（1時間程度）
   - デバッグ用のログ出力を充実させる

## 関連ドキュメント

- [Moduler Prompt利用ガイド](./MODULER_PROMPT_GUIDE.md)
- [テスト戦略](../testing/STRATEGY.md)

---
**作成日**: 2025-10-05
**最終更新**: 2025-10-05