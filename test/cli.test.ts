import { describe, expect, test } from "bun:test";
import { parseCliArgs, printHelp, printVersion } from "../src/cli.js";
import { NAME, VERSION } from "../src/config/index.js";

describe("parseCliArgs", () => {
	describe("subcommands", () => {
		test("should parse install command", () => {
			const result = parseCliArgs(["install", "github:owner/repo"]);
			expect(result.command).toEqual({
				name: "install",
				source: "github:owner/repo",
				local: false,
			});
		});

		test("should parse remove command with local flag", () => {
			const result = parseCliArgs(["remove", "github:owner/repo", "--local"]);
			expect(result.command).toEqual({
				name: "remove",
				source: "github:owner/repo",
				local: true,
			});
		});

		test("should parse update command without source", () => {
			const result = parseCliArgs(["update"]);
			expect(result.command).toEqual({
				name: "update",
				source: null,
				local: false,
			});
		});

		test("should parse list command", () => {
			const result = parseCliArgs(["list"]);
			expect(result.command).toEqual({
				name: "list",
				source: null,
				local: false,
			});
		});

		test("should throw when install source is missing", () => {
			expect(() => parseCliArgs(["install"])).toThrow("install requires <source>");
		});
	});

	describe("positional prompt arguments", () => {
		test("should parse single word prompt", () => {
			const result = parseCliArgs(["hello"]);
			expect(result.prompt).toBe("hello");
			expect(result.promptArgs).toEqual(["hello"]);
		});

		test("should join multiple positional arguments as prompt", () => {
			const result = parseCliArgs(["write", "a", "test"]);
			expect(result.prompt).toBe("write a test");
			expect(result.promptArgs).toEqual(["write", "a", "test"]);
		});

		test("should return null when no prompt provided", () => {
			const result = parseCliArgs([]);
			expect(result.prompt).toBeNull();
			expect(result.promptArgs).toEqual([]);
		});
	});

	describe("--print/-p flag", () => {
		test("should parse --print flag", () => {
			const result = parseCliArgs(["--print"]);
			expect(result.print).toBe(true);
		});

		test("should parse -p short flag", () => {
			const result = parseCliArgs(["-p"]);
			expect(result.print).toBe(true);
		});

		test("should default print to false", () => {
			const result = parseCliArgs([]);
			expect(result.print).toBe(false);
		});

		test("should combine print with prompt", () => {
			const result = parseCliArgs(["--print", "do something"]);
			expect(result.print).toBe(true);
			expect(result.prompt).toBe("do something");
		});
	});

	describe("--continue/-c flag", () => {
		test("should parse --continue flag", () => {
			const result = parseCliArgs(["--continue"]);
			expect(result.continue).toBe(true);
		});

		test("should parse -c short flag", () => {
			const result = parseCliArgs(["-c"]);
			expect(result.continue).toBe(true);
		});

		test("should default continue to false", () => {
			const result = parseCliArgs([]);
			expect(result.continue).toBe(false);
		});

		test("should combine continue with prompt", () => {
			const result = parseCliArgs(["-c", "add tests"]);
			expect(result.continue).toBe(true);
			expect(result.prompt).toBe("add tests");
		});
	});

	describe("--resume/-r flag", () => {
		test("should parse --resume flag", () => {
			const result = parseCliArgs(["--resume"]);
			expect(result.resume).toBe(true);
		});

		test("should parse -r short flag", () => {
			const result = parseCliArgs(["-r"]);
			expect(result.resume).toBe(true);
		});

		test("should default resume to false", () => {
			const result = parseCliArgs([]);
			expect(result.resume).toBe(false);
		});

		test("should combine resume with prompt", () => {
			const result = parseCliArgs(["--resume", "continue work"]);
			expect(result.resume).toBe(true);
			expect(result.prompt).toBe("continue work");
		});
	});

	describe("--mode flag", () => {
		test("should parse --mode json", () => {
			const result = parseCliArgs(["--mode", "json"]);
			expect(result.mode).toBe("json");
		});

		test("should default mode to text", () => {
			const result = parseCliArgs([]);
			expect(result.mode).toBe("text");
		});
	});

	describe("--api-key flag", () => {
		test("should parse --api-key flag", () => {
			const result = parseCliArgs(["--api-key", "test-key"]);
			expect(result.apiKey).toBe("test-key");
		});

		test("should default apiKey to null", () => {
			const result = parseCliArgs([]);
			expect(result.apiKey).toBeNull();
		});
	});

	describe("--session and --session-dir flags", () => {
		test("should parse --session flag", () => {
			const result = parseCliArgs(["--session", "abc123"]);
			expect(result.session).toBe("abc123");
		});

		test("should parse --session-dir flag", () => {
			const result = parseCliArgs(["--session-dir", "/tmp/zi"]);
			expect(result.sessionDir).toBe("/tmp/zi");
		});

		test("should default session and sessionDir to null", () => {
			const result = parseCliArgs([]);
			expect(result.session).toBeNull();
			expect(result.sessionDir).toBeNull();
		});
	});

	describe("--tools and --no-tools flags", () => {
		test("should parse --tools flag", () => {
			const result = parseCliArgs(["--tools", "read,write"]);
			expect(result.tools).toBe("read,write");
		});

		test("should parse --no-tools flag", () => {
			const result = parseCliArgs(["--no-tools"]);
			expect(result.noTools).toBe(true);
		});

		test("should default tools flags", () => {
			const result = parseCliArgs([]);
			expect(result.tools).toBeNull();
			expect(result.noTools).toBe(false);
		});
	});

	describe("--thinking flag", () => {
		test("should parse --thinking flag", () => {
			const result = parseCliArgs(["--thinking", "low"]);
			expect(result.thinking).toBe("low");
		});

		test("should default thinking to null", () => {
			const result = parseCliArgs([]);
			expect(result.thinking).toBeNull();
		});
	});

	describe("--list-models and --models flags", () => {
		test("should parse --list-models flag", () => {
			const result = parseCliArgs(["--list-models"]);
			expect(result.listModels).toBe(true);
		});

		test("should parse --models flag", () => {
			const result = parseCliArgs(["--models", "gpt-*"]);
			expect(result.models).toBe("gpt-*");
		});

		test("should default model listing flags", () => {
			const result = parseCliArgs([]);
			expect(result.listModels).toBe(false);
			expect(result.models).toBeNull();
		});
	});

	describe("--provider flag", () => {
		test("should parse --provider flag", () => {
			const result = parseCliArgs(["--provider", "openai"]);
			expect(result.provider).toBe("openai");
		});

		test("should default provider to null", () => {
			const result = parseCliArgs([]);
			expect(result.provider).toBeNull();
		});

		test("should support anthropic provider", () => {
			const result = parseCliArgs(["--provider", "anthropic"]);
			expect(result.provider).toBe("anthropic");
		});

		test("should support kimi provider", () => {
			const result = parseCliArgs(["--provider", "kimi"]);
			expect(result.provider).toBe("kimi");
		});
	});

	describe("--model flag", () => {
		test("should parse --model flag", () => {
			const result = parseCliArgs(["--model", "gpt-4"]);
			expect(result.model).toBe("gpt-4");
		});

		test("should default model to null", () => {
			const result = parseCliArgs([]);
			expect(result.model).toBeNull();
		});

		test("should combine provider and model", () => {
			const result = parseCliArgs(["--provider", "openai", "--model", "gpt-4o"]);
			expect(result.provider).toBe("openai");
			expect(result.model).toBe("gpt-4o");
		});
	});

	describe("--no-session flag", () => {
		test("should parse --no-session flag", () => {
			const result = parseCliArgs(["--no-session"]);
			expect(result.noSession).toBe(true);
		});

		test("should default noSession to false", () => {
			const result = parseCliArgs([]);
			expect(result.noSession).toBe(false);
		});
	});

	describe("--help/-h flag", () => {
		test("should parse --help flag", () => {
			const result = parseCliArgs(["--help"]);
			expect(result.help).toBe(true);
		});

		test("should parse -h short flag", () => {
			const result = parseCliArgs(["-h"]);
			expect(result.help).toBe(true);
		});

		test("should default help to false", () => {
			const result = parseCliArgs([]);
			expect(result.help).toBe(false);
		});
	});

	describe("--version/-v flag", () => {
		test("should parse --version flag", () => {
			const result = parseCliArgs(["--version"]);
			expect(result.version).toBe(true);
		});

		test("should parse -v short flag", () => {
			const result = parseCliArgs(["-v"]);
			expect(result.version).toBe(true);
		});

		test("should default version to false", () => {
			const result = parseCliArgs([]);
			expect(result.version).toBe(false);
		});
	});

	describe("complex flag combinations", () => {
		test("should parse all flags together", () => {
			const result = parseCliArgs([
				"-c",
				"-p",
				"--provider",
				"anthropic",
				"--model",
				"claude-3",
				"--no-session",
				"write code",
			]);
			expect(result.continue).toBe(true);
			expect(result.print).toBe(true);
			expect(result.provider).toBe("anthropic");
			expect(result.model).toBe("claude-3");
			expect(result.noSession).toBe(true);
			expect(result.prompt).toBe("write code");
		});

		test("should handle flags before and after prompt", () => {
			const result = parseCliArgs(["-p", "test something", "--provider", "kimi"]);
			expect(result.print).toBe(true);
			expect(result.provider).toBe("kimi");
			expect(result.prompt).toBe("test something");
		});

		test("should handle continue with resume", () => {
			const result = parseCliArgs(["-c", "-r", "keep working"]);
			expect(result.continue).toBe(true);
			expect(result.resume).toBe(true);
			expect(result.prompt).toBe("keep working");
		});

		test("should handle print mode with all options", () => {
			const result = parseCliArgs([
				"--print",
				"--provider",
				"openai",
				"--model",
				"gpt-4",
				"analyze this code",
			]);
			expect(result.print).toBe(true);
			expect(result.provider).toBe("openai");
			expect(result.model).toBe("gpt-4");
			expect(result.prompt).toBe("analyze this code");
		});
	});

	describe("defaults", () => {
		test("should return all defaults for empty args", () => {
			const result = parseCliArgs([]);
			expect(result).toEqual({
				continue: false,
				resume: false,
				mode: "text",
				apiKey: null,
				session: null,
				sessionDir: null,
				tools: null,
				noTools: false,
				thinking: null,
				listModels: false,
				models: null,
				provider: null,
				model: null,
				systemPrompt: null,
				appendSystemPrompt: null,
				noSession: false,
				print: false,
				help: false,
				version: false,
				prompt: null,
				promptArgs: [],
				command: null,
			});
		});
	});
});

