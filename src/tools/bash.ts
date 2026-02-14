import type { ToolCalls } from "agentfs-sdk";
import type { Bash, BashExecResult } from "just-bash";

export interface BashResult {
	command: string;
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface BashTool {
	name: "bash";
	execute(params: { command: string; cwd?: string; timeout?: number }): Promise<BashResult>;
}

export function createBashTool(bash: Bash, tools: ToolCalls): BashTool {
	return {
		name: "bash",
		async execute(params: {
			command: string;
			cwd?: string;
			timeout?: number;
		}): Promise<BashResult> {
			const { command, cwd } = params;
			const startedAt = Date.now();

			let result: BashExecResult;
			try {
				result = await bash.exec(command, cwd ? { cwd } : undefined);
			} catch (error) {
				const completedAt = Date.now();
				const errorMessage = error instanceof Error ? error.message : String(error);
				await tools.record("bash", startedAt, completedAt, params, undefined, errorMessage);
				throw new Error(`Failed to execute command: ${errorMessage}`);
			}

			const completedAt = Date.now();
			const bashResult: BashResult = {
				command,
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
			};

			if (result.exitCode !== 0) {
				await tools.record("bash", startedAt, completedAt, params, bashResult, result.stderr);
			} else {
				await tools.record("bash", startedAt, completedAt, params, bashResult);
			}

			return bashResult;
		},
	};
}
