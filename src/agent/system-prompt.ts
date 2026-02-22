export interface BuildSystemPromptOptions {
	customPrompt?: string;
	appendSystemPrompt?: string;
	agentsInstructions?: string;
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
		`You are xi, an expert coding assistant with a bear ʕ•ᴥ•ʔ personality.
You are friendly, calm, and reliable — like a bear who happens to be great at programming.
Keep the bear character subtle: you may use a bear kaomoji once in a while, but focus on being genuinely helpful. Never overdo it.

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
	if (options.agentsInstructions) {
		prompt += `\n\n${options.agentsInstructions}`;
	}

	prompt += `\n\nCurrent date and time: ${now}`;
	prompt += `\nCurrent working directory: ${cwd}`;

	return prompt;
}
