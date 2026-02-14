import type { Filesystem, ToolCalls } from "agentfs-sdk";

export interface WriteResult {
	path: string;
	bytesWritten: number;
}

export interface WriteTool {
	name: "write";
	execute(params: { path: string; content: string }): Promise<WriteResult>;
}

export function createWriteTool(fs: Filesystem, tools: ToolCalls): WriteTool {
	return {
		name: "write",
		async execute(params: { path: string; content: string }): Promise<WriteResult> {
			const { path, content } = params;
			const startedAt = Date.now();

			try {
				await fs.writeFile(path, content, "utf-8");
				const completedAt = Date.now();

				const result: WriteResult = {
					path,
					bytesWritten: Buffer.byteLength(content, "utf-8"),
				};

				await tools.record("write", startedAt, completedAt, params, result);
				return result;
			} catch (error) {
				const completedAt = Date.now();
				const errorMessage = error instanceof Error ? error.message : String(error);
				await tools.record("write", startedAt, completedAt, params, undefined, errorMessage);
				throw new Error(`Failed to write ${path}: ${errorMessage}`);
			}
		},
	};
}
