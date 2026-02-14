import { describe, expect, test } from "bun:test";
import {
	applyApiKeyOverride,
	filterModels,
	MissingApiKeyError,
	resolveOutputMode,
	resolveSession,
	resolveThinkingLevel,
	resolveToolSelection,
	validateApiKey,
} from "../src/cli-runtime.js";

describe("cli-runtime", () => {
	describe("resolveOutputMode", () => {
		test("should keep explicit mode when print is false", () => {
			expect(resolveOutputMode({ mode: "json", print: false })).toBe("json");
		});

		test("should force text mode when print is true", () => {
			expect(resolveOutputMode({ mode: "rpc", print: true })).toBe("text");
		});
	});

	describe("applyApiKeyOverride", () => {
		test("should set anthropic key", () => {
			const env: NodeJS.ProcessEnv = {};
			applyApiKeyOverride("anthropic", "ant-key", env);
			expect(env.ANTHROPIC_API_KEY).toBe("ant-key");
		});

		test("should set openai key", () => {
			const env: NodeJS.ProcessEnv = {};
			applyApiKeyOverride("openai", "oa-key", env);
			expect(env.OPENAI_API_KEY).toBe("oa-key");
		});

		test("should set kimi key", () => {
			const env: NodeJS.ProcessEnv = {};
			applyApiKeyOverride("kimi", "kimi-key", env);
			expect(env.KIMI_API_KEY).toBe("kimi-key");
		});
	});

	describe("resolveSession", () => {
		test("should use explicit session id", () => {
			const resolved = resolveSession({
				session: "abc123",
				resume: false,
				continue: false,
				availableSessions: [],
			});
			expect(resolved).toEqual({
				sessionId: "abc123",
				shouldResume: false,
			});
		});

		test("should pick latest session when resume is true", () => {
			const resolved = resolveSession({
				session: null,
				resume: true,
				continue: false,
				availableSessions: ["one", "two"],
			});
			expect(resolved).toEqual({
				sessionId: "two",
				shouldResume: true,
			});
		});

		test("should normalize .db session input", () => {
			const resolved = resolveSession({
				session: "/tmp/foo/bar.db",
				resume: true,
				continue: false,
				availableSessions: [],
			});
			expect(resolved).toEqual({
				sessionId: "bar",
				shouldResume: true,
			});
		});
	});

	describe("resolveToolSelection", () => {
		test("should return all tools by default", () => {
			expect(resolveToolSelection({ tools: null, noTools: false }).enabledTools).toEqual([
				"read",
				"write",
				"edit",
				"bash",
			]);
		});

		test("should return empty list when noTools is true", () => {
			expect(resolveToolSelection({ tools: null, noTools: true }).enabledTools).toEqual([]);
		});

		test("should parse selected tools", () => {
			expect(resolveToolSelection({ tools: "read,bash", noTools: false }).enabledTools).toEqual([
				"read",
				"bash",
			]);
		});

		test("should reject invalid combinations", () => {
			expect(() => resolveToolSelection({ tools: "read", noTools: true })).toThrow(
				"Cannot use --tools and --no-tools together"
			);
		});
	});

	describe("resolveThinkingLevel", () => {
		test("should allow valid level", () => {
			expect(resolveThinkingLevel("minimal")).toBe("minimal");
		});

		test("should return null when omitted", () => {
			expect(resolveThinkingLevel(null)).toBeNull();
		});

		test("should reject invalid level", () => {
			expect(() => resolveThinkingLevel("max" as "off")).toThrow("Invalid thinking level: max");
		});
	});

	describe("validateApiKey", () => {
		test("should pass when key is set", () => {
			const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: "sk-test" };
			expect(() => validateApiKey("anthropic", env)).not.toThrow();
		});

		test("should throw MissingApiKeyError when anthropic key is missing", () => {
			const env: NodeJS.ProcessEnv = {};
			expect(() => validateApiKey("anthropic", env)).toThrow(MissingApiKeyError);
		});

		test("should throw MissingApiKeyError when openai key is missing", () => {
			const env: NodeJS.ProcessEnv = {};
			expect(() => validateApiKey("openai", env)).toThrow(MissingApiKeyError);
		});

		test("should throw MissingApiKeyError when kimi key is missing", () => {
			const env: NodeJS.ProcessEnv = {};
			expect(() => validateApiKey("kimi", env)).toThrow(MissingApiKeyError);
		});

		test("should not throw for unknown provider", () => {
			const env: NodeJS.ProcessEnv = {};
			expect(() => validateApiKey("unknown-provider", env)).not.toThrow();
		});

		test("error message should contain env var name", () => {
			const env: NodeJS.ProcessEnv = {};
			try {
				validateApiKey("anthropic", env);
			} catch (error) {
				expect((error as Error).message).toContain("ANTHROPIC_API_KEY");
			}
		});
	});

	describe("filterModels", () => {
		test("should keep all models when no pattern", () => {
			expect(filterModels(["gpt-4o", "o3-mini"], null)).toEqual(["gpt-4o", "o3-mini"]);
		});

		test("should support wildcard matching", () => {
			expect(filterModels(["gpt-4o", "o3-mini"], "gpt-*")).toEqual(["gpt-4o"]);
		});

		test("should support contains matching", () => {
			expect(filterModels(["claude-sonnet-4-5", "gpt-4o"], "sonnet")).toEqual([
				"claude-sonnet-4-5",
			]);
		});
	});
});
