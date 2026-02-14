# AGENTS.md

Coding agent instructions for the zi project.

## Project Overview

zi is a minimal, fully-trackable coding agent built with Bun + TypeScript. All operations (read/write/edit/bash) are logged to SQLite via AgentFS for complete auditability.

## Build Commands

```bash
bun run dev          # Run CLI in development mode
bun run build        # Build CLI to dist/
bun run test         # Run all tests
bun test path/to/test.ts  # Run a single test file
bun run typecheck    # Type check without emitting
bun run lint         # Check code with Biome
bun run format       # Format code with Biome
bun run check        # Format + typecheck (pre-commit hook)
```

## Code Style

### Formatting (Biome)

- **Indentation**: Tabs
- **Line width**: 100 characters
- **Quotes**: Double quotes for strings
- **Semicolons**: Always
- **Trailing commas**: ES5 style
- **No comments** unless explicitly requested

### Imports

```typescript
// External imports first (alphabetically by package name)
import { type ModelMessage, streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { AgentFS } from "agentfs-sdk";
import { Bash } from "just-bash";

// Internal imports second (use @/ alias)
import { Config, loadConfig } from "@/config/index.js";
import { Session } from "@/agent/session.js";
```

### Types

- Use TypeScript strict mode
- Prefer interfaces over types for object shapes
- Use `type` for unions, intersections, and utility types
- Always define return types for public functions
- Use `type` keyword when importing types: `import type { ... }`

```typescript
// Good
interface Session {
	id: string;
	fs: Filesystem;
	kv: KvStore;
	tools: ToolCalls;
	close(): Promise<void>;
}

type ProviderName = "anthropic" | "openai" | "kimi";

// Public function with return type
export function createSession(id: string): Promise<Session>
```

### Naming Conventions

- **Files**: lowercase with hyphens (`tool-registry.ts`)
- **Interfaces**: PascalCase (`Session`, `LLMProvider`)
- **Functions**: camelCase (`createSession`, `executeTool`)
- **Factory functions**: `create` prefix (`createToolRegistry`)
- **Constants**: SCREAMING_SNAKE_CASE (`DEFAULT_CONFIG`, `KIMI_BASE_URL`)
- **Private members**: underscore prefix (`_internal`)

### Error Handling

```typescript
// Throw descriptive errors with context
throw new Error(`Failed to read ${path}: ${result.stderr}`);

// Catch and log to AgentFS for auditability
try {
	await tool.execute(params);
} catch (error) {
	const errorMessage = error instanceof Error ? error.message : String(error);
	await tools.record("tool", startedAt, completedAt, params, undefined, errorMessage);
	throw new Error(`Tool execution failed: ${errorMessage}`);
}
```

## Project Structure

```
src/
├── index.ts           # Entry point (main())
├── cli.ts             # CLI argument parsing
├── agent/
│   ├── index.ts       # Agent class (prompt, getMessages, clearMessages)
│   ├── session.ts     # Session management (createSession, loadSession)
│   └── provider.ts    # LLM provider abstraction (createProvider)
├── tools/
│   ├── index.ts       # Tool registry (createToolRegistry)
│   ├── read.ts        # Read tool (via Just Bash)
│   ├── write.ts       # Write tool (via AgentFS)
│   ├── edit.ts        # Edit tool (read → replace → write)
│   └── bash.ts        # Bash tool (via Just Bash)
├── tui/
│   └── index.ts       # Terminal UI (pi-tui)
└── config/
    └── index.ts       # Configuration (loadConfig, saveConfig)

test/
├── read.test.ts       # Read tool tests
├── write.test.ts      # Write tool tests
├── edit.test.ts       # Edit tool tests
├── bash.test.ts       # Bash tool tests
└── ...                # More test files
```

## Key Architecture Points

1. **Tools**: All tools delegate to either Just Bash (`read`, `bash`) or AgentFS SDK (`write`). The `edit` tool reads via bash, replaces in TypeScript, then writes via AgentFS.

2. **Sessions**: Each session is a single SQLite file at `.zi/sessions/{id}.db`. Contains file system, tool logs, and key-value store.

3. **Providers**: Use Vercel AI SDK. Supported: `anthropic`, `openai`, `kimi`.

4. **Safety**: Just Bash is sandboxed with no host filesystem access. All writes go through AgentFS.

## Testing

### Test Structure

```typescript
import { describe, expect, test, beforeEach, mock } from "bun:test";

describe("ToolName", () => {
	let mockDependency: Dependency;
	let recordMock: ReturnType<typeof mock>;

	beforeEach(() => {
		recordMock = mock(async () => 1);
		mockDependency = {
			method: recordMock,
		} as unknown as Dependency;
	});

	test("should do something", async () => {
		const tool = createTool(mockDependency);
		const result = await tool.execute({ param: "value" });
		expect(result).toBe("expected");
	});

	test("should throw on error", async () => {
		mockDependency.method = mock(async () => { throw new Error("fail"); });
		const tool = createTool(mockDependency);
		expect(tool.execute({})).rejects.toThrow("fail");
	});
});
```

### Mock Patterns

```typescript
// Mock Bash with BashExecResult
mockBash = {
	exec: mock(async (): Promise<BashExecResult> => ({
		stdout: "output",
		stderr: "",
		exitCode: 0,
		env: {},
	})),
} as unknown as Bash;

// Mock Filesystem
mockFs = {
	writeFile: mock(async () => {}),
	readFile: mock(async () => Buffer.from("content")),
} as unknown as Filesystem;

// Mock ToolCalls
mockTools = {
	record: mock(async () => 1),
	start: mock(async () => 1),
	success: mock(async () => {}),
	error: mock(async () => {}),
} as unknown as ToolCalls;
```

### Test Naming

- Use descriptive test names: `"should replace single occurrence"`
- Group related tests with `describe()`: `describe("parseArgs", () => ...)`
- Test both success and error cases

## Dependencies

### Core Dependencies
- `ai` / `@ai-sdk/anthropic` / `@ai-sdk/openai` - Vercel AI SDK for LLM
- `agentfs-sdk` - SQLite-backed file system with auditability
- `just-bash` - Sandboxed bash shell
- `@mariozechner/pi-tui` - Terminal UI components

### Development Dependencies
- `@biomejs/biome` - Linting and formatting
- `typescript` - Type checking
- `bun` - Runtime and test runner

## Environment Variables

- `ZI_DIR`: Override config directory (default: `~/.zi`)
- `ANTHROPIC_API_KEY`: Anthropic API key
- `OPENAI_API_KEY`: OpenAI API key
- `KIMI_API_KEY`: Kimi API key

## Git Hooks

Pre-commit runs `bun run check` (format + typecheck).
Pre-push runs `bun run test`.

## Task Tracking (Beads)

This project uses **bd** (beads) for issue tracking.

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
bd add "Title" --priority P0 --description "Details"
```

### Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below:

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** - `bun run check` and `bun run test`
3. **Update issue status** - Close finished work with `bd close`
4. **PUSH TO REMOTE**:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- If push fails, resolve and retry until it succeeds
