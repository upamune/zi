import { access, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { ConfigScope } from "@/config/index.js";
import { getGlobalConfigDir, loadConfig, loadScopedConfig, saveConfig } from "@/config/index.js";

export interface SkillDefinition {
	name: string;
	description: string;
	path: string;
	relativePath: string;
	content: string;
	source: "project" | "global";
}

export interface SkillCatalog {
	skills: SkillDefinition[];
	warnings: string[];
	roots: string[];
}

interface ParsedSkill {
	name: string;
	description: string;
	content: string;
}

interface ParsedFrontmatter {
	name?: string;
	description?: string;
}

interface DiscoverSkillsOptions {
	cwd?: string;
	projectRoot?: string;
	globalRoot?: string;
	useCache?: boolean;
}

interface SkillSelection {
	active: SkillDefinition[];
	inactive: SkillDefinition[];
}

interface SkillConfigView {
	enabledSkills: string[];
	disabledSkills: string[];
	skillsOff: boolean;
}

interface RuntimeSkillOptions {
	cliSkillNames?: string[];
	noSkills?: boolean;
}

const SKILL_FILE = "SKILL.md";
const SKILL_CACHE = new Map<string, Promise<SkillCatalog>>();

export async function discoverSkills(options: DiscoverSkillsOptions = {}): Promise<SkillCatalog> {
	const cwd = resolve(options.cwd ?? process.cwd());
	const projectRoot = resolve(options.projectRoot ?? (await findProjectRoot(cwd)));
	const globalRoot = resolve(options.globalRoot ?? join(getGlobalConfigDir(), "skills"));
	const useCache = options.useCache ?? true;
	const cacheKey = `${cwd}:${projectRoot}:${globalRoot}`;

	if (useCache && SKILL_CACHE.has(cacheKey)) {
		return SKILL_CACHE.get(cacheKey) as Promise<SkillCatalog>;
	}

	const loader = loadSkillCatalog(cwd, projectRoot, globalRoot);
	const wrapped = loader.catch((error) => {
		SKILL_CACHE.delete(cacheKey);
		throw error;
	});
	if (useCache) {
		SKILL_CACHE.set(cacheKey, wrapped);
	}
	return wrapped;
}

export function clearSkillCatalogCache(): void {
	SKILL_CACHE.clear();
}

async function loadSkillCatalog(
	cwd: string,
	projectRoot: string,
	globalRoot: string
): Promise<SkillCatalog> {
	const warnings: string[] = [];
	const roots: Array<{ dir: string; source: "project" | "global" }> = [
		{ dir: join(projectRoot, ".xi", "skills"), source: "project" },
		{ dir: globalRoot, source: "global" },
	];
	const seen = new Set<string>();
	const skills: SkillDefinition[] = [];

	for (const root of roots) {
		if (!(await exists(root.dir))) {
			continue;
		}
		const files = await findSkillFiles(root.dir);
		for (const file of files) {
			try {
				const content = await readFile(file, "utf-8");
				const parsed = parseSkillMarkdown(content, file);
				const normalizedName = normalizeSkillName(parsed.name);
				if (seen.has(normalizedName)) {
					continue;
				}
				seen.add(normalizedName);
				skills.push({
					name: parsed.name,
					description: parsed.description,
					path: file,
					relativePath: toDisplayPath(root.dir, file),
					content: parsed.content,
					source: root.source,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				warnings.push(`Failed to load ${file}: ${message}`);
			}
		}
	}

	const cwdRel = relative(projectRoot, cwd);
	const cwdInProject = cwdRel.length === 0 || !cwdRel.startsWith("..");
	const ordered = cwdInProject ? sortByCwdAffinity(skills, projectRoot, cwd) : skills;

	return {
		skills: ordered,
		warnings,
		roots: roots.map((root) => root.dir),
	};
}

function sortByCwdAffinity(
	skills: SkillDefinition[],
	projectRoot: string,
	cwd: string
): SkillDefinition[] {
	return [...skills].sort((a, b) => {
		if (a.source !== b.source) {
			return a.source === "project" ? -1 : 1;
		}
		const diff = affinityScore(a, cwd) - affinityScore(b, cwd);
		if (diff !== 0) {
			return diff;
		}
		const aRel = relative(projectRoot, a.path);
		const bRel = relative(projectRoot, b.path);
		return aRel.localeCompare(bRel);
	});
}

function affinityScore(skill: SkillDefinition, cwd: string): number {
	if (skill.source !== "project") {
		return Number.POSITIVE_INFINITY;
	}
	const skillDir = dirname(skill.path);
	const rel = relative(cwd, skillDir);
	if (rel === "") {
		return 0;
	}
	if (rel.startsWith("..")) {
		return Number.POSITIVE_INFINITY;
	}
	return rel.split(/[\\/]/).filter((part) => part.length > 0).length + 1;
}

async function findProjectRoot(startDir: string): Promise<string> {
	let current = startDir;
	while (true) {
		if (await exists(join(current, ".git"))) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return startDir;
		}
		current = parent;
	}
}

async function findSkillFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await readdir(root, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(root, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === ".git" || entry.name === "node_modules") {
				continue;
			}
			files.push(...(await findSkillFiles(full)));
			continue;
		}
		if (entry.isFile() && entry.name === SKILL_FILE) {
			files.push(full);
		}
	}
	return files;
}

