# npm workspacesとTypeScript Project References設定ガイド

## 概要

このガイドは、npm workspacesとTypeScript Project Referencesを正しく連携させ、モノレポ環境でビルドキャッシュが適切に機能するための設定方法を解説します。

## 核心概念：二つの依存関係グラフ

モノレポには二つの独立した依存関係グラフが存在します：

1. **ランタイムグラフ** - npm workspacesが管理（package.json）
2. **コンパイルタイムグラフ** - TypeScript Project Referencesが管理（tsconfig.json）

これらの同期が崩れると、ビルドキャッシュが正しく機能しなくなります。

## 設定手順

### 1. ルートレベルの設定

#### package.json（ルート）
```json
{
  "name": "my-monorepo",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "tsc --build --verbose",
    "clean": "tsc --build --clean"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

**重要ポイント**：
- `private: true` - ルートパッケージの誤公開を防止
- `workspaces` - npm workspacesを有効化
- 開発ツールはルートのdevDependenciesに統一

#### tsconfig.base.json（ルート）
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",

    // Project References用の必須設定
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true
  }
}
```

#### tsconfig.json（ルート）
```json
{
  "files": [],
  "include": [],
  "references": [
    { "path": "packages/shared" },
    { "path": "packages/app" }
  ]
}
```

**重要ポイント**：
- `files`と`include`は空配列
- `references`にすべてのパッケージをリスト

### 2. パッケージレベルの設定

#### ライブラリパッケージ（packages/shared）

**package.json**
```json
{
  "name": "@my-org/shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc --build --verbose"
  }
}
```

**tsconfig.json**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "references": []
}
```

#### アプリケーションパッケージ（packages/app）

**package.json**
```json
{
  "name": "@my-org/app",
  "version": "1.0.0",
  "main": "dist/index.js",
  "dependencies": {
    "@my-org/shared": "*"
  },
  "scripts": {
    "build": "tsc --build --verbose"
  }
}
```

**tsconfig.json**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../shared" }
  ]
}
```

**最重要**：`dependencies`と`references`が完全に対応していること！

### ⚠️ npmとpnpm/yarnの違いに注意

**npm workspacesでの依存関係指定**：
- ✅ `"@my-org/shared": "*"` - 正しい（npmで使用可能）
- ❌ `"@my-org/shared": "workspace:*"` - エラー（pnpm/yarn専用）
- ❌ `"@my-org/shared": "workspaces:*"` - エラー（存在しない記法）

**エラー例**：
```
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspaces:": workspaces:*
```

このエラーが出た場合は、`"workspace:*"`または`"workspaces:*"`を`"*"`に修正してください。

## 運用上の注意事項

### npm installの実行場所

**必ずルートディレクトリで実行**：
```bash
# 正しい
cd /path/to/monorepo
npm install

# 間違い（個別パッケージ内での実行）
cd packages/app
npm install  # これは依存関係グラフを破壊する
```

### 依存関係の追加

**-wフラグを使用して特定ワークスペースに追加**：
```bash
# packages/appにexpressを追加
npm install express -w @my-org/app

# packages/sharedにlodashを追加
npm install lodash -w @my-org/shared
```

### 新規パッケージ追加時のチェックリスト

1. [ ] パッケージディレクトリを作成
2. [ ] package.jsonを作成（name, main, types を適切に設定）
3. [ ] tsconfig.jsonを作成（extends, composite を設定）
4. [ ] ルートのtsconfig.jsonのreferencesに追加
5. [ ] ルートでnpm installを実行
6. [ ] 依存する他パッケージのtsconfig.jsonのreferencesを更新

### 依存関係追加時の同期手順

1. **package.jsonに依存関係を追加**
   ```bash
   npm install @my-org/utils -w @my-org/app
   ```

2. **tsconfig.jsonのreferencesを更新**
   ```json
   // packages/app/tsconfig.json
   {
     "references": [
       { "path": "../shared" },
       { "path": "../utils" }  // 追加
     ]
   }
   ```

3. **ビルドして確認**
   ```bash
   npm run build
   ```

## トラブルシューティング

### ビルドキャッシュが更新されない

**原因**: package.jsonとtsconfig.jsonの依存関係が非同期
**解決**:
1. 各パッケージのdependenciesを確認
2. 対応するtsconfig.jsonのreferencesが存在することを確認
3. `tsc --build --clean`でキャッシュをクリア後、再ビルド

### モジュールが見つからないエラー

**原因**: npm workspacesのシンボリックリンクが作成されていない
**解決**:
1. ルートディレクトリで`npm install`を実行
2. node_modules内にシンボリックリンクが存在することを確認

### 型定義が参照できない

**原因**: composite: trueまたはdeclaration: trueが設定されていない
**解決**: 参照されるパッケージのtsconfig.jsonに両設定があることを確認

## 自動化ツール

### 依存関係の同期を自動化

```bash
# @monorepo-utils/workspaces-to-typescript-project-referencesを使用
npm install -D @monorepo-utils/workspaces-to-typescript-project-references

# package.jsonからtsconfig.jsonのreferencesを自動生成
npx workspaces-to-typescript-project-references
```

pre-commitフックに組み込むことで、常に同期を保つことができます。

## まとめ

npm workspacesとTypeScript Project Referencesの連携において最も重要なのは：

1. **package.jsonを唯一の信頼できる情報源とする**
2. **tsconfig.jsonのreferencesは常にpackage.jsonの依存関係を反映**
3. **npm操作は必ずルートディレクトリで実行**
4. **-wフラグを使って特定ワークスペースを指定**

これらの原則を守ることで、安定したモノレポ環境を構築できます。