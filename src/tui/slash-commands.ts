export const SLASH_COMMAND_NAMES = [
	"help",
	"clear",
	"quit",
	"resume",
	"skills",
	"init",
	"plan",
] as const;

export type SlashCommandName = (typeof SLASH_COMMAND_NAMES)[number];

export interface SlashCommand {
	name: SlashCommandName;
	rawInput: string;
	args: string;
	tokens: string[];
}

interface SlashCommandSpec {
	allowWhileRunning: boolean;
}

const SLASH_COMMAND_SPECS: Record<SlashCommandName, SlashCommandSpec> = {
	help: { allowWhileRunning: true },
	clear: { allowWhileRunning: false },
	quit: { allowWhileRunning: true },
	resume: { allowWhileRunning: false },
	skills: { allowWhileRunning: false },
	init: { allowWhileRunning: false },
	plan: { allowWhileRunning: false },
};

export function parseSlashCommand(input: string): SlashCommand {
	const trimmed = input.trim();
	if (!trimmed.startsWith("/")) {
		throw new Error("Slash command must start with '/'");
	}

	const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
	if (tokens.length === 0) {
		throw new Error("Empty slash command");
	}

	const head = tokens[0];
	if (!head || !head.startsWith("/")) {
		throw new Error("Invalid slash command");
	}

	const rawName = head.slice(1).toLowerCase();
	if (!rawName) {
		throw new Error("Missing slash command name");
	}

	if (!isSlashCommandName(rawName)) {
		throw new Error(`Unknown slash command: /${rawName}`);
	}

	const argsTokens = tokens.slice(1);
	return {
		name: rawName,
		rawInput: trimmed,
		args: argsTokens.join(" "),
		tokens: argsTokens,
	};
}

export function isCommandAvailableWhileRunning(command: SlashCommand): boolean {
	return SLASH_COMMAND_SPECS[command.name].allowWhileRunning;
}

function isSlashCommandName(value: string): value is SlashCommandName {
	return SLASH_COMMAND_NAMES.includes(value as SlashCommandName);
}
