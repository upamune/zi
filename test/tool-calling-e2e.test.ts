import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Filesystem, ToolCalls } from "agentfs-sdk";
import type { ModelMessage, StreamTextResult } from "ai";
import type { Bash, BashExecResult } from "just-bash";
import { Agent } from "../src/agent/index.js";
import type { LLMProvider } from "../src/agent/provider.js";
import type { Session } from "../src/agent/session.js";
import { SessionManager } from "../src/agent/session-manager.js";
import { createToolRegistry } from "../src/tools/index.js";

async function* asyncGenerator<T>(items: T[]): AsyncGenerator<T> {
	for (const item of items) {
		yield item;
	}
}

function createMockStreamResult(
	text: string,
	toolCalls?: Array<{
		toolCallId: string;
		toolName: string;
		input?: Record<string, unknown>;
		args?: Record<string, unknown>;
	}>
): StreamTextResult<never, never> {
	return {
		textStream: asyncGenerator(text.split("")),
		text: Promise.resolve(text),
		toolCalls: Promise.resolve(toolCalls ?? []),
		usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
		finishReason: Promise.resolve("stop"),
	} as unknown as StreamTextResult<never, never>;
}

class FakeFilesystem {
	private files = new Map<string, string>();

	async writeFile(path: string, content: string): Promise<void> {
		this.files.set(path, content);
	}

	async readFile(path: string): Promise<Buffer> {
		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`ENOENT: ${path}`);
		}
		return Buffer.from(content, "utf-8");
	}

	getFile(path: string): string | undefined {
		return this.files.get(path);
	}
}

class FakeBash {
	private fs: FakeFilesystem;

	constructor(fs: FakeFilesystem) {
		this.fs = fs;
	}

	async exec(command: string): Promise<BashExecResult> {
		const trimmed = command.trim();

		const catMatch = trimmed.match(/^cat\s+"(.+)"$/);
		if (catMatch?.[1]) {
			const content = this.fs.getFile(catMatch[1]);
			if (content === undefined) {
				return { stdout: "", stderr: `No such file: ${catMatch[1]}`, exitCode: 1, env: {} };
			}
			return { stdout: content, stderr: "", exitCode: 0, env: {} };
		}

		const sedMatch = trimmed.match(/^sed -n '(\d+),(\d+|\$)p' "(.+)"$/);
		if (sedMatch?.[1] && sedMatch[2] && sedMatch[3]) {
			const content = this.fs.getFile(sedMatch[3]);
			if (content === undefined) {
				return { stdout: "", stderr: `No such file: ${sedMatch[3]}`, exitCode: 1, env: {} };
			}
			const lines = content.split("\n");
			const start = Number.parseInt(sedMatch[1], 10) - 1;
			const endExclusive = sedMatch[2] === "$" ? lines.length : Number.parseInt(sedMatch[2], 10);
			return {
				stdout: lines.slice(start, endExclusive).join("\n"),
				stderr: "",
				exitCode: 0,
				env: {},
			};
		}

		const echoMatch = trimmed.match(/^echo\s+(.+)$/);
		if (echoMatch?.[1]) {
			const output = echoMatch[1].replace(/^"(.*)"$/, "$1");
			return { stdout: `${output}\n`, stderr: "", exitCode: 0, env: {} };
		}

		return { stdout: "", stderr: `Unsupported command: ${command}`, exitCode: 1, env: {} };
	}
}

describe("Tool calling E2E", () => {
	let fs: FakeFilesystem;
	let bash: FakeBash;
	let toolsRecordMock: ReturnType<typeof mock>;
	let provider: LLMProvider;
	let session: Session;
	let toolRegistry: ReturnType<typeof createToolRegistry>;

	beforeEach(() => {
		fs = new FakeFilesystem();
		bash = new FakeBash(fs);
		toolsRecordMock = mock(async () => 1);

		const toolCalls = {
			record: toolsRecordMock,
		} as unknown as ToolCalls;

		toolRegistry = createToolRegistry(
			bash as unknown as Bash,
			fs as unknown as Filesystem,
			toolCalls
		);

		session = {
			id: "e2e-session",
			path: "/tmp/e2e.db",
			fs: fs as unknown as Session["fs"],
			kv: {} as Session["kv"],
			tools: toolCalls,
			sessionManager: SessionManager.inMemory("/test"),
			close: mock(async () => {}),
		} as Session;

		let callCount = 0;
		provider = {
			name: "anthropic",
			model: "claude-sonnet-4-5",
			streamText: mock(async (_options: { messages: ModelMessage[] }) => {
				callCount++;
				if (callCount === 1) {
					return createMockStreamResult("writing", [
						{
							toolCallId: "write-1",
							toolName: "write",
							args: { path: "/tmp/sample.txt", content: "hello tool world" },
						},
					]);
				}
				if (callCount === 2) {
					return createMockStreamResult("editing", [
						{
							toolCallId: "edit-1",
							toolName: "edit",
							input: {
								path: "/tmp/sample.txt",
								oldString: "tool",
								newString: "agent",
							},
						},
					]);
				}
				if (callCount === 3) {
					return createMockStreamResult("reading", [
						{
							toolCallId: "read-1",
							toolName: "read",
							args: { path: "/tmp/sample.txt" },
						},
					]);
				}
				if (callCount === 4) {
					return createMockStreamResult("bash", [
						{
							toolCallId: "bash-1",
							toolName: "bash",
							input: { command: "echo bash-ok" },
						},
					]);
				}
				return createMockStreamResult("all tools done");
			}) as unknown as LLMProvider["streamText"],
		};
	});

	test("should execute write/edit/read/bash in one conversation", async () => {
		const agent = new Agent({
			session,
			tools: toolRegistry,
			provider,
		});

		const response = await agent.prompt("run all tools");

		expect(response.content).toBe("all tools done");
		expect(response.toolCalls).toHaveLength(4);
		expect(response.toolCalls?.map((call) => call.name)).toEqual(["write", "edit", "read", "bash"]);
		expect(fs.getFile("/tmp/sample.txt")).toBe("hello agent world");

		const readCall = response.toolCalls?.find((call) => call.name === "read");
		expect((readCall?.result as { content?: string }).content).toBe("hello agent world");

		const bashCall = response.toolCalls?.find((call) => call.name === "bash");
		expect((bashCall?.result as { stdout?: string }).stdout).toBe("bash-ok\n");

		expect(toolsRecordMock).toHaveBeenCalledTimes(4);
	});
});
