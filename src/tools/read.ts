import type { ToolCalls } from "agentfs-sdk";
import type { Bash } from "just-bash";

export interface ReadResult {
	path: string;
	content: string;
	offset?: number;
	limit?: number;
}

export interface ReadTool {
	name: "read";
	execute(params: { path: string; offset?: number; limit?: number }): Promise<ReadResult>;
}

export function createReadTool(bash: Bash, tools: ToolCalls): ReadTool {
	return {
		name: "read",
		async execute(params: { path: string; offset?: number; limit?: number }): Promise<ReadResult> {
			const { path, offset, limit } = params;
			const startedAt = Date.now();

			let command = `cat "${path}"`;

			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : "$";
				command = `sed -n '${startLine},${endLine}p' "${path}"`;
			}

			const result = await bash.exec(command);
			const completedAt = Date.now();

			if (result.exitCode !== 0) {
				await tools.record("read", startedAt, completedAt, params, undefined, result.stderr);
				throw new Error(`Failed to read ${path}: ${result.stderr}`);
			}

			const readResult: ReadResult = {
				path,
				content: result.stdout,
			};

			if (offset !== undefined) {
				readResult.offset = offset;
			}
			if (limit !== undefined) {
				readResult.limit = limit;
			}

			await tools.record("read", startedAt, completedAt, params, { content: result.stdout });
			return readResult;
		},
	};
}
