import type { ModelMessage } from "ai";
import type { ToolName, ToolRegistry } from "@/tools/index.js";
import { createProvider, type LLMProvider } from "./provider.js";
import type { Session } from "./session.js";

export interface AgentConfig {
	systemPrompt?: string;
	maxRetries?: number;
	maxToolIterations?: number;
}

export interface AgentOptions {
	session: Session;
	tools: ToolRegistry;
	provider: LLMProvider;
	config?: AgentConfig;
}

export interface AgentResponse {
	content: string;
	toolCalls?: Array<{
		name: string;
		args: Record<string, unknown>;
		result?: unknown;
	}>;
}

export interface ToolCallResult {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	result: unknown;
}

export class Agent {
	private session: Session;
	private tools: ToolRegistry;
	private provider: LLMProvider;
	private config: AgentConfig;
	private messages: ModelMessage[] = [];
	private abortController: AbortController | null = null;

	constructor(options: AgentOptions) {
		this.session = options.session;
		this.tools = options.tools;
		this.provider = options.provider;
		this.config = options.config ?? {};
	}

	abort(): void {
		if (this.abortController) {
			this.abortController.abort();
		}
	}

	async prompt(message: string, signal?: AbortSignal): Promise<AgentResponse> {
		this.messages.push({ role: "user", content: message });

		this.abortController = new AbortController();
		const combinedSignal = signal
			? AbortSignal.any([signal, this.abortController.signal])
			: this.abortController.signal;

		const maxRetries = this.config.maxRetries ?? 3;
		const maxToolIterations = this.config.maxToolIterations ?? 10;
		let retries = 0;
		let content = "";
		const allToolCalls: AgentResponse["toolCalls"] = [];

		while (retries < maxRetries) {
			try {
				let iteration = 0;

				while (iteration < maxToolIterations) {
					if (combinedSignal.aborted) {
						throw new Error("Aborted");
					}

					const stream = await this.provider.streamText({
						messages: this.messages,
						systemPrompt: this.config.systemPrompt,
						abortSignal: combinedSignal,
					});

					let iterationContent = "";
					const toolCalls: ToolCallResult[] = [];

					for await (const chunk of stream.textStream) {
						if (combinedSignal.aborted) {
							throw new Error("Aborted");
						}
						iterationContent += chunk;
					}

					const result = await stream;
					const calls = (await result.toolCalls) ?? [];

					if (calls.length === 0) {
						content = iterationContent;
						this.messages.push({ role: "assistant", content: iterationContent });
						this.abortController = null;
						return { content, toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined };
					}

					const toolInvocations = [];

					for (const call of calls) {
						if (combinedSignal.aborted) {
							throw new Error("Aborted");
						}

						const toolName = call.toolName as ToolName;
						const tool = this.tools.get(toolName);

						if (!tool) {
							throw new Error(`Unknown tool: ${toolName}`);
						}

						const toolArgs = "input" in call ? (call.input as Record<string, unknown>) : {};
						const toolResult = await tool.execute(toolArgs);

						const toolCallId = call.toolCallId ?? `${toolName}-${Date.now()}`;
						toolCalls.push({
							toolCallId,
							toolName,
							args: toolArgs,
							result: toolResult,
						});

						allToolCalls.push({
							name: toolName,
							args: toolArgs,
							result: toolResult,
						});

						toolInvocations.push({
							toolCallId,
							toolName,
							args: toolArgs,
							state: "result" as const,
							result: toolResult,
						});
					}

					this.messages.push({
						role: "assistant",
						content: iterationContent,
						toolInvocations,
					} as ModelMessage);

					iteration++;
				}

				content = "Max tool iterations reached";
				this.messages.push({ role: "assistant", content });
				this.abortController = null;
				return { content, toolCalls: allToolCalls };
			} catch (error) {
				if (combinedSignal.aborted) {
					this.abortController = null;
					throw new Error("Aborted");
				}
				retries++;
				if (retries >= maxRetries) {
					this.abortController = null;
					throw error;
				}
				await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
			}
		}

		this.abortController = null;
		throw new Error("Max retries exceeded");
	}

	getMessages(): ModelMessage[] {
		return [...this.messages];
	}

	clearMessages(): void {
		this.messages = [];
	}
}

export async function createAgent(
	session: Session,
	tools: ToolRegistry,
	config?: { provider?: LLMProvider; systemPrompt?: string }
): Promise<Agent> {
	const provider =
		config?.provider ??
		createProvider(await import("@/config/index.js").then((m) => m.DEFAULT_CONFIG));

	return new Agent({
		session,
		tools,
		provider,
		config: {
			systemPrompt: config?.systemPrompt,
		},
	});
}
