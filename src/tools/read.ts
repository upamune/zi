import type { FileSystem, ToolCalls } from "agentfs-sdk";

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

export function createReadTool(fs: FileSystem, tools: ToolCalls): ReadTool {
	return {
		name: "read",
		async execute(params: { path: string; offset?: number; limit?: number }): Promise<ReadResult> {
			const { path, offset, limit } = params;
			const startedAt = Date.now();
			let content: string;
			try {
				const buffer = await fs.readFile(path);
				content = buffer.toString("utf-8");
			} catch (error) {
				const completedAt = Date.now();
				const errorMessage = error instanceof Error ? error.message : String(error);
				await tools.record("read", startedAt, completedAt, params, undefined, errorMessage);
				throw new Error(`Failed to read ${path}: ${errorMessage}`);
			}

			const readResult: ReadResult = {
				path,
				content,
			};

			if (offset !== undefined || limit !== undefined) {
				const lines = content.split("\n");
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : lines.length;
				readResult.content = lines.slice(startLine - 1, endLine).join("\n");
			}

			if (offset !== undefined) {
				readResult.offset = offset;
			}
			if (limit !== undefined) {
				readResult.limit = limit;
			}

			const completedAt = Date.now();
			await tools.record("read", startedAt, completedAt, params, { content: readResult.content });
			return readResult;
		},
	};
}
