import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { homedir } from "node:os";
import {
	type Config,
	DEFAULT_CONFIG,
	getGlobalConfigDir,
	getProjectConfigPath,
	loadConfig,
	saveConfig,
} from "../src/config/index.js";

const mockExistsSync = mock((_path: string): boolean => false);
const mockMkdirSync = mock(() => undefined);
const mockReadFileSync = mock((_path: string, _encoding: string): string => "{}");
const mockWriteFileSync = mock((_path: string, _data: string, _encoding: string): void => {});

mock.module("node:fs", () => ({
	existsSync: mockExistsSync,
	mkdirSync: mockMkdirSync,
	readFileSync: mockReadFileSync,
	writeFileSync: mockWriteFileSync,
}));

describe("Config", () => {
	const originalEnv = process.env.ZI_DIR;

	beforeEach(() => {
		mockExistsSync.mockReset();
		mockMkdirSync.mockReset();
		mockReadFileSync.mockReset();
		mockWriteFileSync.mockReset();
		delete process.env.ZI_DIR;
	});

	afterAll(() => {
		if (originalEnv !== undefined) {
			process.env.ZI_DIR = originalEnv;
		} else {
			delete process.env.ZI_DIR;
		}
	});

	describe("loadConfig", () => {
		test("should return default config when no config files exist", async () => {
			mockExistsSync.mockImplementation(() => false);

			const config = await loadConfig();

			expect(config).toEqual(DEFAULT_CONFIG);
		});

		test("should load global config only", async () => {
			const globalConfig: Partial<Config> = { provider: "openai", model: "gpt-4" };
			mockExistsSync.mockImplementation((path: string) => {
				if (path.includes(".zi/settings.json") && !path.includes("/project")) {
					return true;
				}
				return false;
			});
			mockReadFileSync.mockImplementation((path: string) => {
				if (path.includes(".zi/settings.json") && !path.includes("/project")) {
					return JSON.stringify(globalConfig);
				}
				return "{}";
			});

			const config = await loadConfig();

			expect(config.provider).toBe("openai");
			expect(config.model).toBe("gpt-4");
			expect(config.thinking).toBe(DEFAULT_CONFIG.thinking);
		});

		test("should load project config only", async () => {
			const projectConfig: Partial<Config> = { provider: "kimi", thinking: "high" };
			mockExistsSync.mockImplementation((path: string) => {
				if (path.includes("/project/.zi/settings.json")) {
					return true;
				}
				return false;
			});
			mockReadFileSync.mockImplementation((path: string) => {
				if (path.includes("/project/.zi/settings.json")) {
					return JSON.stringify(projectConfig);
				}
				return "{}";
			});

			const config = await loadConfig("/project");

			expect(config.provider).toBe("kimi");
			expect(config.thinking).toBe("high");
			expect(config.model).toBe(DEFAULT_CONFIG.model);
		});

		test("should merge global and project config with project priority", async () => {
			const globalConfig: Partial<Config> = { provider: "openai", model: "gpt-4" };
			const projectConfig: Partial<Config> = { model: "gpt-4o", thinking: "low" };
			mockExistsSync.mockImplementation(() => true);
			mockReadFileSync.mockImplementation((path: string) => {
				if (path.includes("/project/.zi/settings.json")) {
					return JSON.stringify(projectConfig);
				}
				if (path.includes(".zi/settings.json")) {
					return JSON.stringify(globalConfig);
				}
				return "{}";
			});

			const config = await loadConfig("/project");

			expect(config.provider).toBe("openai");
			expect(config.model).toBe("gpt-4o");
			expect(config.thinking).toBe("low");
		});

		test("should handle invalid JSON in config file", async () => {
			mockExistsSync.mockImplementation(() => true);
			mockReadFileSync.mockImplementation(() => "not valid json {{{");

			const config = await loadConfig();

			expect(config).toEqual(DEFAULT_CONFIG);
		});

		test("should handle empty project dir", async () => {
			mockExistsSync.mockImplementation(() => false);

			const config = await loadConfig();

			expect(config).toEqual(DEFAULT_CONFIG);
		});
	});

	describe("saveConfig", () => {
		test("should save to global config by default", async () => {
			let capturedPath = "";
			let capturedContent = "";
			mockExistsSync.mockImplementation(() => true);
			mockReadFileSync.mockImplementation(() => '{"provider":"openai"}');
			mockWriteFileSync.mockImplementation((path: string, content: string) => {
				capturedPath = path;
				capturedContent = content;
			});

			await saveConfig({ model: "gpt-4" });

			expect(capturedPath).toContain(".zi/settings.json");
			const writtenContent = JSON.parse(capturedContent);
			expect(writtenContent.model).toBe("gpt-4");
		});

		test("should save to project config when scope is project", async () => {
			let capturedPath = "";
			mockExistsSync.mockImplementation(() => true);
			mockReadFileSync.mockImplementation(() => "{}");
			mockWriteFileSync.mockImplementation((path: string) => {
				capturedPath = path;
			});

			await saveConfig({ provider: "kimi" }, "project", "/myproject");

			expect(capturedPath).toContain("/myproject/.zi/settings.json");
		});

		test("should create config directory if not exists", async () => {
			let mkdirCalled = false;
			mockExistsSync.mockImplementation(() => false);
			mockMkdirSync.mockImplementation(() => {
				mkdirCalled = true;
			});
			mockWriteFileSync.mockImplementation(() => {});

			await saveConfig({ thinking: "high" });

			expect(mkdirCalled).toBe(true);
		});

		test("should merge with existing config", async () => {
			let capturedContent = "";
			mockExistsSync.mockImplementation(() => true);
			mockReadFileSync.mockImplementation(() => '{"provider":"openai","model":"gpt-3.5"}');
			mockWriteFileSync.mockImplementation((_path: string, content: string) => {
				capturedContent = content;
			});

			await saveConfig({ model: "gpt-4" });

			const writtenContent = JSON.parse(capturedContent);
			expect(writtenContent.provider).toBe("openai");
			expect(writtenContent.model).toBe("gpt-4");
		});

		test("should use cwd when projectDir not specified for project scope", async () => {
			const originalCwd = process.cwd;
			process.cwd = () => "/testcwd";
			let capturedPath = "";
			mockExistsSync.mockImplementation(() => true);
			mockReadFileSync.mockImplementation(() => "{}");
			mockWriteFileSync.mockImplementation((path: string) => {
				capturedPath = path;
			});

			await saveConfig({ thinking: "minimal" }, "project");

			expect(capturedPath).toContain("/testcwd/.zi/settings.json");

			process.cwd = originalCwd;
		});
	});

	describe("getGlobalConfigDir", () => {
		test("should return default global config dir using homedir", () => {
			const dir = getGlobalConfigDir();
			expect(dir).toBe(`${homedir()}/.zi`);
		});

		test("should respect ZI_DIR environment variable", () => {
			process.env.ZI_DIR = "/custom/zi/dir";

			const dir = getGlobalConfigDir();

			expect(dir).toBe("/custom/zi/dir");
		});
	});

	describe("getProjectConfigPath", () => {
		test("should return project config path with projectDir", () => {
			const path = getProjectConfigPath("/myproject");
			expect(path).toBe("/myproject/.zi/settings.json");
		});

		test("should use cwd when projectDir not specified", () => {
			const originalCwd = process.cwd;
			process.cwd = () => "/currentwork";

			const path = getProjectConfigPath();

			expect(path).toBe("/currentwork/.zi/settings.json");

			process.cwd = originalCwd;
		});
	});

	describe("DEFAULT_CONFIG", () => {
		test("should have expected default values", () => {
			expect(DEFAULT_CONFIG.provider).toBe("anthropic");
			expect(DEFAULT_CONFIG.model).toBe("claude-sonnet-4-5");
			expect(DEFAULT_CONFIG.thinking).toBe("medium");
		});
	});
});
