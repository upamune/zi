import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSubcommand } from "../src/subcommands.js";

describe("subcommands", () => {
	let cwd: string;
	let globalDir: string;
	let originalZiDir: string | undefined;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "zi-subcommands-cwd-"));
		globalDir = await mkdtemp(join(tmpdir(), "zi-subcommands-global-"));
		originalZiDir = process.env.ZI_DIR;
		process.env.ZI_DIR = globalDir;
	});

	afterEach(async () => {
		if (originalZiDir === undefined) {
			delete process.env.ZI_DIR;
		} else {
			process.env.ZI_DIR = originalZiDir;
		}
		await rm(cwd, { recursive: true, force: true });
		await rm(globalDir, { recursive: true, force: true });
	});

	test("install should succeed", async () => {
		await runSubcommand({ name: "install", source: "github:owner/repo", local: false }, cwd);
	});

	test("install should fail on duplicate", async () => {
		await runSubcommand({ name: "install", source: "github:owner/repo", local: false }, cwd);
		await expect(
			runSubcommand({ name: "install", source: "github:owner/repo", local: false }, cwd)
		).rejects.toThrow("Source already installed");
	});

	test("remove should succeed", async () => {
		await runSubcommand({ name: "install", source: "github:owner/repo", local: true }, cwd);
		await runSubcommand({ name: "remove", source: "github:owner/repo", local: true }, cwd);
	});

	test("remove should fail on missing source", async () => {
		await expect(
			runSubcommand({ name: "remove", source: "github:owner/repo", local: false }, cwd)
		).rejects.toThrow("Source not found");
	});

	test("update should succeed", async () => {
		await runSubcommand({ name: "install", source: "github:owner/repo", local: false }, cwd);
		await runSubcommand({ name: "update", source: null, local: false }, cwd);
	});

	test("update should fail on missing source", async () => {
		await expect(
			runSubcommand({ name: "update", source: "missing", local: false }, cwd)
		).rejects.toThrow("Source not found");
	});

	test("list should succeed", async () => {
		await runSubcommand({ name: "list", source: null, local: false }, cwd);
	});

	test("list should fail for invalid cwd", async () => {
		await expect(
			runSubcommand({ name: "list", source: null, local: false }, join(cwd, "missing"))
		).rejects.toThrow("Directory not found");
	});

	test("config should succeed", async () => {
		await runSubcommand({ name: "config", source: null, local: false }, cwd);
	});

	test("config should fail for invalid cwd", async () => {
		await expect(
			runSubcommand({ name: "config", source: null, local: false }, join(cwd, "missing"))
		).rejects.toThrow("Directory not found");
	});
});
