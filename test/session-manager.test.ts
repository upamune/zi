import { beforeEach, describe, expect, test } from "bun:test";
import { modelMessageSchema } from "ai";
import { SessionManager } from "../src/agent/session-manager.js";

describe("SessionManager", () => {
	let sm: SessionManager;

	beforeEach(() => {
		sm = SessionManager.inMemory("/test");
	});

	describe("appendMessage", () => {
		test("appends message as child of leaf", () => {
			const id1 = sm.appendMessage({ role: "user", content: "Hello" });
			expect(sm.getLeafId()).toBe(id1);

			const id2 = sm.appendMessage({ role: "assistant", content: "Hi there" });
			expect(sm.getLeafId()).toBe(id2);

			const entry2 = sm.getEntry(id2);
			expect(entry2?.parentId).toBe(id1);
		});

		test("first message has null parentId", () => {
			const id = sm.appendMessage({ role: "user", content: "First" });
			const entry = sm.getEntry(id);
			expect(entry?.parentId).toBe(null);
		});
	});

	describe("branch", () => {
		test("branch creates sibling", () => {
			const id1 = sm.appendMessage({ role: "user", content: "Hello" });
			sm.appendMessage({ role: "assistant", content: "Hi" });

			sm.branch(id1);
			const id3 = sm.appendMessage({ role: "assistant", content: "Hey" });

			const entry3 = sm.getEntry(id3);
			expect(entry3?.parentId).toBe(id1);

			const children = sm.getChildren(id1);
			expect(children).toHaveLength(2);
		});

		test("branch throws on invalid entry id", () => {
			expect(() => sm.branch("invalid")).toThrow("Entry invalid not found");
		});
	});

	describe("resetLeaf", () => {
		test("resetLeaf allows creating new root", () => {
			const id1 = sm.appendMessage({ role: "user", content: "First" });
			expect(sm.getLeafId()).toBe(id1);

			sm.resetLeaf();
			expect(sm.getLeafId()).toBe(null);

			const id2 = sm.appendMessage({ role: "user", content: "Second" });
			const entry2 = sm.getEntry(id2);
			expect(entry2?.parentId).toBe(null);
		});
	});

	describe("getBranch", () => {
		test("returns path from root to leaf", () => {
			const id1 = sm.appendMessage({ role: "user", content: "A" });
			const id2 = sm.appendMessage({ role: "assistant", content: "B" });
			const id3 = sm.appendMessage({ role: "user", content: "C" });

			const branch = sm.getBranch();
			expect(branch).toHaveLength(3);
			expect(branch[0].id).toBe(id1);
			expect(branch[1].id).toBe(id2);
			expect(branch[2].id).toBe(id3);
		});

		test("returns correct branch after branching", () => {
			const id1 = sm.appendMessage({ role: "user", content: "A" });
			sm.appendMessage({ role: "assistant", content: "B1" });
			sm.branch(id1);
			const id3 = sm.appendMessage({ role: "assistant", content: "B2" });

			const branch = sm.getBranch();
			expect(branch).toHaveLength(2);
			expect(branch[0].id).toBe(id1);
			expect(branch[1].id).toBe(id3);
		});
	});

	describe("getTree", () => {
		test("returns tree structure", () => {
			const id1 = sm.appendMessage({ role: "user", content: "Root" });
			sm.appendMessage({ role: "assistant", content: "Child1" });
			sm.branch(id1);
			sm.appendMessage({ role: "assistant", content: "Child2" });

			const tree = sm.getTree();
			expect(tree).toHaveLength(1);
			expect(tree[0].entry.id).toBe(id1);
			expect(tree[0].children).toHaveLength(2);
		});
	});

	describe("buildSessionContext", () => {
		test("returns messages from branch", () => {
			sm.appendMessage({ role: "user", content: "Hello" });
			sm.appendMessage({
				role: "assistant",
				content: "Hi",
				provider: "anthropic",
				model: "claude",
			});

			const context = sm.buildSessionContext();
			expect(context.messages).toHaveLength(2);
			expect(context.model).toEqual({ provider: "anthropic", modelId: "claude" });
		});

		test("model change entries update model", () => {
			sm.appendMessage({ role: "user", content: "Hello" });
			sm.appendModelChange("openai", "gpt-4");

			const context = sm.buildSessionContext();
			expect(context.model).toEqual({ provider: "openai", modelId: "gpt-4" });
		});

		test("tool messages are converted to valid model messages", () => {
			sm.appendMessage({ role: "user", content: "run tool" });
			sm.appendMessage({
				role: "assistant",
				content: "running",
				toolInvocations: [
					{
						toolCallId: "call-1",
						toolName: "read",
						args: { path: "/tmp/a.txt" },
						state: "result",
						result: { ok: true },
					},
				],
			});
			sm.appendMessage({
				role: "tool",
				content: '{"ok":true}',
				toolInvocations: [
					{
						toolCallId: "call-1",
						toolName: "read",
						args: { path: "/tmp/a.txt" },
						state: "result",
						result: { ok: true },
					},
				],
			});

			const context = sm.buildSessionContext();
			expect(context.messages).toHaveLength(3);
			for (const message of context.messages) {
				expect(() => modelMessageSchema.parse(message)).not.toThrow();
			}
		});
	});

	describe("getEntries", () => {
		test("returns all entries excluding header", () => {
			sm.appendMessage({ role: "user", content: "A" });
			sm.appendMessage({ role: "assistant", content: "B" });
			sm.appendModelChange("openai", "gpt-4");

			const entries = sm.getEntries();
			expect(entries).toHaveLength(3);
		});
	});

	describe("getHeader", () => {
		test("returns session header", () => {
			const header = sm.getHeader();
			expect(header?.type).toBe("session");
			expect(header?.cwd).toBe("/test");
		});
	});
});
