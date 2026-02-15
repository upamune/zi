# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# APIキー未設定時のエラーハンドリング改善

## Context

APIキー (ANTHROPIC_API_KEY等) が未設定の状態で zi を起動すると、Vercel AI SDK の `AI_LoadAPIKeyError` が `streamText()` 呼び出し時に発生し、スタックトレース付きの読みにくいエラーで壊れる。Agent のリトライループが設定エラーを3回リトライするため無駄な待機も発生する。

## 変更内容

### 1. APIキー存在�...

### Prompt 2

branch / commit / push / create a pr

