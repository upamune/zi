import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentsDoc, loadAgentsDocs, renderAgentsDocs } from "../src/agent/agents-doc.js";

async function createTempDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), "xi-agents-doc-"));
}

describe("agents-doc", () => {
	test("should discover AGENTS files from git root to nested cwd", async () => {
		const dir = await createTempDir();
		try {
			await mkdir(join(dir, ".git"));
			await mkdir(join(dir, "apps", "web", "src"), { recursive: true });
			await writeFile(join(dir, "AGENTS.md"), "root", "utf-8");
			await writeFile(join(dir, "apps", "AGENT.md"), "apps", "utf-8");
			await writeFile(join(dir, "apps", "web", ".agents.md"), "web", "utf-8");
			await writeFile(join(dir, "apps", "web", "src", "AGENTS.md"), "src", "utf-8");

			const docs = await loadAgentsDocs({ cwd: join(dir, "apps", "web", "src") });

			expect(docs.map((doc) => doc.relativePath)).toEqual([
				"AGENTS.md",
				"apps/AGENT.md",
				"apps/web/.agents.md",
				"apps/web/src/AGENTS.md",
			]);
			expect(docs.map((doc) => doc.content)).toEqual(["root", "apps", "web", "src"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("should return empty docs when none exist", async () => {
		const dir = await createTempDir();
		try {
			await mkdir(join(dir, ".git"));
			await mkdir(join(dir, "pkg"), { recursive: true });
			const docs = await loadAgentsDocs({ cwd: join(dir, "pkg") });
			expect(docs).toEqual([]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("should only load cwd without git root", async () => {
		const dir = await createTempDir();
		try {
			await mkdir(join(dir, "parent", "child"), { recursive: true });
			await writeFile(join(dir, "parent", "AGENTS.md"), "parent", "utf-8");
			await writeFile(join(dir, "parent", "child", "AGENTS.md"), "child", "utf-8");

			const docs = await loadAgentsDocs({
				cwd: join(dir, "parent", "child"),
				resolveGitRoot: async () => null,
			});

			expect(docs.map((doc) => doc.content)).toEqual(["child"]);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("should truncate rendered instructions by byte budget", () => {
		const docs: AgentsDoc[] = [
			{
				path: "/repo/AGENTS.md",
				relativePath: "AGENTS.md",
				content: "1234567890",
			},
		];
		const rendered = renderAgentsDocs(docs, 20);
		expect(rendered.truncated).toBe(true);
		expect(rendered.text).toBe("");
		expect(rendered.files).toEqual([]);
	});
});