function parseSkillMarkdown(content: string, filePath: string): ParsedSkill {
	const { frontmatter, body } = parseFrontmatter(content);
	const normalizedBody = body.trim();
	if (normalizedBody.length === 0) {
		throw new Error(`Empty skill file: ${filePath}`);
	}
	const name = frontmatter.name?.trim() || deriveSkillName(filePath);
	const description = frontmatter.description?.trim() || deriveDescription(normalizedBody);
	return {
		name,
		description,
		content: normalizedBody,
	};
}

function parseFrontmatter(content: string): { frontmatter: ParsedFrontmatter; body: string } {
	if (!content.startsWith("---\n")) {
		return { frontmatter: {}, body: content };
	}
	const end = content.indexOf("\n---\n", 4);
	if (end === -1) {
		throw new Error("Invalid frontmatter: missing closing delimiter");
	}
	const block = content.slice(4, end);
	const body = content.slice(end + 5);
	const frontmatter: ParsedFrontmatter = {};
	for (const rawLine of block.split("\n")) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith("#")) {
			continue;
		}
		const sep = line.indexOf(":");
		if (sep === -1) {
			continue;
		}
		const key = line.slice(0, sep).trim().toLowerCase();
		const value = line
			.slice(sep + 1)
			.trim()
			.replace(/^['"]|['"]$/g, "");
		if (key === "name") {
			frontmatter.name = value;
		}
		if (key === "description") {
			frontmatter.description = value;
		}
	}
	return { frontmatter, body };
}

function deriveSkillName(filePath: string): string {
	const parent = basename(dirname(filePath));
	return parent.length > 0 ? parent : "skill";
}

function deriveDescription(body: string): string {
	for (const raw of body.split("\n")) {
		const line = raw.trim();
		if (line.length === 0) {
			continue;
		}
		if (line.startsWith("#")) {
			continue;
		}
		return line;
	}
	return "No description provided.";
}

function normalizeSkillName(name: string): string {
	return name.trim().toLowerCase();
}