describe("help and version output", () => {
	test("should lock help output format", () => {
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (value?: unknown) => {
			logs.push(String(value ?? ""));
		};
		try {
			printHelp();
		} finally {
			console.log = originalLog;
		}

		expect(logs).toEqual([
			`${NAME} v${VERSION} - A minimal, fully-trackable coding agent

USAGE:
  zi [OPTIONS] [PROMPT]
  zi <COMMAND> [ARGS]

COMMANDS:
  install <source> [-l, --local]
  remove <source> [-l, --local]
  update [source]
  list
  config
  apply <session-id>            Apply file changes from a session to disk

OPTIONS:
  -c, --continue      Continue from last session
  -r, --resume        Resume an existing session
  --mode <MODE>       Output mode (text, json, rpc)
  --api-key <KEY>     Override provider API key
  --session <ID>      Session ID to load or create
  --session-dir <DIR> Session directory root
  --tools <LIST>      Enable only selected tools (comma-separated)
  --no-tools          Disable all tools
  --thinking <LEVEL>  Thinking level (off, minimal, low, medium, high)
  --list-models       List models for selected provider
  --models <PATTERNS> Comma-separated model filter patterns
  --provider <NAME>   LLM provider (anthropic, openai, kimi)
  --model <MODEL>     Model to use
  --system-prompt <TEXT>         Replace default system prompt
  --append-system-prompt <TEXT>  Append instructions to system prompt
  --no-session        Run without creating a session
  -p, --print         Print mode (non-interactive, output only)
  -h, --help          Show this help message
  -v, --version       Show version information

EXAMPLES:
  zi "Write a hello world program"
  zi @prompt.md
  cat request.txt | zi --mode json
  zi -c "Add error handling"
  zi --provider openai --model gpt-4 "Explain this code"
  zi --resume --session abc123 "Continue from session"
  zi --list-models --provider anthropic
  zi install github:owner/repo
`,
		]);
	});

	test("should lock version output format", () => {
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = (value?: unknown) => {
			logs.push(String(value ?? ""));
		};
		try {
			printVersion();
		} finally {
			console.log = originalLog;
		}

		expect(logs).toEqual([`${NAME} v${VERSION}`]);
	});
});
