import type { ModelMessage } from "ai";
import type { ToolName, ToolRegistry } from "@/tools/index.js";
import { createProvider, type LLMProvider } from "./provider.js";
import type { Session } from "./session.js";

export interface AgentConfig {
	systemPrompt?: string;
	maxRetries?: number;
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

export class Agent {
	private session: Session;
	private tools: ToolRegistry;
	private provider: LLMProvider;
	private config: AgentConfig;
	private messages: ModelMessage[] = [];

	constructor(options: AgentOptions) {
		this.session = options.session;
		this.tools = options.tools;
		this.provider = options.provider;
		this.config = options.config ?? {};
	}

	async prompt(message: string): Promise<AgentResponse> {
		this.messages.push({ role: "user", content: message });

		const maxRetries = this.config.maxRetries ?? 3;
		let retries = 0;

		while (retries < maxRetries) {
			try {
				const stream = await this.provider.streamText(this.messages);

				let content = "";
				const toolCalls: AgentResponse["toolCalls"] = [];

				for await (const chunk of stream.textStream) {
					content += chunk;
				}

				const result = await stream;
				const calls = (await result.toolCalls) ?? [];

				if (calls.length > 0) {
					for (const call of calls) {
						const toolName = call.toolName as ToolName;
						const tool = this.tools.get(toolName);

						if (!tool) {
							throw new Error(`Unknown tool: ${toolName}`);
						}

						const toolArgs = "input" in call ? (call.input as Record<string, unknown>) : {};
						const toolResult = await tool.execute(toolArgs);
						toolCalls.push({
							name: toolName,
							args: toolArgs,
							result: toolResult,
						});
					}
				}

				this.messages.push({ role: "assistant", content });

				return { content, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
			} catch (error) {
				retries++;
				if (retries >= maxRetries) {
					throw error;
				}
				await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
			}
		}

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
