import { parseArgs } from "node:util";
import { NAME, VERSION } from "./config/index.js";

export interface CliCommand {
	name: "install" | "remove" | "update" | "list" | "config" | "apply" | "browse" | "skill";
	action?: "list" | "enable" | "disable" | "on" | "off";
	source: string | null;
	local: boolean;
}

export interface CliArgs {
	continue: boolean;
	resume: boolean;
	mode: "text" | "json" | "rpc";
	apiKey: string | null;
	session: string | null;
	sessionDir: string | null;
	tools: string | null;
	noTools: boolean;
	skills: string[];
	noSkills: boolean;
	thinking: "off" | "minimal" | "low" | "medium" | "high" | null;
	listModels: boolean;
	models: string | null;
	provider: string | null;
	model: string | null;
	systemPrompt: string | null;
	appendSystemPrompt: string | null;
	noSession: boolean;
	print: boolean;
	help: boolean;
	version: boolean;
	prompt: string | null;
	promptArgs: string[];
	command: CliCommand | null;
}

export function parseCliArgs(args: string[] = process.argv.slice(2)): CliArgs {
	const { values, positionals } = parseArgs({
		args,
		options: {
			continue: {
				type: "boolean",
				short: "c",
				default: false,
			},
			resume: {
				type: "boolean",
				short: "r",
				default: false,
			},
			mode: {
				type: "string",
				default: "text",
			},
			"api-key": {
				type: "string",
			},
			session: {
				type: "string",
			},
			"session-dir": {
				type: "string",
			},
			tools: {
				type: "string",
			},
			"no-tools": {
				type: "boolean",
				default: false,
			},
			skill: {
				type: "string",
				multiple: true,
			},
			"no-skills": {
				type: "boolean",
				default: false,
			},
			thinking: {
				type: "string",
			},
			"list-models": {
				type: "boolean",
				default: false,
			},
			models: {
				type: "string",
			},
			provider: {
				type: "string",
			},
			model: {
				type: "string",
			},
			"system-prompt": {
				type: "string",
			},
			"append-system-prompt": {
				type: "string",
			},
			"no-session": {
				type: "boolean",
				default: false,
			},
			print: {
				type: "boolean",
				short: "p",
				default: false,
			},
			help: {
				type: "boolean",
				short: "h",
				default: false,
			},
			version: {
				type: "boolean",
				short: "v",
				default: false,
			},
			local: {
				type: "boolean",
				short: "l",
				default: false,
			},
		},
		allowPositionals: true,
	});

	const command = parseCommand(positionals, values.local);
	const promptArgs = command ? [] : [...positionals];
	const prompt = promptArgs.length > 0 ? promptArgs.join(" ") : null;

	return {
		continue: values.continue,
		resume: values.resume,
		mode: values.mode as "text" | "json" | "rpc",
		apiKey: values["api-key"] ?? null,
		session: values.session ?? null,
		sessionDir: values["session-dir"] ?? null,
		tools: values.tools ?? null,
		noTools: values["no-tools"],
		skills: values.skill ?? [],
		noSkills: values["no-skills"],
		thinking:
			(values.thinking as "off" | "minimal" | "low" | "medium" | "high" | undefined) ?? null,
		listModels: values["list-models"],
		models: values.models ?? null,
		provider: values.provider ?? null,
		model: values.model ?? null,
		systemPrompt: values["system-prompt"] ?? null,
		appendSystemPrompt: values["append-system-prompt"] ?? null,
		noSession: values["no-session"],
		print: values.print,
		help: values.help,
		version: values.version,
		prompt,
		promptArgs,
		command,
	};
}

function parseCommand(positionals: string[], local: boolean): CliCommand | null {
	const name = positionals[0];
	if (
		!name ||
		!["install", "remove", "update", "list", "config", "apply", "browse", "skill"].includes(name)
	) {
		return null;
	}
	if (name === "skill") {
		const action = positionals[1] ?? "list";
		if (!["list", "enable", "disable", "on", "off"].includes(action)) {
			throw new Error(`skill action must be one of: list, enable, disable, on, off`);
		}
		const source = positionals[2] ?? null;
		if ((action === "enable" || action === "disable") && !source) {
			throw new Error(`skill ${action} requires <name>`);
		}
		return {
			name: "skill",
			action: action as CliCommand["action"],
			source,
			local,
		};
	}
	const source = positionals[1] ?? null;
	if ((name === "install" || name === "remove" || name === "apply") && !source) {
		throw new Error(`${name} requires <source>`);
	}
	return {
		name: name as CliCommand["name"],
		source,
		local,
	};
}

export function printHelp(): void {
	console.log(`${NAME} v${VERSION} - A minimal, fully-trackable coding agent

USAGE:
  xi [OPTIONS] [PROMPT]
  xi <COMMAND> [ARGS]

COMMANDS:
  install <source> [-l, --local]
  remove <source> [-l, --local]
  update [source]
  list
  config
  skill [list|enable|disable|on|off] [name] [-l, --local]
  apply <session-id>            Apply file changes from a session to disk
  browse                        Browse sessions in a web UI

OPTIONS:
  -c, --continue      Continue from last session
  -r, --resume        Resume an existing session
  --mode <MODE>       Output mode (text, json, rpc)
  --api-key <KEY>     Override provider API key
  --session <ID>      Session ID to load or create
  --session-dir <DIR> Session directory root
  --tools <LIST>      Enable only selected tools (comma-separated)
  --no-tools          Disable all tools
  --skill <NAME>      Enable only selected skills (repeatable)
  --no-skills         Disable all skills for this run
  --thinking <LEVEL>  Thinking level (off, minimal, low, medium, high)
  --list-models       List models for selected provider
  --models <PATTERNS> Comma-separated model filter patterns
  --provider <NAME>   LLM provider (anthropic, openai, kimi)
  --model <MODEL>     Model to use
  --system-prompt <TEXT>         Replace default system prompt
  --append-system-prompt <TEXT>  Append instructions to system prompt
  --no-session        Run without creating a session
  -p, --print         Print mode (non-interactive, output only)
  -h, --help          Show this help message
  -v, --version       Show version information

EXAMPLES:
  xi "Write a hello world program"
  xi @prompt.md
  cat request.txt | xi --mode json
  xi -c "Add error handling"
  xi --provider openai --model gpt-4 "Explain this code"
  xi --resume --session abc123 "Continue from session"
  xi --list-models --provider anthropic
  xi install github:owner/repo
  xi skill enable qmd
`);
}

export function printVersion(): void {
	console.log(`${NAME} v${VERSION}`);
}
