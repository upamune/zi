import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	type Config,
	DEFAULT_CONFIG,
	getGlobalConfigDir,
	getProjectConfigPath,
	loadConfig,
	saveConfig,
} from "../src/config/index.js";

describe("Config", () => {
	const originalEnv = process.env.XI_DIR;
	const tempDir = join("/tmp", `xi-config-test-${Date.now()}`);
	const tempGlobalConfigDir = join(tempDir, "global-xidir");
	const tempProjectDir = join(tempDir, "project");

	beforeEach(() => {
		delete process.env.XI_DIR;
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
		mkdirSync(tempDir, { recursive: true });
		mkdirSync(tempGlobalConfigDir, { recursive: true });
		mkdirSync(join(tempProjectDir, ".xi"), { recursive: true });
	});

	afterAll(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
		if (originalEnv !== undefined) {
			process.env.XI_DIR = originalEnv;
		} else {
			delete process.env.XI_DIR;
		}
	});

	describe("loadConfig", () => {
		test("should return default config when no config files exist", async () => {
			const emptyConfigDir = join(tempDir, "empty-xidir");
			mkdirSync(emptyConfigDir, { recursive: true });
			const emptyProjectDir = join(tempDir, "empty-project");
			mkdirSync(emptyProjectDir, { recursive: true });

			process.env.XI_DIR = emptyConfigDir;
			const config = await loadConfig(emptyProjectDir);

			expect(config).toEqual(DEFAULT_CONFIG);
		});

		test("should load global config only", async () => {
			const globalConfig: Partial<Config> = { provider: "openai", model: "gpt-4" };
			process.env.XI_DIR = tempGlobalConfigDir;
			writeFileSync(join(tempGlobalConfigDir, "settings.json"), JSON.stringify(globalConfig));

			const emptyProjectDir = join(tempDir, "empty-project");
			mkdirSync(emptyProjectDir, { recursive: true });
			const config = await loadConfig(emptyProjectDir);

			expect(config.provider).toBe("openai");
			expect(config.model).toBe("gpt-4");
			expect(config.thinking).toBe(DEFAULT_CONFIG.thinking);
		});

		test("should load project config only", async () => {
			const projectConfig: Partial<Config> = { provider: "kimi", thinking: "high" };
			writeFileSync(join(tempProjectDir, ".xi", "settings.json"), JSON.stringify(projectConfig));

			const emptyConfigDir = join(tempDir, "empty-xidir2");
			mkdirSync(emptyConfigDir, { recursive: true });
			process.env.XI_DIR = emptyConfigDir;

			const config = await loadConfig(tempProjectDir);

			expect(config.provider).toBe("kimi");
			expect(config.thinking).toBe("high");
			expect(config.model).toBe(DEFAULT_CONFIG.model);
		});

		test("should merge global and project config with project priority", async () => {
			const globalConfig: Partial<Config> = { provider: "openai", model: "gpt-4" };
			const projectConfig: Partial<Config> = { model: "gpt-4o", thinking: "low" };

			process.env.XI_DIR = tempGlobalConfigDir;
			writeFileSync(join(tempGlobalConfigDir, "settings.json"), JSON.stringify(globalConfig));
			writeFileSync(join(tempProjectDir, ".xi", "settings.json"), JSON.stringify(projectConfig));

			const config = await loadConfig(tempProjectDir);

			expect(config.provider).toBe("openai");
			expect(config.model).toBe("gpt-4o");
			expect(config.thinking).toBe("low");
		});

		test("should handle invalid JSON in config file", async () => {
			process.env.XI_DIR = tempGlobalConfigDir;
			writeFileSync(join(tempGlobalConfigDir, "settings.json"), "not valid json {{{");

			const config = await loadConfig();

			expect(config).toEqual(DEFAULT_CONFIG);
		});
	});

	describe("saveConfig", () => {
		test("should save to global config by default", async () => {
			process.env.XI_DIR = tempGlobalConfigDir;
			writeFileSync(
				join(tempGlobalConfigDir, "settings.json"),
				JSON.stringify({ provider: "openai" })
			);

			await saveConfig({ model: "gpt-4" });

			const saved = JSON.parse(readFileSync(join(tempGlobalConfigDir, "settings.json"), "utf-8"));
			expect(saved.model).toBe("gpt-4");
			expect(saved.provider).toBe("openai");
		});

		test("should save to project config when scope is project", async () => {
			await saveConfig({ provider: "kimi" }, "project", tempProjectDir);

			const saved = JSON.parse(readFileSync(join(tempProjectDir, ".xi", "settings.json"), "utf-8"));
			expect(saved.provider).toBe("kimi");
		});

		test("should create config directory if not exists", async () => {
			const newProjectDir = join(tempDir, "new-project");
			mkdirSync(newProjectDir, { recursive: true });

			await saveConfig({ thinking: "high" }, "project", newProjectDir);

			expect(existsSync(join(newProjectDir, ".xi", "settings.json"))).toBe(true);
		});

		test("should merge with existing config", async () => {
			process.env.XI_DIR = tempGlobalConfigDir;
			writeFileSync(
				join(tempGlobalConfigDir, "settings.json"),
				JSON.stringify({ provider: "openai", model: "gpt-3.5" })
			);

			await saveConfig({ model: "gpt-4" });

			const saved = JSON.parse(readFileSync(join(tempGlobalConfigDir, "settings.json"), "utf-8"));
			expect(saved.provider).toBe("openai");
			expect(saved.model).toBe("gpt-4");
		});

		test("should use cwd when projectDir not specified for project scope", async () => {
			const originalCwd = process.cwd;
			process.cwd = () => tempProjectDir;

			await saveConfig({ thinking: "minimal" }, "project");

			process.cwd = originalCwd;

			expect(existsSync(join(tempProjectDir, ".xi", "settings.json"))).toBe(true);
		});
	});

	describe("getGlobalConfigDir", () => {
		test("should return default global config dir using homedir", () => {
			delete process.env.XI_DIR;

			const dir = getGlobalConfigDir();
			expect(dir).toBe(`${homedir()}/.xi`);
		});

		test("should respect XI_DIR environment variable", () => {
			process.env.XI_DIR = "/custom/xi/dir";

			const dir = getGlobalConfigDir();

			expect(dir).toBe("/custom/xi/dir");
		});
	});

	describe("getProjectConfigPath", () => {
		test("should return project config path with projectDir", () => {
			const path = getProjectConfigPath("/myproject");
			expect(path).toBe("/myproject/.xi/settings.json");
		});

		test("should use cwd when projectDir not specified", () => {
			const originalCwd = process.cwd;
			process.cwd = () => "/currentwork";

			const path = getProjectConfigPath();

			expect(path).toBe("/currentwork/.xi/settings.json");

			process.cwd = originalCwd;
		});
	});

	describe("DEFAULT_CONFIG", () => {
		test("should have expected default values", () => {
			expect(DEFAULT_CONFIG.provider).toBe("anthropic");
			expect(DEFAULT_CONFIG.model).toBe("claude-sonnet-4-5");
			expect(DEFAULT_CONFIG.thinking).toBe("medium");
			expect(DEFAULT_CONFIG.enabledSkills).toEqual([]);
			expect(DEFAULT_CONFIG.disabledSkills).toEqual([]);
			expect(DEFAULT_CONFIG.skillsOff).toBe(false);
		});
	});
});
