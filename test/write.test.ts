import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FileSystem, ToolCalls } from "agentfs-sdk";
import { createWriteTool } from "../src/tools/write.js";

describe("WriteTool", () => {
	let mockFs: FileSystem;
	let mockTools: ToolCalls;
	let recordMock: ReturnType<typeof mock>;
	let writeFileMock: ReturnType<typeof mock>;

	beforeEach(() => {
		recordMock = mock(async () => 1);
		writeFileMock = mock(async () => {});
		mockFs = {
			writeFile: writeFileMock,
		} as unknown as FileSystem;
		mockTools = {
			record: recordMock,
			start: mock(async () => 1),
			success: mock(async () => {}),
			error: mock(async () => {}),
			get: mock(async () => undefined),
			getByName: mock(async () => []),
			getRecent: mock(async () => []),
			getStats: mock(async () => []),
		} as unknown as ToolCalls;
	});

	test("should write file content", async () => {
		const tool = createWriteTool(mockFs, mockTools);
		const result = await tool.execute({ path: "/test.txt", content: "Hello, World!" });

		expect(result.path).toBe("/test.txt");
		expect(result.bytesWritten).toBe(13);
		expect(writeFileMock).toHaveBeenCalledWith("/test.txt", "Hello, World!", "utf-8");
	});

	test("should handle write errors", async () => {
		writeFileMock = mock(async () => {
			throw new Error("Permission denied");
		});
		mockFs = {
			writeFile: writeFileMock,
		} as unknown as FileSystem;

		const tool = createWriteTool(mockFs, mockTools);

		expect(tool.execute({ path: "/readonly.txt", content: "test" })).rejects.toThrow(
			"Failed to write /readonly.txt"
		);
	});

	test("should record tool call", async () => {
		const tool = createWriteTool(mockFs, mockTools);
		await tool.execute({ path: "/test.txt", content: "content" });

		expect(recordMock).toHaveBeenCalled();
		const call = recordMock.mock.calls[0];
		expect(call[0]).toBe("write");
	});
});
