import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const VERSION = "0.1.0";
export const NAME = "xi";

export interface Config {
	provider: "anthropic" | "openai" | "kimi";
	model: string;
	thinking: "off" | "minimal" | "low" | "medium" | "high";
	enabledSkills: string[];
	disabledSkills: string[];
	skillsOff: boolean;
}

export type ConfigScope = "global" | "project";

export const DEFAULT_CONFIG: Config = {
	provider: "anthropic",
	model: "claude-sonnet-4-5",
	thinking: "medium",
	enabledSkills: [],
	disabledSkills: [],
	skillsOff: false,
};

const GLOBAL_CONFIG_DIR = join(homedir(), ".xi");
const PROJECT_CONFIG_DIR = ".xi";

function getConfigDir(): string {
	return process.env.XI_DIR ?? GLOBAL_CONFIG_DIR;
}

function getConfigPath(): string {
	return join(getConfigDir(), "settings.json");
}

function mergeConfigs(base: Config, override: Partial<Config>): Config {
	return {
		...base,
		...override,
	} as Config;
}

function readJsonFile(path: string): Partial<Config> | null {
	try {
		if (!existsSync(path)) {
			return null;
		}
		const content = readFileSync(path, "utf-8");
		return JSON.parse(content) as Partial<Config>;
	} catch {
		return null;
	}
}

export async function loadConfig(projectDir?: string): Promise<Config> {
	let config = { ...DEFAULT_CONFIG };

	const globalConfig = readJsonFile(getConfigPath());
	if (globalConfig) {
		config = mergeConfigs(config, globalConfig);
	}

	if (projectDir) {
		const projectConfigPath = join(projectDir, PROJECT_CONFIG_DIR, "settings.json");
		const projectConfig = readJsonFile(projectConfigPath);
		if (projectConfig) {
			config = mergeConfigs(config, projectConfig);
		}
	}

	return config;
}

export async function saveConfig(
	config: Partial<Config>,
	scope: ConfigScope = "global",
	projectDir?: string
): Promise<void> {
	const configDir =
		scope === "global" ? getConfigDir() : join(projectDir ?? process.cwd(), PROJECT_CONFIG_DIR);
	const configPath =
		scope === "global"
			? getConfigPath()
			: join(projectDir ?? process.cwd(), PROJECT_CONFIG_DIR, "settings.json");

	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}

	let existingConfig: Partial<Config> = {};
	if (existsSync(configPath)) {
		existingConfig = readJsonFile(configPath) ?? {};
	}

	const mergedConfig = { ...existingConfig, ...config };
	writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), "utf-8");
}

export async function loadScopedConfig(
	scope: ConfigScope,
	projectDir?: string
): Promise<Partial<Config>> {
	const configPath =
		scope === "global"
			? getConfigPath()
			: join(projectDir ?? process.cwd(), PROJECT_CONFIG_DIR, "settings.json");
	return readJsonFile(configPath) ?? {};
}

export function getGlobalConfigDir(): string {
	return getConfigDir();
}

export function getProjectConfigPath(projectDir?: string): string {
	return join(projectDir ?? process.cwd(), PROJECT_CONFIG_DIR, "settings.json");
}