function toDisplayPath(root: string, filePath: string): string {
	const rel = relative(root, filePath);
	return rel.length > 0 ? rel.replace(/\\/g, "/") : filePath;
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

export function resolveSkillSelection(
	catalog: SkillCatalog,
	config: SkillConfigView,
	runtime: RuntimeSkillOptions = {}
): SkillSelection {
	const disabled = new Set(config.disabledSkills.map((name) => normalizeSkillName(name)));
	const explicit = new Set<string>(
		(runtime.cliSkillNames ?? [])
			.map((name) => normalizeSkillName(name))
			.filter((name) => name.length > 0)
	);
	const configuredEnabled = new Set(
		config.enabledSkills.map((name) => normalizeSkillName(name)).filter((name) => name.length > 0)
	);

	const active: SkillDefinition[] = [];
	const inactive: SkillDefinition[] = [];

	for (const skill of catalog.skills) {
		const key = normalizeSkillName(skill.name);
		const explicitlySelected = explicit.has(key);
		const skillDisabled =
			runtime.noSkills || ((config.skillsOff || disabled.has(key)) && !explicitlySelected);
		if (skillDisabled) {
			inactive.push(skill);
			continue;
		}
		if (explicit.size > 0) {
			if (explicitlySelected) {
				active.push(skill);
			} else {
				inactive.push(skill);
			}
			continue;
		}
		if (configuredEnabled.size > 0) {
			if (configuredEnabled.has(key)) {
				active.push(skill);
			} else {
				inactive.push(skill);
			}
			continue;
		}
		active.push(skill);
	}

	return { active, inactive };
}

export function renderSkillsSection(selection: SkillSelection): string {
	if (selection.active.length === 0) {
		return "";
	}
	const lines = ["Available skills:"];
	for (const skill of selection.active) {
		lines.push(`- ${skill.name}: ${skill.description}`);
	}
	lines.push("- Use a skill when the user explicitly mentions its name or asks for that workflow.");
	return lines.join("\n");
}

export function renderMentionedSkillContext(message: string, selection: SkillSelection): string {
	const mentioned = findMentionedSkills(message, selection.active);
	if (mentioned.length === 0) {
		return "";
	}
	const blocks = mentioned.map(
		(skill) => `# Skill: ${skill.name}\nSource: ${skill.relativePath}\n\n${skill.content}`
	);
	return `The following skill instructions are activated for this user message:\n\n${blocks.join("\n\n")}`;
}

function findMentionedSkills(message: string, skills: SkillDefinition[]): SkillDefinition[] {
	const direct = new Set<string>();
	for (const match of message.matchAll(/\$([A-Za-z0-9._-]+)/g)) {
		direct.add(normalizeSkillName(match[1] ?? ""));
	}
	const lower = message.toLowerCase();
	const matched: SkillDefinition[] = [];
	for (const skill of skills) {
		const key = normalizeSkillName(skill.name);
		if (direct.has(key)) {
			matched.push(skill);
			continue;
		}
		if (containsWholeWord(lower, key)) {
			matched.push(skill);
		}
	}
	return matched;
}

function containsWholeWord(text: string, target: string): boolean {
	if (target.length === 0) {
		return false;
	}
	const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const regex = new RegExp(`(^|[^a-z0-9._-])${escaped}([^a-z0-9._-]|$)`, "i");
	return regex.test(text);
}

export async function updateSkillPreference(
	skillName: string,
	action: "enable" | "disable",
	scope: ConfigScope,
	cwd?: string
): Promise<void> {
	const normalized = skillName.trim();
	if (normalized.length === 0) {
		throw new Error("Skill name is required");
	}
	const config = await loadConfigByScope(scope, cwd);
	if (action === "enable") {
		await saveConfig(
			{
				enabledSkills: uniqueNames([...config.enabledSkills, normalized]),
				disabledSkills: config.disabledSkills.filter(
					(name) => normalizeSkillName(name) !== normalizeSkillName(normalized)
				),
				skillsOff: false,
			},
			scope,
			cwd
		);
		return;
	}
	await saveConfig(
		{
			disabledSkills: uniqueNames([...config.disabledSkills, normalized]),
			enabledSkills: config.enabledSkills.filter(
				(name) => normalizeSkillName(name) !== normalizeSkillName(normalized)
			),
		},
		scope,
		cwd
	);
}

async function loadConfigByScope(scope: ConfigScope, cwd?: string): Promise<SkillConfigView> {
	const scoped = await loadScopedConfig(scope, cwd);
	return {
		enabledSkills: Array.isArray(scoped.enabledSkills) ? scoped.enabledSkills : [],
		disabledSkills: Array.isArray(scoped.disabledSkills) ? scoped.disabledSkills : [],
		skillsOff: scoped.skillsOff === true,
	};
}

function uniqueNames(values: string[]): string[] {
	const seen = new Set<string>();
	const output: string[] = [];
	for (const value of values) {
		const normalized = normalizeSkillName(value);
		if (!normalized || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		output.push(value.trim());
	}
	return output;
}

export async function setSkillsOff(off: boolean, scope: ConfigScope, cwd?: string): Promise<void> {
	await saveConfig({ skillsOff: off }, scope, cwd);
}

export async function formatSkillsList(cwd?: string): Promise<string> {
	const targetCwd = cwd ?? process.cwd();
	const [catalog, config] = await Promise.all([
		discoverSkills({ cwd: targetCwd }),
		loadConfig(targetCwd),
	]);
	const selection = resolveSkillSelection(catalog, config);
	if (catalog.skills.length === 0) {
		return "No skills found.";
	}
	const active = new Set(selection.active.map((skill) => normalizeSkillName(skill.name)));
	const lines = catalog.skills.map((skill) => {
		const state = active.has(normalizeSkillName(skill.name)) ? "enabled" : "disabled";
		return `- ${skill.name} [${state}] (${skill.source}) ${skill.relativePath}`;
	});
	if (catalog.warnings.length > 0) {
		lines.push("");
		lines.push("Warnings:");
		for (const warning of catalog.warnings) {
			lines.push(`- ${warning}`);
		}
	}
	return lines.join("\n");
}
