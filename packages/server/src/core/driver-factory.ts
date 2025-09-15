import type { AIDriver } from '@moduler-prompt/driver';
import { TestDriver, EchoDriver } from '@moduler-prompt/driver';
import { DriverRegistry, type DriverSelectionCriteria, type DriverCapability } from '@moduler-prompt/utils';

// ドライバーファクトリの型定義（coreのものと同じ）
export type DriverFactory = (capabilities: {
  model: 'fast' | 'standard' | 'large';
  temperature?: number;
  maxTokens?: number;
}) => AIDriver | Promise<AIDriver>;

/**
 * DriverRegistryのシングルトンインスタンス
 */
let driverRegistry: DriverRegistry | null = null;

/**
 * DriverRegistryを取得（シングルトン）
 */
function getDriverRegistry(): DriverRegistry {
  if (!driverRegistry) {
    driverRegistry = new DriverRegistry();
  }
  return driverRegistry;
}

/**
 * ドライバーファクトリを作成
 * @moduler-prompt/utilsのDriverRegistryを使用してドライバーを選択
 */
export function createDriverFactory(): DriverFactory {
  return async (capabilities) => {
    const registry = getDriverRegistry();

    // シンプルなcapabilitiesをDriverSelectionCriteriaに変換
    const criteria: DriverSelectionCriteria = {
      requiredCapabilities: [],
      preferredCapabilities: [],
    };

    // モデルサイズに基づいて能力を設定
    switch (capabilities.model) {
      case 'fast':
        criteria.requiredCapabilities?.push('fast' as DriverCapability);
        criteria.preferredCapabilities?.push('streaming' as DriverCapability);
        break;
      case 'standard':
        criteria.preferredCapabilities?.push('reasoning' as DriverCapability);
        criteria.preferredCapabilities?.push('coding' as DriverCapability);
        break;
      case 'large':
        criteria.requiredCapabilities?.push('large-context' as DriverCapability);
        criteria.preferredCapabilities?.push('reasoning' as DriverCapability);
        break;
    }

    // ドライバーを選択
    const selection = registry.selectDriver(criteria);

    if (!selection) {
      // フォールバック: テストドライバーを返す
      console.warn('No suitable driver found, using TestDriver as fallback');
      return new TestDriver({ responses: ['Test response'] });
    }

    // 選択されたドライバーを作成
    const driver = await registry.createDriver(selection.driver);

    // TODO: temperature と maxTokens を適用する方法を検討
    // 現在のDriverRegistryはドライバー作成後のオプション変更をサポートしていない

    return driver;
  };
}

/**
 * テスト用のドライバーファクトリを作成
 */
export function createTestDriverFactory(responses: string[]): DriverFactory {
  return async (_capabilities) => {
    return new TestDriver({ responses });
  };
}

/**
 * エコードライバーファクトリを作成
 */
export function createEchoDriverFactory(): DriverFactory {
  return async (_capabilities) => {
    return new EchoDriver();
  };
}