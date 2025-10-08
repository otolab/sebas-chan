# 統合テスト改善計画

## 現状分析（2025-10-07）

### 良好な点
統合テストは既に適切に実装されています：

1. **実際のコンポーネント使用**
   - ✅ DBClient: 実際のインスタンスを使用（`test/integration/setup.ts`）
   - ✅ CoreAgent: 実際のインスタンスを使用
   - ✅ 共有DB接続: 効率的な接続管理実装済み

2. **AIService準備済み**
   - ✅ `test/integration/setup-ai.js`でcapability-driven実装
   - ✅ プラットフォーム依存の処理対応

### 改善可能な点

#### 1. ワークフローexecutorでのAIDriver活用
現在のテストコード例：
```typescript
const testWorkflow = {
  name: 'TestWorkflow',
  executor: vi.fn().mockImplementation(async (event, context) => {
    // モック実装
  })
};
```

改善案：
```typescript
import { setupAIService } from './setup-ai.js';
import { TestDriver } from '@moduler-prompt/driver';

const aiService = await setupAIService();
const driver = aiService
  ? await aiService.createDriverFromCapabilities(['structured'])
  : new TestDriver({ responses: [...] });

const testWorkflow = {
  name: 'TestWorkflow',
  executor: async (event, context) => {
    const result = await driver.generate({
      prompt: 'Process the event',
      context: { event, state: context.state }
    });
    return { success: true, output: result };
  }
};
```

#### 2. WorkflowContextでのAIDriver提供
現在のWorkflowContext実装にAIDriverファクトリーを追加：

```typescript
class WorkflowContext {
  async createDriver(criteria) {
    const aiService = await setupAIService();
    if (aiService) {
      return aiService.createDriverFromCapabilities(
        criteria.capabilities || ['structured'],
        { preferLocal: true, lenient: true }
      );
    }
    // フォールバック
    return new TestDriver({ responses: [] });
  }
}
```

## 実装優先度

### Phase 1: 現状維持（完了）
統合テストは既に適切に実装されているため、緊急の修正は不要。

### Phase 2: AIDriver活用（オプション）
より現実的なテストのため、以下を検討：
1. ワークフローexecutorでTestDriverまたは実AIドライバー使用
2. WorkflowContextにcreateDriverメソッド実装
3. 環境に応じたドライバー選択（CI環境ではTestDriver、ローカルでは実ドライバー）

## 結論

当初懸念していた「統合テストが全てモック」という問題は存在しませんでした。
現在の統合テストは適切に実装されており、実際のコンポーネント間の連携を検証しています。

今後の改善としては、AIServiceのcapability-driven機能をより活用することで、
さらに現実的なテストシナリオを実現できます。

## 参考ファイル
- `test/integration/setup.ts` - DB接続の共有管理
- `test/integration/setup-ai.js` - AIService設定
- `test/integration/engine-agent.test.ts` - 統合テストの良い例
- `test/integration/scheduler/natural-language-driver.integration.test.ts` - AIDriver使用例