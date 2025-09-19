# sebas-chan ビルドワークフロー改善策

## 現在の問題点

### 0. npm workspacesでの依存関係記法の誤り
- `"workspace:*"`や`"workspaces:*"`はpnpm/yarn専用の記法
- npmでは`"*"`を使用する必要がある
- 誤った記法を使用すると`npm error code EUNSUPPORTEDPROTOCOL`エラーが発生

### 1. TypeScriptビルドキャッシュの問題
- `.tsbuildinfo`ファイルが古い状態をキャッシュして、新しい型定義を認識しない
- shared-typesの変更が他パッケージに反映されない

### 2. npm cleanスクリプトの問題
- `npm run clean`がnode_modulesも削除してしまう（package.json:23）
- これによりworkspacesのシンボリックリンクが破壊される

### 3. ビルド順序の問題
- shared-typesが最初にビルドされる必要があるが、他パッケージがキャッシュを使用してビルドに失敗する

## 改善策

### 1. cleanスクリプトの修正

**現在（問題あり）:**
```json
"clean": "npm run clean --workspaces --if-present && rm -rf node_modules"
```

**修正後:**
```json
"clean": "npm run clean --workspaces --if-present",
"clean:all": "npm run clean && rm -rf node_modules",
"clean:cache": "find . -name '*.tsbuildinfo' -delete"
```

### 2. ビルドスクリプトの改善

**修正後のpackage.json（ルート）:**
```json
{
  "scripts": {
    "build": "npm run build:clean-cache && npm run build:all",
    "build:all": "npm run build -w @sebas-chan/shared-types && npm run build --workspaces --if-present",
    "build:clean-cache": "find . -name '*.tsbuildinfo' -delete",
    "build:force": "npm run clean && npm run build:clean-cache && npm run build:all",
    "clean": "npm run clean --workspaces --if-present",
    "clean:all": "npm run clean && rm -rf node_modules",
    "clean:cache": "find . -name '*.tsbuildinfo' -delete",
    "prebuild": "npm run build:clean-cache"
  }
}
```

### 3. 推奨ワークフロー

#### 通常のビルド
```bash
npm run build
```
- tsbuildinfo キャッシュをクリア
- shared-typesを最初にビルド
- 他のパッケージを順次ビルド

#### 完全クリーンビルド
```bash
npm run build:force
```
- dist/ディレクトリをクリーン
- tsbuildinfo キャッシュを削除
- フルビルドを実行

#### node_modules再構築が必要な場合
```bash
npm run clean:all
npm install
npm run build
```

### 4. CI/CD用の設定

```yaml
# GitHub Actions例
- name: Install dependencies
  run: npm ci

- name: Clean TypeScript cache
  run: npm run clean:cache

- name: Build
  run: npm run build

- name: Test
  run: npm test
```

### 5. pre-pushフック用スクリプト

`.husky/pre-push`または`scripts/pre-push.sh`:
```bash
#!/bin/bash

echo "🔍 Running pre-push checks..."

# TypeScriptキャッシュをクリア
echo "📝 Cleaning TypeScript cache..."
npm run clean:cache

# 型チェック
echo "📝 Type checking..."
npm run typecheck

# テスト
echo "🧪 Running tests..."
npm test

echo "✅ Pre-push checks passed!"
```

## 即座に実行すべき修正

1. package.jsonのcleanスクリプトを修正
2. build:clean-cacheスクリプトを追加
3. ビルド前にキャッシュクリアを実行するようにする

これにより、TypeScriptのキャッシュ問題を回避しつつ、効率的なビルドワークフローを実現できます。