import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, loadScopedConfig } from "../src/config/index.js";
import {
	clearSkillCatalogCache,
	discoverSkills,
	resolveSkillSelection,
	setSkillsOff,
	updateSkillPreference,
} from "../src/skills/index.js";

describe("skills", () => {
	let rootDir: string;
	let globalDir: string;
	let originalXiDir: string | undefined;

	beforeEach(async () => {
		rootDir = await mkdtemp(join(tmpdir(), "xi-skills-root-"));
		globalDir = await mkdtemp(join(tmpdir(), "xi-skills-global-"));
		originalXiDir = process.env.XI_DIR;
		process.env.XI_DIR = globalDir;
		await mkdir(join(rootDir, ".git"));
		clearSkillCatalogCache();
	});

	afterEach(async () => {
		if (originalXiDir === undefined) {
			delete process.env.XI_DIR;
		} else {
			process.env.XI_DIR = originalXiDir;
		}
		await rm(rootDir, { recursive: true, force: true });
		await rm(globalDir, { recursive: true, force: true });
		clearSkillCatalogCache();
	});

	test("should prioritize project skill when names collide", async () => {
		await mkdir(join(rootDir, ".xi", "skills", "qmd"), { recursive: true });
		await mkdir(join(globalDir, "skills", "qmd"), { recursive: true });
		await writeFile(
			join(rootDir, ".xi", "skills", "qmd", "SKILL.md"),
			"---\nname: qmd\ndescription: project skill\n---\nproject",
			"utf-8"
		);
		await writeFile(
			join(globalDir, "skills", "qmd", "SKILL.md"),
			"---\nname: qmd\ndescription: global skill\n---\nglobal",
			"utf-8"
		);

		const catalog = await discoverSkills({ cwd: rootDir, useCache: false });
		expect(catalog.skills).toHaveLength(1);
		expect(catalog.skills[0]?.source).toBe("project");
		expect(catalog.skills[0]?.description).toBe("project skill");
	});

	test("should prioritize skills closer to cwd", async () => {
		await mkdir(join(rootDir, ".xi", "skills", "alpha"), { recursive: true });
		await mkdir(join(rootDir, ".xi", "skills", "nested", "beta"), { recursive: true });
		await writeFile(
			join(rootDir, ".xi", "skills", "alpha", "SKILL.md"),
			"---\nname: alpha\ndescription: alpha\n---\nalpha",
			"utf-8"
		);
		await writeFile(
			join(rootDir, ".xi", "skills", "nested", "beta", "SKILL.md"),
			"---\nname: beta\ndescription: beta\n---\nbeta",
			"utf-8"
		);

		const cwd = join(rootDir, ".xi", "skills", "nested");
		const catalog = await discoverSkills({ cwd, useCache: false });
		expect(catalog.skills.map((skill) => skill.name)).toEqual(["beta", "alpha"]);
	});

	test("should fail open when a skill file is invalid", async () => {
		await mkdir(join(rootDir, ".xi", "skills", "ok"), { recursive: true });
		await mkdir(join(rootDir, ".xi", "skills", "broken"), { recursive: true });
		await writeFile(
			join(rootDir, ".xi", "skills", "ok", "SKILL.md"),
			"---\nname: ok\ndescription: works\n---\nhello",
			"utf-8"
		);
		await writeFile(
			join(rootDir, ".xi", "skills", "broken", "SKILL.md"),
			"---\nname: broken\ndescription: missing close\nbody",
			"utf-8"
		);

		const catalog = await discoverSkills({ cwd: rootDir, useCache: false });
		expect(catalog.skills.map((skill) => skill.name)).toEqual(["ok"]);
		expect(catalog.warnings).toHaveLength(1);
	});

	test("should persist enable/disable and off toggles", async () => {
		await mkdir(join(rootDir, ".xi", "skills", "alpha"), { recursive: true });
		await writeFile(
			join(rootDir, ".xi", "skills", "alpha", "SKILL.md"),
			"---\nname: alpha\ndescription: alpha skill\n---\nalpha",
			"utf-8"
		);

		await updateSkillPreference("alpha", "enable", "project", rootDir);
		await updateSkillPreference("beta", "disable", "project", rootDir);
		await setSkillsOff(true, "project", rootDir);

		const config = await loadConfig(rootDir);
		expect(config.enabledSkills).toEqual(["alpha"]);
		expect(config.disabledSkills).toEqual(["beta"]);
		expect(config.skillsOff).toBe(true);

		const catalog = await discoverSkills({ cwd: rootDir, useCache: false });
		const selection = resolveSkillSelection(catalog, config);
		expect(selection.active).toEqual([]);
		expect(selection.inactive.map((skill) => skill.name)).toEqual(["alpha"]);
	});

	test("should prioritize explicit cli skills over disabled config", async () => {
		await mkdir(join(rootDir, ".xi", "skills", "qmd"), { recursive: true });
		await writeFile(
			join(rootDir, ".xi", "skills", "qmd", "SKILL.md"),
			"---\nname: qmd\ndescription: qmd\n---\nqmd",
			"utf-8"
		);

		const catalog = await discoverSkills({ cwd: rootDir, useCache: false });
		const selection = resolveSkillSelection(
			catalog,
			{
				enabledSkills: [],
				disabledSkills: ["qmd"],
				skillsOff: false,
			},
			{
				cliSkillNames: ["qmd"],
				noSkills: false,
			}
		);

		expect(selection.active.map((skill) => skill.name)).toEqual(["qmd"]);
		expect(selection.inactive).toEqual([]);
	});

	test("should not leak global enabled skills into project config", async () => {
		await mkdir(join(rootDir, ".xi", "skills", "alpha"), { recursive: true });
		await writeFile(
			join(rootDir, ".xi", "skills", "alpha", "SKILL.md"),
			"---\nname: alpha\ndescription: alpha skill\n---\nalpha",
			"utf-8"
		);

		await updateSkillPreference("globalOnly", "enable", "global", rootDir);
		await updateSkillPreference("alpha", "enable", "project", rootDir);

		const projectConfig = await loadScopedConfig("project", rootDir);
		expect(projectConfig.enabledSkills).toEqual(["alpha"]);
	});

	test("should evict failed cache entries", async () => {
		const brokenRoot = join(rootDir, "broken-root");
		await writeFile(brokenRoot, "not-a-directory", "utf-8");

		await expect(
			discoverSkills({
				cwd: rootDir,
				projectRoot: rootDir,
				globalRoot: brokenRoot,
				useCache: true,
			})
		).rejects.toThrow();

		await rm(brokenRoot, { force: true });
		await mkdir(join(brokenRoot, "qmd"), { recursive: true });
		await writeFile(
			join(brokenRoot, "qmd", "SKILL.md"),
			"---\nname: qmd\ndescription: recovered\n---\nhello",
			"utf-8"
		);

		const recovered = await discoverSkills({
			cwd: rootDir,
			projectRoot: rootDir,
			globalRoot: brokenRoot,
			useCache: true,
		});
		expect(recovered.skills.map((skill) => skill.name)).toEqual(["qmd"]);
	});
});
