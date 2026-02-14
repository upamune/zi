export interface BuildSystemPromptOptions {
	customPrompt?: string;
	appendSystemPrompt?: string;
	cwd?: string;
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
	read: "Read file contents",
	write: "Create or overwrite files",
	edit: "Edit files by exact-text replacement",
	bash: "Execute shell commands",
};

export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
	const cwd = options.cwd ?? process.cwd();
	const now = new Date().toISOString();
	const tools = Object.entries(TOOL_DESCRIPTIONS)
		.map(([name, description]) => `- ${name}: ${description}`)
		.join("\n");

	let prompt =
		options.customPrompt ??
		`You are an expert coding assistant operating inside zi, a coding agent harness.

Available tools:
${tools}

Guidelines:
- Use read before edit when you need context
- Use edit for focused changes and write for full-file writes
- Use bash for inspection and commands that tools do not cover
- Be concise and explicit about changed file paths`;

	if (options.appendSystemPrompt) {
		prompt += `\n\n${options.appendSystemPrompt}`;
	}

	prompt += `\n\nCurrent date and time: ${now}`;
	prompt += `\nCurrent working directory: ${cwd}`;

	return prompt;
}
