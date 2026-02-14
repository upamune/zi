import { describe, expect, test } from "bun:test";
import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
	describe("positional prompt arguments", () => {
		test("should parse single word prompt", () => {
			const result = parseCliArgs(["hello"]);
			expect(result.prompt).toBe("hello");
		});

		test("should join multiple positional arguments as prompt", () => {
			const result = parseCliArgs(["write", "a", "test"]);
			expect(result.prompt).toBe("write a test");
		});

		test("should return null when no prompt provided", () => {
			const result = parseCliArgs([]);
			expect(result.prompt).toBeNull();
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
		test("should parse --resume with value", () => {
			const result = parseCliArgs(["--resume", "abc123"]);
			expect(result.resume).toBe("abc123");
		});

		test("should parse -r short flag with value", () => {
			const result = parseCliArgs(["-r", "xyz789"]);
			expect(result.resume).toBe("xyz789");
		});

		test("should default resume to null", () => {
			const result = parseCliArgs([]);
			expect(result.resume).toBeNull();
		});

		test("should combine resume with prompt", () => {
			const result = parseCliArgs(["--resume", "session1", "continue work"]);
			expect(result.resume).toBe("session1");
			expect(result.prompt).toBe("continue work");
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
			const result = parseCliArgs(["-c", "-r", "session42", "keep working"]);
			expect(result.continue).toBe(true);
			expect(result.resume).toBe("session42");
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
				resume: null,
				provider: null,
				model: null,
				noSession: false,
				print: false,
				help: false,
				prompt: null,
			});
		});
	});
});
