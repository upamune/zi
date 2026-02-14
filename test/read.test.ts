import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Filesystem, ToolCalls } from "agentfs-sdk";
import { createReadTool } from "../src/tools/read.js";

describe("ReadTool", () => {
	let mockFs: Filesystem;
	let mockTools: ToolCalls;
	let recordMock: ReturnType<typeof mock>;
	let readFileMock: ReturnType<typeof mock>;

	beforeEach(() => {
		recordMock = mock(async () => 1);
		readFileMock = mock(async () => Buffer.from(""));
		mockFs = {
			readFile: readFileMock,
		} as unknown as Filesystem;
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

	test("should read file content", async () => {
		const fileContent = "Hello, World!";
		readFileMock = mock(async () => Buffer.from(fileContent, "utf-8"));
		mockFs.readFile = readFileMock as unknown as Filesystem["readFile"];

		const tool = createReadTool(mockFs, mockTools);
		const result = await tool.execute({ path: "/test.txt" });

		expect(result.content).toBe(fileContent);
		expect(result.path).toBe("/test.txt");
	});

	test("should throw on read failure", async () => {
		readFileMock = mock(async () => {
			throw new Error("File not found");
		});
		mockFs.readFile = readFileMock as unknown as Filesystem["readFile"];

		const tool = createReadTool(mockFs, mockTools);

		expect(tool.execute({ path: "/nonexistent.txt" })).rejects.toThrow(
			"Failed to read /nonexistent.txt"
		);
	});

	test("should apply offset/limit", async () => {
		readFileMock = mock(async () => Buffer.from("line1\nline2\nline3", "utf-8"));
		mockFs.readFile = readFileMock as unknown as Filesystem["readFile"];

		const tool = createReadTool(mockFs, mockTools);
		const result = await tool.execute({ path: "/test.txt", offset: 2, limit: 1 });
		expect(result.content).toBe("line2");
	});

	test("should record tool call", async () => {
		readFileMock = mock(async () => Buffer.from("content", "utf-8"));
		mockFs.readFile = readFileMock as unknown as Filesystem["readFile"];

		const tool = createReadTool(mockFs, mockTools);
		await tool.execute({ path: "/test.txt" });

		expect(recordMock).toHaveBeenCalled();
		const call = recordMock.mock.calls[0];
		expect(call[0]).toBe("read");
	});
});
