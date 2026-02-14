import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "../src/agent/system-prompt.js";

describe("buildSystemPrompt", () => {
	test("should build default prompt with tools and cwd", () => {
		const prompt = buildSystemPrompt({ cwd: "/tmp/project" });
		expect(prompt).toContain("zi, a coding agent harness");
		expect(prompt).toContain("- read: Read file contents");
		expect(prompt).toContain("- write: Create or overwrite files");
		expect(prompt).toContain("Current working directory: /tmp/project");
	});

	test("should support custom and appended prompt", () => {
		const prompt = buildSystemPrompt({
			customPrompt: "You are custom",
			appendSystemPrompt: "Always run tests",
			cwd: "/tmp/project",
		});
		expect(prompt).toContain("You are custom");
		expect(prompt).toContain("Always run tests");
	});
});
