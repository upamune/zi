import { describe, expect, test } from "bun:test";
import {
	isCommandAvailableWhileRunning,
	parseSlashCommand,
	type SlashCommand,
} from "../src/tui/slash-commands.js";

describe("tui slash commands", () => {
	test("should parse bare commands", () => {
		const command = parseSlashCommand("/help");
		expect(command).toEqual({
			name: "help",
			rawInput: "/help",
			args: "",
			tokens: [],
		});
	});

	test("should parse arg commands", () => {
		const command = parseSlashCommand("/skills enable qmd");
		expect(command.name).toBe("skills");
		expect(command.args).toBe("enable qmd");
		expect(command.tokens).toEqual(["enable", "qmd"]);
	});

	test("should normalize command name case", () => {
		const command = parseSlashCommand("/SKILLS off");
		expect(command.name).toBe("skills");
		expect(command.tokens).toEqual(["off"]);
	});

	test("should reject unknown commands", () => {
		expect(() => parseSlashCommand("/skill enable qmd")).toThrow("Unknown slash command");
	});

	test("should reject non-slash input", () => {
		expect(() => parseSlashCommand("hello")).toThrow("must start with '/'");
	});
});

describe("slash command availability while running", () => {
	test("should allow help while running", () => {
		const command = parseSlashCommand("/help");
		expect(isCommandAvailableWhileRunning(command)).toBe(true);
	});

	test("should allow quit while running", () => {
		const command = parseSlashCommand("/quit");
		expect(isCommandAvailableWhileRunning(command)).toBe(true);
	});

	test("should disable stateful commands while running", () => {
		const blocked: SlashCommand[] = [
			parseSlashCommand("/clear"),
			parseSlashCommand("/resume"),
			parseSlashCommand("/skills"),
			parseSlashCommand("/init"),
			parseSlashCommand("/plan"),
		];
		for (const command of blocked) {
			expect(isCommandAvailableWhileRunning(command)).toBe(false);
		}
	});
});
