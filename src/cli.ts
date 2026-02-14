import { parseArgs } from "node:util";
import { NAME, VERSION } from "./config/index.js";

export interface CliArgs {
	continue: boolean;
	resume: string | null;
	provider: string | null;
	model: string | null;
	noSession: boolean;
	print: boolean;
	help: boolean;
	prompt: string | null;
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
				type: "string",
				short: "r",
			},
			provider: {
				type: "string",
			},
			model: {
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
		},
		allowPositionals: true,
	});

	const prompt = positionals.length > 0 ? positionals.join(" ") : null;

	return {
		continue: values.continue,
		resume: values.resume ?? null,
		provider: values.provider ?? null,
		model: values.model ?? null,
		noSession: values["no-session"],
		print: values.print,
		help: values.help,
		prompt,
	};
}

export function printHelp(): void {
	console.log(`${NAME} v${VERSION} - A minimal, fully-trackable coding agent

USAGE:
  zi [OPTIONS] [PROMPT]

OPTIONS:
  -c, --continue      Continue from last session
  -r, --resume <ID>   Resume specific session by ID
  --provider <NAME>   LLM provider (anthropic, openai, kimi)
  --model <MODEL>     Model to use
  --no-session        Run without creating a session
  -p, --print         Print mode (non-interactive, output only)
  -h, --help          Show this help message

EXAMPLES:
  zi "Write a hello world program"
  zi -c "Add error handling"
  zi --provider openai --model gpt-4 "Explain this code"
  zi -r abc123 "Continue from session"
`);
}

export function printVersion(): void {
	console.log(`${NAME} v${VERSION}`);
}
