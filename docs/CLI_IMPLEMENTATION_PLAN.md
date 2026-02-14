# CLI Implementation Plan (`zi` parity with `pi`, excluding extension-flag system)

## Scope
Implement items 1-8 only:
1. --mode (text/json/rpc)
2. --api-key
3. --session / --session-dir (+ align --resume behavior)
4. --tools / --no-tools
5. --thinking
6. --list-models / --models
7. @file args + stdin ingestion
8. subcommands: install/remove/update/list/config

## Execution Rule
- Commit at the end of every phase.
- Do not batch multiple phases into one commit.
- Commit message format:
  - `phase-0: lock cli baseline tests`
  - `phase-1: add mode/api-key/session routing`
  - `phase-2: add tools/thinking/model-scope flags`
  - `phase-3: add file args and stdin ingestion`
  - `phase-4: add package/config subcommands`

## Phase 0 (Baseline Lock)
- Snapshot current help output and parse defaults
- Ensure tests prevent accidental CLI breakage
- Exit criteria:
  - tests added and passing
  - phase commit created

## Phase 1 (Core Runtime Parity)
- Add --mode and mode router
- Add --api-key provider override path
- Add --session/--session-dir and resume/session resolution logic
- Exit criteria:
  - text/json/rpc behavior covered by tests
  - api-key override tested
  - session resolution tested
  - phase commit created

## Phase 2 (Agent Controls)
- Add --tools / --no-tools with validation
- Add --thinking wiring through config/agent
- Add --list-models / --models scope selection
- Exit criteria:
  - tool filtering tested
  - thinking flag tested
  - list/models behavior tested
  - phase commit created

## Phase 3 (Input Ergonomics)
- Add @file argument ingestion
- Add stdin ingestion for non-interactive mode
- Exit criteria:
  - file arg ingestion tested
  - stdin path tested
  - phase commit created

## Phase 4 (Command Surface)
- Add subcommands:
  - install <source> [-l|--local]
  - remove <source> [-l|--local]
  - update [source]
  - list
  - config
- Exit criteria:
  - each command has tests for success and failure paths
  - help text updated
  - phase commit created

## Quality Gates (every phase)
- bun run check
- bun run test
- Keep help text and docs in sync
- Add/adjust tests for all new flags/subcommands
