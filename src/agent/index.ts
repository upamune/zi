import type { ModelMessage } from "ai";
import { getToolDefinitions } from "@/tools/definitions.js";
import type { ToolName, ToolRegistry } from "@/tools/index.js";
import { createProvider, type LLMProvider } from "./provider.js";
import type { Session } from "./session.js";
import type { SessionTreeNode } from "./session-types.js";

export interface AgentConfig {
	systemPrompt?: string;
	resolveSystemPromptAppendix?: (message: string) => string | Promise<string>;
	maxRetries?: number;
	maxToolIterations?: number;
	enabledTools?: ToolName[];
	thinking?: "off" | "minimal" | "low" | "medium" | "high";
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

export type StreamEvent =
	| { type: "text"; text: string }
	| { type: "reasoning"; text: string }
	| { type: "tool-call-start"; toolName: string; args: Record<string, unknown> }
	| { type: "tool-call-end"; toolName: string; args: Record<string, unknown> };

export interface ToolCallResult {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	result: unknown;
}

function getToolArgs(call: unknown): Record<string, unknown> {
	if (!call || typeof call !== "object") {
		return {};
	}

	const maybeCall = call as { input?: unknown; args?: unknown };
	if (maybeCall.input && typeof maybeCall.input === "object") {
		return maybeCall.input as Record<string, unknown>;
	}
	if (maybeCall.args && typeof maybeCall.args === "object") {
		return maybeCall.args as Record<string, unknown>;
	}
	return {};
}

export class Agent {
	private session: Session;
	private tools: ToolRegistry;
	private provider: LLMProvider;
	private config: AgentConfig;
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

	async prompt(
		message: string,
		signal?: AbortSignal,
		onEvent?: (event: StreamEvent) => void
	): Promise<AgentResponse> {
		this.session.sessionManager.appendMessage({
			role: "user",
			content: message,
		});
		const systemPromptAppendix = this.config.resolveSystemPromptAppendix
			? await this.config.resolveSystemPromptAppendix(message)
			: "";

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

					const context = this.session.sessionManager.buildSessionContext();
					const messages = context.messages;

					const stream = await this.provider.streamText({
						messages,
						systemPrompt: buildPromptWithThinking(this.config, systemPromptAppendix),
						abortSignal: combinedSignal,
						tools: getToolDefinitions(
							this.config.enabledTools ?? ["read", "write", "edit", "bash"]
						),
					});

					let iterationContent = "";
					const toolCalls: ToolCallResult[] = [];

					for await (const part of stream.fullStream) {
						if (combinedSignal.aborted) {
							throw new Error("Aborted");
						}
						switch (part.type) {
							case "text-delta":
								iterationContent += part.text;
								onEvent?.({ type: "text", text: part.text });
								break;
							case "reasoning-delta":
								onEvent?.({ type: "reasoning", text: part.text });
								break;
						}
					}

					const result = await stream;
					const calls = (await result.toolCalls) ?? [];

					if (calls.length === 0) {
						content = iterationContent;
						this.session.sessionManager.appendMessage({
							role: "assistant",
							content: iterationContent,
							provider: this.provider.name,
							model: this.provider.model,
						});
						this.abortController = null;
						return { content, toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined };
					}

					for (const call of calls) {
						if (combinedSignal.aborted) {
							throw new Error("Aborted");
						}

						const toolName = call.toolName as ToolName;
						const tool = this.tools.get(toolName);

						if (!tool) {
							throw new Error(`Unknown tool: ${toolName}`);
						}

						const toolArgs = getToolArgs(call);
						onEvent?.({ type: "tool-call-start", toolName, args: toolArgs });
						const toolResult = await tool.execute(toolArgs);
						onEvent?.({ type: "tool-call-end", toolName, args: toolArgs });

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
					}

					this.session.sessionManager.appendMessage({
						role: "assistant",
						content: iterationContent,
						provider: this.provider.name,
						model: this.provider.model,
						toolInvocations: toolCalls.map((t) => ({
							toolCallId: t.toolCallId,
							toolName: t.toolName,
							args: t.args,
							state: "result" as const,
							result: t.result,
						})),
					});

					for (const tc of toolCalls) {
						this.session.sessionManager.appendMessage({
							role: "tool",
							content: JSON.stringify(tc.result),
							toolInvocations: [
								{
									toolCallId: tc.toolCallId,
									toolName: tc.toolName,
									args: tc.args,
									state: "result" as const,
									result: tc.result,
								},
							],
						});
					}

					iteration++;
				}

				content = "Max tool iterations reached";
				this.session.sessionManager.appendMessage({
					role: "assistant",
					content,
					provider: this.provider.name,
					model: this.provider.model,
				});
				this.abortController = null;
				return { content, toolCalls: allToolCalls };
			} catch (error) {
				if (combinedSignal.aborted) {
					this.abortController = null;
					throw new Error("Aborted");
				}
				if (isNonRetryableError(error)) {
					this.abortController = null;
					throw error;
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
		return this.session.sessionManager.buildSessionContext().messages;
	}

	clearMessages(): void {
		this.session.sessionManager.resetLeaf();
	}

	branchFrom(entryId: string): void {
		this.session.sessionManager.branch(entryId);
	}

	getSessionTree(): SessionTreeNode[] {
		return this.session.sessionManager.getTree();
	}

	getCurrentLeafId(): string | null {
		return this.session.sessionManager.getLeafId();
	}
}

const NON_RETRYABLE_ERROR_NAMES = new Set(["AI_LoadAPIKeyError", "MissingApiKeyError"]);

export function isNonRetryableError(error: unknown): boolean {
	if (error instanceof Error && NON_RETRYABLE_ERROR_NAMES.has(error.name)) {
		return true;
	}
	return false;
}

function buildPromptWithThinking(config: AgentConfig, appendix: string = ""): string | undefined {
	if (!config.systemPrompt) {
		return undefined;
	}
	const fullPrompt = appendix ? `${config.systemPrompt}\n\n${appendix}` : config.systemPrompt;
	if (!config.thinking || config.thinking === "off") {
		return fullPrompt;
	}
	return `${fullPrompt}\n\nThinking level: ${config.thinking}`;
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
