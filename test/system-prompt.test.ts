import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "../src/agent/system-prompt.js";

describe("buildSystemPrompt", () => {
	test("should build default prompt with tools and cwd", () => {
		const prompt = buildSystemPrompt({ cwd: "/tmp/project" });
		expect(prompt).toContain("You are xi, an expert coding assistant");
		expect(prompt).toContain("- read: Read file contents");
		expect(prompt).toContain("- write: Create or overwrite files");
		expect(prompt).toContain("Current working directory: /tmp/project");
	});

	test("should support custom and appended prompt", () => {
		const prompt = buildSystemPrompt({
			customPrompt: "You are custom",
			appendSystemPrompt: "Always run tests",
			agentsInstructions: "Project instructions from AGENTS files:\n\n# AGENTS.md\nUse pnpm",
			cwd: "/tmp/project",
		});
		expect(prompt).toContain("You are custom");
		expect(prompt).toContain("Always run tests");
		expect(prompt).toContain("Project instructions from AGENTS files:");
	});
});
