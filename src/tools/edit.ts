import type { Filesystem, ToolCalls } from "agentfs-sdk";
import type { Bash } from "just-bash";

export interface EditResult {
	path: string;
	oldText: string;
	newText: string;
	occurrences: number;
}

export interface EditTool {
	name: "edit";
	execute(params: {
		path: string;
		oldString: string;
		newString: string;
		replaceAll?: boolean;
	}): Promise<EditResult>;
}

export function createEditTool(bash: Bash, fs: Filesystem, tools: ToolCalls): EditTool {
	return {
		name: "edit",
		async execute(params: {
			path: string;
			oldString: string;
			newString: string;
			replaceAll?: boolean;
		}): Promise<EditResult> {
			const { path, oldString, newString, replaceAll } = params;
			const startedAt = Date.now();

			const readResult = await bash.exec(`cat "${path}"`);
			if (readResult.exitCode !== 0) {
				const completedAt = Date.now();
				await tools.record("edit", startedAt, completedAt, params, undefined, readResult.stderr);
				throw new Error(`Failed to read ${path}: ${readResult.stderr}`);
			}

			const content = readResult.stdout;
			const occurrences = (content.match(new RegExp(escapeRegex(oldString), "g")) || []).length;

			if (occurrences === 0) {
				const completedAt = Date.now();
				await tools.record("edit", startedAt, completedAt, params, undefined, "Text not found");
				throw new Error(`Text not found in ${path}`);
			}

			if (!replaceAll && occurrences > 1) {
				const completedAt = Date.now();
				await tools.record(
					"edit",
					startedAt,
					completedAt,
					params,
					undefined,
					`Found ${occurrences} occurrences`
				);
				throw new Error(
					`Found ${occurrences} occurrences of the text in ${path}. Use replaceAll=true to replace all occurrences.`
				);
			}

			const newContent = replaceAll
				? content.split(oldString).join(newString)
				: content.replace(oldString, newString);

			try {
				await fs.writeFile(path, newContent, "utf-8");
			} catch (error) {
				const completedAt = Date.now();
				const errorMessage = error instanceof Error ? error.message : String(error);
				await tools.record("edit", startedAt, completedAt, params, undefined, errorMessage);
				throw new Error(`Failed to write ${path}: ${errorMessage}`);
			}

			const completedAt = Date.now();
			const result: EditResult = {
				path,
				oldText: oldString,
				newText: newString,
				occurrences,
			};

			await tools.record("edit", startedAt, completedAt, params, result);
			return result;
		},
	};
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
