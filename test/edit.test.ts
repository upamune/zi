import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FileSystem, ToolCalls } from "agentfs-sdk";
import { createEditTool } from "../src/tools/edit.js";

describe("EditTool", () => {
	let mockFs: FileSystem;
	let mockTools: ToolCalls;
	let recordMock: ReturnType<typeof mock>;
	let writeFileMock: ReturnType<typeof mock>;
	let readFileMock: ReturnType<typeof mock>;

	beforeEach(() => {
		recordMock = mock(async () => 1);
		writeFileMock = mock(async () => {});
		readFileMock = mock(async () => Buffer.from("", "utf-8"));
		mockFs = {
			readFile: readFileMock,
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

	test("should replace single occurrence", async () => {
		readFileMock = mock(async () => Buffer.from("Hello, World!", "utf-8"));
		mockFs.readFile = readFileMock as unknown as FileSystem["readFile"];

		const tool = createEditTool(mockFs, mockTools);
		const result = await tool.execute({
			path: "/test.txt",
			oldString: "World",
			newString: "Universe",
		});

		expect(result.occurrences).toBe(1);
		expect(writeFileMock).toHaveBeenCalledWith("/test.txt", "Hello, Universe!", "utf-8");
	});

	test("should throw when text not found", async () => {
		readFileMock = mock(async () => Buffer.from("Hello, World!", "utf-8"));
		mockFs.readFile = readFileMock as unknown as FileSystem["readFile"];

		const tool = createEditTool(mockFs, mockTools);

		expect(
			tool.execute({
				path: "/test.txt",
				oldString: "NotFound",
				newString: "Replaced",
			})
		).rejects.toThrow("Text not found in /test.txt");
	});

	test("should throw when multiple occurrences without replaceAll", async () => {
		readFileMock = mock(async () => Buffer.from("foo bar foo", "utf-8"));
		mockFs.readFile = readFileMock as unknown as FileSystem["readFile"];

		const tool = createEditTool(mockFs, mockTools);

		expect(
			tool.execute({
				path: "/test.txt",
				oldString: "foo",
				newString: "baz",
			})
		).rejects.toThrow("Found 2 occurrences");
	});

	test("should replace all occurrences with replaceAll", async () => {
		readFileMock = mock(async () => Buffer.from("foo bar foo", "utf-8"));
		mockFs.readFile = readFileMock as unknown as FileSystem["readFile"];

		const tool = createEditTool(mockFs, mockTools);
		const result = await tool.execute({
			path: "/test.txt",
			oldString: "foo",
			newString: "baz",
			replaceAll: true,
		});

		expect(result.occurrences).toBe(2);
		expect(writeFileMock).toHaveBeenCalledWith("/test.txt", "baz bar baz", "utf-8");
	});

	test("should throw on read failure", async () => {
		readFileMock = mock(async () => {
			throw new Error("Permission denied");
		});
		mockFs.readFile = readFileMock as unknown as FileSystem["readFile"];

		const tool = createEditTool(mockFs, mockTools);

		expect(
			tool.execute({
				path: "/test.txt",
				oldString: "old",
				newString: "new",
			})
		).rejects.toThrow("Failed to read /test.txt");
	});
});
