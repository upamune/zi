import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as nodeFs from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { openSessionForApply } from "./agent/session.js";
import { startBrowseServer } from "./browse/index.js";
import type { CliCommand } from "./cli.js";
import { getGlobalConfigDir, getProjectConfigPath, loadConfig } from "./config/index.js";
import { formatSkillsList, setSkillsOff, updateSkillPreference } from "./skills/index.js";

interface PackageEntry {
	source: string;
	updatedAt: string;
}

interface PackageStore {
	packages: PackageEntry[];
}

interface PackageListResult {
	scope: "global" | "local";
	source: string;
	updatedAt: string;
}

function getPackageStorePath(scope: "global" | "local", cwd: string): string {
	if (scope === "global") {
		return join(getGlobalConfigDir(), "packages.json");
	}
	return join(cwd, ".xi", "packages.json");
}

function loadPackageStore(path: string): PackageStore {
	if (!existsSync(path)) {
		return { packages: [] };
	}
	try {
		const content = readFileSync(path, "utf-8");
		return JSON.parse(content) as PackageStore;
	} catch {
		return { packages: [] };
	}
}

function savePackageStore(path: string, store: PackageStore): void {
	const dir = dirname(path);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(path, JSON.stringify(store, null, 2), "utf-8");
}

export function installSource(source: string, scope: "global" | "local", cwd: string): void {
	const path = getPackageStorePath(scope, cwd);
	const store = loadPackageStore(path);
	if (store.packages.some((entry) => entry.source === source)) {
		throw new Error(`Source already installed: ${source}`);
	}
	store.packages.push({
		source,
		updatedAt: new Date().toISOString(),
	});
	savePackageStore(path, store);
}

export function removeSource(source: string, scope: "global" | "local", cwd: string): void {
	const path = getPackageStorePath(scope, cwd);
	const store = loadPackageStore(path);
	if (!store.packages.some((entry) => entry.source === source)) {
		throw new Error(`Source not found: ${source}`);
	}
	store.packages = store.packages.filter((entry) => entry.source !== source);
	savePackageStore(path, store);
}

export function updateSources(source: string | null, cwd: string): number {
	const paths = [getPackageStorePath("global", cwd), getPackageStorePath("local", cwd)];
	let updates = 0;
	for (const path of paths) {
		const store = loadPackageStore(path);
		let changed = false;
		store.packages = store.packages.map((entry) => {
			if (!source || entry.source === source) {
				updates++;
				changed = true;
				return {
					...entry,
					updatedAt: new Date().toISOString(),
				};
			}
			return entry;
		});
		if (changed) {
			savePackageStore(path, store);
		}
	}
	if (source && updates === 0) {
		throw new Error(`Source not found: ${source}`);
	}
	return updates;
}

export function listSources(cwd: string): PackageListResult[] {
	if (!existsSync(cwd)) {
		throw new Error(`Directory not found: ${cwd}`);
	}
	const globalStore = loadPackageStore(getPackageStorePath("global", cwd));
	const localStore = loadPackageStore(getPackageStorePath("local", cwd));
	const globalEntries = globalStore.packages.map((entry) => ({
		scope: "global" as const,
		source: entry.source,
		updatedAt: entry.updatedAt,
	}));
	const localEntries = localStore.packages.map((entry) => ({
		scope: "local" as const,
		source: entry.source,
		updatedAt: entry.updatedAt,
	}));
	return [...globalEntries, ...localEntries];
}

export async function printConfig(cwd: string): Promise<void> {
	if (!existsSync(cwd)) {
		throw new Error(`Directory not found: ${cwd}`);
	}
	const config = await loadConfig(cwd);
	console.log(JSON.stringify(config, null, 2));
	console.log(`global: ${join(getGlobalConfigDir(), "settings.json")}`);
	console.log(`project: ${getProjectConfigPath(cwd)}`);
}

