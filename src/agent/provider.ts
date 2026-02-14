import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { type ModelMessage, type StreamTextResult, streamText } from "ai";
import type { Config } from "@/config/index.js";

export type ProviderName = "anthropic" | "openai" | "kimi";

export interface StreamTextOptions {
	messages: ModelMessage[];
	systemPrompt?: string;
}

export interface LLMProvider {
	name: ProviderName;
	model: string;
	streamText(options: StreamTextOptions): Promise<StreamTextResult<never, never>>;
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
