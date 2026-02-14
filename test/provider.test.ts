import { describe, expect, test } from "bun:test";
import { createProvider } from "../src/agent/provider.js";
import type { Config } from "../src/config/index.js";

describe("Provider", () => {
	describe("createProvider", () => {
		test("should create anthropic provider", () => {
			const config: Config = {
				provider: "anthropic",
				model: "claude-sonnet-4-5",
				thinking: "medium",
			};

			const provider = createProvider(config);

			expect(provider.name).toBe("anthropic");
			expect(provider.model).toBe("claude-sonnet-4-5");
			expect(provider.streamText).toBeDefined();
			expect(typeof provider.streamText).toBe("function");
		});

		test("should create openai provider", () => {
			const config: Config = {
				provider: "openai",
				model: "gpt-4",
				thinking: "medium",
			};

			const provider = createProvider(config);

			expect(provider.name).toBe("openai");
			expect(provider.model).toBe("gpt-4");
			expect(provider.streamText).toBeDefined();
			expect(typeof provider.streamText).toBe("function");
		});

		test("should create kimi provider", () => {
			const config: Config = {
				provider: "kimi",
				model: "moonshot-v1-8k",
				thinking: "medium",
			};

			const provider = createProvider(config);

			expect(provider.name).toBe("kimi");
			expect(provider.model).toBe("moonshot-v1-8k");
			expect(provider.streamText).toBeDefined();
			expect(typeof provider.streamText).toBe("function");
		});

		test("should throw for unknown provider", () => {
			const config = {
				provider: "unknown" as "anthropic",
				model: "test",
				thinking: "medium" as const,
			};

			expect(() => createProvider(config as Config)).toThrow("Unknown provider: unknown");
		});

		test("should support different anthropic models", () => {
			const config: Config = {
				provider: "anthropic",
				model: "claude-3-opus",
				thinking: "medium",
			};

			const provider = createProvider(config);
			expect(provider.model).toBe("claude-3-opus");
		});

		test("should support different openai models", () => {
			const config: Config = {
				provider: "openai",
				model: "gpt-4o",
				thinking: "medium",
			};

			const provider = createProvider(config);
			expect(provider.model).toBe("gpt-4o");
		});

		test("should support different kimi models", () => {
			const config: Config = {
				provider: "kimi",
				model: "moonshot-v1-32k",
				thinking: "medium",
			};

			const provider = createProvider(config);
			expect(provider.model).toBe("moonshot-v1-32k");
		});
	});
});
