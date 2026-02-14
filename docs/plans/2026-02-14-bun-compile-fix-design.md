# bun build --compile の修正設計

## 背景

`bun build --compile` で standalone バイナリを生成する際に2つの問題がある:

1. **エントリポイントが間違っている**: `release.yml` と `package.json` が `src/cli.ts` を指しているが、`cli.ts` は関数を export するだけで何も実行しない。実際のエントリポイントは `src/index.ts`
2. **native binding が compile に非対応**: `agentfs-sdk` が依存する `@tursodatabase/database` が NAPI-RS native binding (`.node` ファイル) を使用しており、`bun build --compile` でバンドルできない (oven-sh/bun #15374)

## 解決策

`bun:sqlite` (Bun 内蔵 SQLite) のアダプタを作成し、`agentfs-sdk` の browser export (`openWith(db)`) に渡す。

### 選定理由

| 案 | 評価 |
|---|---|
| WASM 版 turso | Bun 非互換 (emnapi Worker API) |
| postinstall パッチ | 脆い、turso 更新で壊れる |
| .node を横に配布 | single-file でなくなる |
| **bun:sqlite アダプタ** | **外部依存ゼロ、Bun 内蔵で最速、PoC 成功済み** |

### PoC 結果

- ランタイム (`bun run`): OK
- compile (`bun build --compile --target=bun-darwin-arm64`): OK
- agentfs-sdk の fs, kv, tools すべて動作確認済み

## 変更内容

### 1. `src/db/bun-sqlite-adapter.ts` (新規)

`bun:sqlite` を `agentfs-sdk` の `DatabasePromise` インターフェースに合わせるアダプタ。

agentfs-sdk が使うメソッド:
- `prepare(sql)` → Statement (`run`, `get`, `all`, `close`)
- `close()` → `Promise<void>`
- `connect()` → `Promise<void>` (no-op)
- `transaction(fn)` → トランザクションラッパー
- `pragma(source)` → PRAGMA 実行

Statement メソッド:
- `run(...params)` → `Promise<{ changes, lastInsertRowid }>`
- `get(...params)` → `Promise<row | undefined>`
- `all(...params)` → `Promise<row[]>`
- `close()` → `void`
- `raw()`, `pluck()`, `safeIntegers()`, `columns()`, `bind()` — 互換用スタブ

agentfs-sdk 内部で `db.exec(sql)` を多用しているが、`bun:sqlite` の `db.run(sql)` で代替する。

### 2. `src/agent/session.ts` (変更)

Before:
```ts
import { AgentFS, type Filesystem, type KvStore, type ToolCalls } from "agentfs-sdk";
const agentfs = await AgentFS.open({ path });
```

After:
```ts
import { BunSqliteAdapter } from "../db/bun-sqlite-adapter.js";
// type import のみ (runtime に影響しない)
import type { Filesystem, KvStore, ToolCalls } from "agentfs-sdk";
// browser export を dynamic import (native binding 不要)
const { AgentFS } = await import("agentfs-sdk/dist/index_browser.js");

const db = new BunSqliteAdapter(path);
const agentfs = await AgentFS.openWith(db);
```

### 3. `package.json` (変更)

- `bin.zi`: `./src/cli.ts` → `./src/index.ts`
- `scripts.dev`: `bun run src/cli.ts` → `bun run src/index.ts`
- `scripts.build`: `./src/cli.ts` → `./src/index.ts`

### 4. `.github/workflows/release.yml` (変更)

- Build binary ステップのエントリポイント: `./src/cli.ts` → `./src/index.ts`

## テスト計画

1. `bun run src/index.ts --help` で help が表示される
2. `bun run src/index.ts --version` でバージョンが表示される
3. `bun build ./src/index.ts --compile --target=bun-darwin-arm64 --outfile dist/zi` で compile 成功
4. `./dist/zi --help` で compiled バイナリの動作確認
5. `bun test` で既存テストが通る

## リスク

- `agentfs-sdk` の browser export path (`agentfs-sdk/dist/index_browser.js`) は internal path であり、パッケージ更新で変わる可能性がある。正式な export path が追加されれば移行する
- `bun:sqlite` と turso native binding で SQL 互換性の差異がある可能性 (実用上は問題なし、PoC で確認済み)
