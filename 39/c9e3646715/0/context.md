# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# zi: AgentFS CoW オーバーレイでリアルファイルシステムにアクセス可能にする

## Context

`zi` はコーディングエージェント CLI だが、現在エージェントがリアルファイルシステムを一切見えない。

**根本原因:**
- `just-bash` がデフォルトの `InMemoryFs`（空）で起動 → `ls` が空
- `read/write/edit` ツールが AgentFS の SQLite FS を使用 → DB が空なのでファイルが読め...

### Prompt 2

すごい！これagent でファイルの書き込みとか編集したやつを実際に反映したいときはどうすればいいの??

### Prompt 3

1 はどんな感じになる?? Ctrl-D で終了した時にこのセッションの変更をapply するためのコマンドが表示されてる感じかな?

### Prompt 4

実装しよう

### Prompt 5

この設計、仕組みを docs/ ディレクトリに残してください

### Prompt 6

check, commit, push, create a pr