function toRelativePath(filePath: string, cwdPath: string): string {
	const prefix = cwdPath.endsWith("/") ? cwdPath : `${cwdPath}/`;
	if (filePath.startsWith(prefix)) {
		return filePath.slice(prefix.length);
	}
	return filePath;
}

async function confirm(message: string): Promise<boolean> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(`${message} [Y/n] `, (answer) => {
			rl.close();
			resolve(answer.trim().toLowerCase() !== "n");
		});
	});
}

async function applySession(sessionId: string, cwd: string, sessionDir?: string): Promise<void> {
	const baseDir = sessionDir ?? cwd;
	const session = await openSessionForApply(sessionId, baseDir);

	try {
		if (session.modifiedFiles.length === 0 && session.deletedFiles.length === 0) {
			console.log("No changes to apply.");
			return;
		}

		console.log(`\nApplying session ${sessionId}...\n`);

		for (const filePath of session.modifiedFiles) {
			const display = toRelativePath(filePath, baseDir);
			const isNew = !existsSync(filePath);
			const deltaContent = await session.deltaFs.readFile(filePath);
			const status = isNew ? "A" : "M";
			console.log(`  ${status} ${display} (${deltaContent.length} bytes)`);
		}
		for (const filePath of session.deletedFiles) {
			const display = toRelativePath(filePath, baseDir);
			if (existsSync(filePath)) {
				console.log(`  D ${display}`);
			}
		}

		console.log("");
		const ok = await confirm("Apply these changes?");

		if (!ok) {
			console.log("Cancelled.");
			return;
		}

		let applied = 0;
		for (const filePath of session.modifiedFiles) {
			const deltaContent = await session.deltaFs.readFile(filePath);
			const dir = dirname(filePath);
			if (!existsSync(dir)) {
				await nodeFs.mkdir(dir, { recursive: true });
			}
			await nodeFs.writeFile(filePath, deltaContent);
			applied++;
		}
		for (const filePath of session.deletedFiles) {
			if (existsSync(filePath)) {
				await nodeFs.unlink(filePath);
				applied++;
			}
		}

		console.log(`\n✓ Applied ${applied} file(s)`);
	} finally {
		await session.close();
	}
}

export async function runSubcommand(
	command: CliCommand,
	cwd: string = process.cwd(),
	sessionDir?: string
): Promise<void> {
	const scope: "global" | "local" = command.local ? "local" : "global";
	const configScope: "global" | "project" = command.local ? "project" : "global";
	switch (command.name) {
		case "install":
			installSource(command.source as string, scope, cwd);
			console.log(`Installed ${command.source} (${scope})`);
			return;
		case "remove":
			removeSource(command.source as string, scope, cwd);
			console.log(`Removed ${command.source} (${scope})`);
			return;
		case "update": {
			const count = updateSources(command.source, cwd);
			console.log(`Updated ${count} source(s)`);
			return;
		}
		case "list": {
			const sources = listSources(cwd);
			if (sources.length === 0) {
				console.log("No sources installed");
				return;
			}
			for (const source of sources) {
				console.log(`${source.scope}\t${source.source}\t${source.updatedAt}`);
			}
			return;
		}
		case "config":
			await printConfig(cwd);
			return;
		case "apply":
			await applySession(command.source as string, cwd, sessionDir);
			return;
		case "browse":
			await startBrowseServer(cwd);
			return;
		case "skill": {
			const action = command.action ?? "list";
			if (action === "list") {
				console.log(await formatSkillsList(cwd));
				return;
			}
			if (action === "on") {
				await setSkillsOff(false, configScope, cwd);
				console.log(`Skills enabled (${scope})`);
				return;
			}
			if (action === "off") {
				await setSkillsOff(true, configScope, cwd);
				console.log(`Skills disabled (${scope})`);
				return;
			}
			await updateSkillPreference(command.source as string, action, configScope, cwd);
			console.log(`Skill ${action}d: ${command.source} (${scope})`);
			return;
		}
	}
}
