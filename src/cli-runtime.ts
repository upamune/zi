import { basename } from "node:path";
import type { CliArgs } from "./cli.js";
import type { ToolName } from "./tools/index.js";

export type OutputMode = "text" | "json" | "rpc";

export function resolveOutputMode(args: Pick<CliArgs, "mode" | "print">): OutputMode {
	if (args.print) {
		return "text";
	}
	return args.mode;
}

export function applyApiKeyOverride(
	provider: string,
	apiKey: string | null,
	env: NodeJS.ProcessEnv = process.env
): void {
	if (!apiKey) {
		return;
	}
	if (provider === "anthropic") {
		env.ANTHROPIC_API_KEY = apiKey;
		return;
	}
	if (provider === "openai") {
		env.OPENAI_API_KEY = apiKey;
		return;
	}
	if (provider === "kimi") {
		env.KIMI_API_KEY = apiKey;
	}
}

export interface SessionResolutionInput {
	session: string | null;
	resume: boolean;
	continue: boolean;
	availableSessions: string[];
}

export interface SessionResolution {
	sessionId: string | null;
	shouldResume: boolean;
}

export function resolveSession(input: SessionResolutionInput): SessionResolution {
	const shouldResume = input.resume || input.continue;
	if (input.session) {
		return {
			sessionId: normalizeSession(input.session),
			shouldResume,
		};
	}
	if (!shouldResume) {
		return {
			sessionId: null,
			shouldResume: false,
		};
	}
	const lastSession = input.availableSessions[input.availableSessions.length - 1] ?? null;
	return {
		sessionId: lastSession,
		shouldResume: true,
	};
}

function normalizeSession(value: string): string {
	const name = basename(value);
	if (name.endsWith(".db")) {
		return name.slice(0, -3);
	}
	return name;
}

const TOOL_NAMES: ToolName[] = ["read", "write", "edit", "bash"];
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high"] as const;

export interface ToolSelectionResult {
	enabledTools: ToolName[];
}

export function resolveToolSelection(
	args: Pick<CliArgs, "tools" | "noTools">
): ToolSelectionResult {
	if (args.noTools && args.tools) {
		throw new Error("Cannot use --tools and --no-tools together");
	}
	if (args.noTools) {
		return { enabledTools: [] };
	}
	if (!args.tools) {
		return { enabledTools: [...TOOL_NAMES] };
	}
	const selected = args.tools
		.split(",")
		.map((tool) => tool.trim())
		.filter((tool) => tool.length > 0);
	if (selected.length === 0) {
		throw new Error("--tools must include at least one tool name");
	}
	const invalid = selected.filter((tool) => !TOOL_NAMES.includes(tool as ToolName));
	if (invalid.length > 0) {
		throw new Error(`Invalid tool name(s): ${invalid.join(", ")}`);
	}
	return {
		enabledTools: [...new Set(selected)] as ToolName[],
	};
}

export function resolveThinkingLevel(
	thinking: CliArgs["thinking"]
): "off" | "minimal" | "low" | "medium" | "high" | null {
	if (!thinking) {
		return null;
	}
	if (!THINKING_LEVELS.includes(thinking)) {
		throw new Error(
			`Invalid thinking level: ${thinking}. Must be one of: ${THINKING_LEVELS.join(", ")}`
		);
	}
	return thinking;
}

export function filterModels(models: string[], patterns: string | null): string[] {
	if (!patterns) {
		return models;
	}
	const entries = patterns
		.split(",")
		.map((pattern) => pattern.trim())
		.filter((pattern) => pattern.length > 0);
	if (entries.length === 0) {
		return models;
	}
	return models.filter((model) =>
		entries.some((entry) => matchPattern(model.toLowerCase(), entry.toLowerCase()))
	);
}

function matchPattern(value: string, pattern: string): boolean {
	if (pattern === "*") {
		return true;
	}
	if (!pattern.includes("*")) {
		return value.includes(pattern);
	}
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
	const regex = new RegExp(`^${escaped}$`);
	return regex.test(value);
}
