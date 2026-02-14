import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ToolCalls } from "agentfs-sdk";
import type { Bash, BashExecResult } from "just-bash";
import type { BaseTool, ToolName } from "../src/tools/index.js";
import { createToolRegistry } from "../src/tools/index.js";

describe("ToolRegistry", () => {
	let mockBash: Bash;
	let mockFs: { writeFile: ReturnType<typeof mock> };
	let mockTools: ToolCalls;

	beforeEach(() => {
		mockBash = {
			exec: mock(
				async (): Promise<BashExecResult> => ({
					stdout: "",
					stderr: "",
					exitCode: 0,
					env: {},
				})
			),
		} as unknown as Bash;

		mockFs = {
			writeFile: mock(async () => {}),
		};

		mockTools = {
			record: mock(async () => 1),
			start: mock(async () => 1),
			success: mock(async () => {}),
			error: mock(async () => {}),
			get: mock(async () => undefined),
			getByName: mock(async () => []),
			getRecent: mock(async () => []),
			getStats: mock(async () => []),
		} as unknown as ToolCalls;
	});

	describe("createToolRegistry", () => {
		test("should register all 4 tools", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools
			);

			expect(registry.get("read")).toBeDefined();
			expect(registry.get("write")).toBeDefined();
			expect(registry.get("edit")).toBeDefined();
			expect(registry.get("bash")).toBeDefined();
		});

		test("should register tools with correct names", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools
			);

			expect(registry.get("read")?.name).toBe("read");
			expect(registry.get("write")?.name).toBe("write");
			expect(registry.get("edit")?.name).toBe("edit");
			expect(registry.get("bash")?.name).toBe("bash");
		});

		test("should register only selected tools", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools,
				["read", "bash"]
			);

			expect(registry.get("read")).toBeDefined();
			expect(registry.get("bash")).toBeDefined();
			expect(registry.get("write")).toBeUndefined();
			expect(registry.get("edit")).toBeUndefined();
		});
	});

	describe("get", () => {
		test("should return tool by name", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools
			);

			const readTool = registry.get("read");
			expect(readTool).toBeDefined();
			expect(readTool?.name).toBe("read");
		});

		test("should return undefined for unknown tool", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools
			);

			expect(registry.get("unknown" as ToolName)).toBeUndefined();
		});

		test("should return same tool instance on multiple calls", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools
			);

			const tool1 = registry.get("read");
			const tool2 = registry.get("read");

			expect(tool1).toBe(tool2);
		});
	});

	describe("getAll", () => {
		test("should return map of all tools", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools
			);

			const allTools = registry.getAll();

			expect(allTools.size).toBe(4);
			expect(allTools.has("read")).toBe(true);
			expect(allTools.has("write")).toBe(true);
			expect(allTools.has("edit")).toBe(true);
			expect(allTools.has("bash")).toBe(true);
		});

		test("should return copy of tools map", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools
			);

			const allTools1 = registry.getAll();
			const allTools2 = registry.getAll();

			expect(allTools1).not.toBe(allTools2);
			expect(allTools1.size).toBe(allTools2.size);
		});
	});

	describe("register", () => {
		test("should add new tool", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools
			);

			const customTool: BaseTool = {
				name: "custom",
				execute: mock(async () => ({ result: "custom" })),
			};

			registry.register(customTool);

			expect(registry.get("custom" as ToolName)).toBe(customTool);
		});

		test("should overwrite existing tool", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools
			);

			const originalRead = registry.get("read");

			const newReadTool: BaseTool = {
				name: "read",
				execute: mock(async () => ({ result: "new read" })),
			};

			registry.register(newReadTool);

			expect(registry.get("read")).toBe(newReadTool);
			expect(registry.get("read")).not.toBe(originalRead);
		});

		test("should increase tool count when adding new tool", () => {
			const registry = createToolRegistry(
				mockBash,
				mockFs as unknown as Parameters<typeof createToolRegistry>[1],
				mockTools
			);

			expect(registry.getAll().size).toBe(4);

			const customTool: BaseTool = {
				name: "custom",
				execute: mock(async () => ({ result: "custom" })),
			};

			registry.register(customTool);

			expect(registry.getAll().size).toBe(5);
		});
	});
});
