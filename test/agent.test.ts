import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ModelMessage, StreamTextResult } from "ai";
import { Agent, type AgentConfig } from "../src/agent/index.js";
import type { LLMProvider } from "../src/agent/provider.js";
import type { Session } from "../src/agent/session.js";
import { SessionManager } from "../src/agent/session-manager.js";
import type { ToolRegistry } from "../src/tools/index.js";

async function* asyncGenerator<T>(items: T[]): AsyncGenerator<T> {
	for (const item of items) {
		yield item;
	}
}

function createMockStreamResult(
	text: string,
	toolCalls?: Array<{ toolCallId: string; toolName: string; input?: Record<string, unknown> }>
): StreamTextResult<never, never> {
	return {
		textStream: asyncGenerator(text.split("")),
		text: Promise.resolve(text),
		toolCalls: Promise.resolve(toolCalls ?? []),
		usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
		finishReason: Promise.resolve("stop"),
	} as unknown as StreamTextResult<never, never>;
}

describe("Agent", () => {
	let mockProvider: LLMProvider;
	let mockTools: ToolRegistry;
	let mockSession: Session;
	let streamTextMock: ReturnType<typeof mock>;

	beforeEach(() => {
		streamTextMock = mock(async (_messages: ModelMessage[]) =>
			createMockStreamResult("Hello, I am the assistant.")
		);

		mockProvider = {
			name: "anthropic",
			model: "claude-sonnet-4-5",
			streamText: streamTextMock,
		};

		mockTools = {
			get: mock(() => undefined),
			register: mock(() => {}),
			list: mock(() => []),
		} as unknown as ToolRegistry;

		mockSession = {
			id: "test-session",
			path: "/test/path",
			fs: {} as Session["fs"],
			kv: {} as Session["kv"],
			tools: {} as Session["tools"],
			sessionManager: SessionManager.inMemory("/test"),
			close: mock(async () => {}),
		} as unknown as Session;
	});

	describe("constructor", () => {
		test("should create agent with required options", () => {
			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
			});

			expect(agent).toBeDefined();
		});

		test("should accept optional config", () => {
			const config: AgentConfig = {
				systemPrompt: "You are a helpful assistant",
				maxRetries: 5,
				maxToolIterations: 20,
			};

			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
				config,
			});

			expect(agent).toBeDefined();
		});
	});

	describe("prompt", () => {
		test("should return AgentResponse with content", async () => {
			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
			});

			const response = await agent.prompt("Hello");

			expect(response.content).toBe("Hello, I am the assistant.");
		});

		test("should add user message to messages", async () => {
			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
			});

			await agent.prompt("Hello");

			const messages = agent.getMessages();
			expect(messages).toHaveLength(2);
			expect(messages[0]).toEqual({ role: "user", content: "Hello" });
		});

		test("should execute tool calls and return results", async () => {
			const toolExecuteMock = mock(async () => ({ result: "success" }));
			mockTools.get = mock(() => ({
				execute: toolExecuteMock,
			})) as unknown as ReturnType<typeof mock>;

			let callCount = 0;
			streamTextMock = mock(async (_messages: ModelMessage[]) => {
				callCount++;
				if (callCount === 1) {
					return createMockStreamResult("Done", [
						{ toolCallId: "call-1", toolName: "read", input: { path: "/test.txt" } },
					]);
				}
				return createMockStreamResult("I have read the file.");
			});
			mockProvider.streamText = streamTextMock;

			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
			});

			const response = await agent.prompt("Read the file");

			expect(response.toolCalls).toBeDefined();
			expect(response.toolCalls).toHaveLength(1);
			expect(response.toolCalls?.[0]?.name).toBe("read");
			expect(response.toolCalls?.[0]?.result).toEqual({ result: "success" });
		});

		test("should retry on error", async () => {
			let callCount = 0;
			streamTextMock = mock(async (_messages: ModelMessage[]) => {
				callCount++;
				if (callCount < 3) {
					throw new Error("Temporary error");
				}
				return createMockStreamResult("Success after retries");
			});
			mockProvider.streamText = streamTextMock;

			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
				config: { maxRetries: 3 },
			});

			const response = await agent.prompt("Hello");

			expect(response.content).toBe("Success after retries");
			expect(callCount).toBe(3);
		});

		test("should throw after max retries", async () => {
			streamTextMock = mock(async (_messages: ModelMessage[]) => {
				throw new Error("Persistent error");
			});
			mockProvider.streamText = streamTextMock;

			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
				config: { maxRetries: 2 },
			});

			expect(agent.prompt("Hello")).rejects.toThrow("Persistent error");
		});

		test("should throw for unknown tool", async () => {
			mockTools.get = mock(() => undefined);

			streamTextMock = mock(async (_messages: ModelMessage[]) =>
				createMockStreamResult("Done", [
					{ toolCallId: "call-1", toolName: "unknown_tool", input: {} },
				])
			);
			mockProvider.streamText = streamTextMock;

			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
			});

			expect(agent.prompt("Use unknown tool")).rejects.toThrow("Unknown tool: unknown_tool");
		});

		test("should handle multi-turn tool execution", async () => {
			const toolExecuteMock = mock(async () => ({ data: "file content" }));
			mockTools.get = mock(() => ({
				execute: toolExecuteMock,
			})) as unknown as ReturnType<typeof mock>;

			let callCount = 0;
			streamTextMock = mock(async (_messages: ModelMessage[]) => {
				callCount++;
				if (callCount === 1) {
					return createMockStreamResult("", [
						{ toolCallId: "call-1", toolName: "read", input: { path: "/file1.txt" } },
					]);
				}
				return createMockStreamResult("I read the file");
			});
			mockProvider.streamText = streamTextMock;

			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
			});

			const response = await agent.prompt("Read the file");

			expect(response.content).toBe("I read the file");
			expect(response.toolCalls).toHaveLength(1);
		});

		test("should respect maxToolIterations", async () => {
			const toolExecuteMock = mock(async () => ({ done: false }));
			mockTools.get = mock(() => ({
				execute: toolExecuteMock,
			})) as unknown as ReturnType<typeof mock>;

			let callCount = 0;
			streamTextMock = mock(async (_messages: ModelMessage[]) => {
				callCount++;
				return createMockStreamResult("", [
					{ toolCallId: `call-${callCount}`, toolName: "loop", input: {} },
				]);
			});
			mockProvider.streamText = streamTextMock;

			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
				config: { maxToolIterations: 3 },
			});

			const response = await agent.prompt("Loop");

			expect(response.content).toBe("Max tool iterations reached");
			expect(response.toolCalls).toHaveLength(3);
		});

		test("should append thinking level to system prompt", async () => {
			const providerSpy = mock(async (options: { systemPrompt?: string }) => {
				expect(options.systemPrompt).toContain("Thinking level: high");
				return createMockStreamResult("ok");
			});

			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: {
					name: "anthropic",
					model: "claude-sonnet-4-5",
					streamText: providerSpy,
				},
				config: {
					systemPrompt: "You are a helpful assistant",
					thinking: "high",
				},
			});

			const response = await agent.prompt("Hi");
			expect(response.content).toBe("ok");
		});
	});

	describe("getMessages", () => {
		test("should return copy of messages", async () => {
			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
			});

			await agent.prompt("Hello");

			const messages1 = agent.getMessages();
			const messages2 = agent.getMessages();

			expect(messages1).not.toBe(messages2);
			expect(messages1).toEqual(messages2);
		});
	});

	describe("clearMessages", () => {
		test("should clear all messages", async () => {
			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
			});

			await agent.prompt("Hello");
			expect(agent.getMessages()).toHaveLength(2);

			agent.clearMessages();
			expect(agent.getMessages()).toHaveLength(0);
		});

		test("should allow new conversation after clear", async () => {
			const agent = new Agent({
				session: mockSession,
				tools: mockTools,
				provider: mockProvider,
			});

			await agent.prompt("First message");
			agent.clearMessages();

			await agent.prompt("Second message");

			const messages = agent.getMessages();
			expect(messages).toHaveLength(2);
			expect(messages[0]).toEqual({ role: "user", content: "Second message" });
		});
	});
});
