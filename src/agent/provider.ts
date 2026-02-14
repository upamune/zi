import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { type ModelMessage, type StreamTextResult, streamText, type ToolSet } from "ai";
import type { Config } from "@/config/index.js";

export type ProviderName = "anthropic" | "openai" | "kimi";

const MODEL_CATALOG: Record<ProviderName, string[]> = {
	anthropic: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-3-5"],
	openai: ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "o3-mini"],
	kimi: ["moonshot-v1-8k", "moonshot-v1-32k", "kimi-k2-0905-preview"],
};

export interface StreamTextOptions {
	messages: ModelMessage[];
	systemPrompt?: string;
	abortSignal?: AbortSignal;
	tools?: ToolSet;
}

export interface LLMProvider {
	name: ProviderName;
	model: string;
	streamText(options: StreamTextOptions): Promise<StreamTextResult<ToolSet, never>>;
}

const KIMI_BASE_URL = "https://api.moonshot.cn/v1";

function createAnthropicProvider(model: string): LLMProvider {
	return {
		name: "anthropic",
		model,
		async streamText(options: StreamTextOptions) {
			return streamText({
				model: anthropic(model),
				messages: options.messages,
				system: options.systemPrompt,
				abortSignal: options.abortSignal,
				tools: options.tools,
			});
		},
	};
}

function createOpenAIProvider(model: string): LLMProvider {
	return {
		name: "openai",
		model,
		async streamText(options: StreamTextOptions) {
			return streamText({
				model: openai(model),
				messages: options.messages,
				system: options.systemPrompt,
				abortSignal: options.abortSignal,
				tools: options.tools,
			});
		},
	};
}

function createKimiProvider(model: string): LLMProvider {
	const kimi = createOpenAI({
		baseURL: KIMI_BASE_URL,
	});
	return {
		name: "kimi",
		model,
		async streamText(options: StreamTextOptions) {
			return streamText({
				model: kimi(model),
				messages: options.messages,
				system: options.systemPrompt,
				abortSignal: options.abortSignal,
				tools: options.tools,
			});
		},
	};
}

export function createProvider(config: Config): LLMProvider {
	switch (config.provider) {
		case "anthropic":
			return createAnthropicProvider(config.model);
		case "openai":
			return createOpenAIProvider(config.model);
		case "kimi":
			return createKimiProvider(config.model);
		default:
			throw new Error(`Unknown provider: ${config.provider}`);
	}
}

export function getModelsByProvider(provider: ProviderName): string[] {
	return [...MODEL_CATALOG[provider]];
}
