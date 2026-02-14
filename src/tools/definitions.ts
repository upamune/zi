import { tool } from "ai";
import { z } from "zod";
import type { ToolName } from "./index.js";

export function getToolDefinitions(enabledTools: ToolName[] = ["read", "write", "edit", "bash"]) {
	const definitions = {
		read: tool({
			description:
				"Read the contents of a file. Use offset/limit for large files. When you need the full file, continue with offset until complete.",
			inputSchema: z.object({
				path: z.string().describe("Path to the file to read (relative or absolute)"),
				offset: z.number().optional().describe("Line number to start reading from (1-indexed)"),
				limit: z.number().optional().describe("Maximum number of lines to read"),
			}),
		}),
		write: tool({
			description:
				"Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
			inputSchema: z.object({
				path: z.string().describe("Path to the file to write (relative or absolute)"),
				content: z.string().describe("Content to write to the file"),
			}),
		}),
		edit: tool({
			description:
				"Edit a file by replacing exact text. The oldString must match exactly (including whitespace). Use this for precise, surgical edits.",
			inputSchema: z.object({
				path: z.string().describe("Path to the file to edit (relative or absolute)"),
				oldString: z.string().describe("Exact text to find and replace (must match exactly)"),
				newString: z.string().describe("New text to replace the old text with"),
				replaceAll: z
					.boolean()
					.optional()
					.describe(
						"If true, replace all occurrences. If false (default), the old string must appear exactly once."
					),
			}),
		}),
		bash: tool({
			description:
				"Execute a bash command in the current working directory. Returns stdout and stderr. Optionally provide a timeout.",
			inputSchema: z.object({
				command: z.string().describe("Bash command to execute"),
				cwd: z.string().optional().describe("Working directory for the command"),
				timeout: z.number().optional().describe("Timeout in seconds (optional)"),
			}),
		}),
	};

	return Object.fromEntries(
		Object.entries(definitions).filter(([name]) => enabledTools.includes(name as ToolName))
	);
}
