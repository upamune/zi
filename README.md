# xi

A minimal, fully-trackable coding agent.

## Overview

xi is a minimal coding agent that prioritizes auditability and reproducibility. Every operation—file reads, writes, edits, and bash commands—is logged in a single SQLite database through AgentFS.

## Philosophy

**Everything is traceable.** Unlike other agents where operations scatter across filesystems and logs, xi captures everything in one place:

- Every file operation
- Every bash command
- Every tool call
- Complete timeline of agent activity

**Minimal by design.** xi provides four tools—read, write, edit, bash—and nothing more. Extensions are possible but not required.

**Safe by default.** Just Bash provides a sandboxed environment with no access to the host filesystem. AgentFS ensures all writes go through a controlled path.

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                    xi CLI                           │
│                  (Bun + TypeScript)                 │
├─────────────────────────────────────────────────────┤
│                   TUI Layer                         │
│              (@mariozechner/pi-tui)                 │
├─────────────────────────────────────────────────────┤
│               Vercel AI SDK                         │
│            (streamText, generateText)               │
├─────────────────────────────────────────────────────┤
│                    Tools                            │
│  ┌─────────┬─────────┬─────────┬─────────┐         │
│  │  read   │  write  │  edit   │  bash   │         │
│  └────┬────┴────┬────┴────┬────┴────┬────┘         │
│       │         │         │         │              │
│       └─────────┴─────────┴─────────┘              │
│                      │                              │
│                      ▼                              │
│  ┌───────────────────────────────────────┐         │
│  │           Just Bash + AgentFS         │         │
│  └───────────────────────────────────────┘         │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │   .xi/sessions/*.db     │
        │   (SQLite - 全履歴)      │
        └─────────────────────────┘
```

## Tools

| Tool | Implementation | Tracked |
|------|----------------|---------|
| `read(path, [offset], [limit])` | `cat` via Just Bash | Yes |
| `write(path, content)` | AgentFS SDK | Yes |
| `edit(path, oldText, newText)` | Read → TS replace → Write | Yes |
| `bash(command)` | Just Bash | Yes |

All operations are logged to AgentFS with timestamps, enabling full audit trails.

## Supported Providers

1. **Anthropic** - Claude models
2. **OpenAI** - GPT models
3. **Kimi** - Kimi For Coding

Additional providers can be added by extending the provider registry.

## Quick Start

### Install

```bash
mise use -g github:upamune/xi@latest
```

### Usage

```bash
# Set API key
export ANTHROPIC_API_KEY=sk-ant-...

# Start interactive session
xi
```

## Session Storage

All session data lives in `.xi/sessions/{session-id}.db`:

```
.xi/
├── sessions/
│   ├── abc123.db      # Session 1
│   └── def456.db      # Session 2
├── settings.json      # Global settings
└── AGENTS.md          # Project context
```

Each SQLite database contains:
- Complete file system state
- All bash command history
- Tool call audit log
- Timeline of all operations

## Why xi?

| Feature | xi | Other Agents |
|---------|-----|--------------|
| Auditability | Full SQL queryable history | Scattered logs |
| Reproducibility | Copy .db file, replay state | Hard to reproduce |
| Safety | Sandboxed by default | Often host access |
| Simplicity | 4 tools | Many tools/features |
| Portability | Single .db file | Multiple files/configs |

## Inspiration

xi is inspired by:
- **[pi](https://github.com/badlogic/pi-mono)** - Minimal coding agent philosophy
- **[AgentFS](https://github.com/tursodatabase/agentfs)** - SQLite-based agent filesystem
- **[Just Bash](https://github.com/vercel-labs/just-bash)** - Sandboxed bash for agents

## License

MIT
