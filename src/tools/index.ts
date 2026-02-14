import type { Filesystem, ToolCalls } from "agentfs-sdk";
import type { Bash } from "just-bash";
import { type BashTool, createBashTool } from "./bash.js";
import { createEditTool, type EditTool } from "./edit.js";
import { createReadTool, type ReadTool } from "./read.js";
import { createWriteTool, type WriteTool } from "./write.js";

export type { BashTool, EditTool, ReadTool, WriteTool };

export interface BaseTool {
	name: string;
	execute(params: Record<string, unknown>): Promise<unknown>;
}

export type Tool = ReadTool | WriteTool | EditTool | BashTool;
export type ToolName = "read" | "write" | "edit" | "bash";

export interface ToolRegistry {
	get(name: ToolName): BaseTool | undefined;
	getAll(): Map<string, BaseTool>;
	register(tool: BaseTool): void;
}

class ToolRegistryImpl implements ToolRegistry {
	private tools = new Map<string, BaseTool>();

	get(name: ToolName): BaseTool | undefined {
		return this.tools.get(name);
	}

	getAll(): Map<string, BaseTool> {
		return new Map(this.tools);
	}

	register(tool: BaseTool): void {
		this.tools.set(tool.name, tool);
	}
}

export function createToolRegistry(
	bash: Bash,
	fs: Filesystem,
	tools: ToolCalls,
	enabledTools: ToolName[] = ["read", "write", "edit", "bash"]
): ToolRegistry {
	const registry = new ToolRegistryImpl();

	if (enabledTools.includes("read")) {
		registry.register(createReadTool(fs, tools) as BaseTool);
	}
	if (enabledTools.includes("write")) {
		registry.register(createWriteTool(fs, tools) as BaseTool);
	}
	if (enabledTools.includes("edit")) {
		registry.register(createEditTool(fs, tools) as BaseTool);
	}
	if (enabledTools.includes("bash")) {
		registry.register(createBashTool(bash, tools) as BaseTool);
	}

	return registry;
}
