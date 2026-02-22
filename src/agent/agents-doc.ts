import { access, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export const DEFAULT_AGENTS_FILENAMES = ["AGENTS.md", "AGENT.md", ".agents.md"] as const;
export const DEFAULT_AGENTS_BYTE_BUDGET = 32 * 1024;

export interface AgentsDoc {
	path: string;
	relativePath: string;
	content: string;
}

export interface LoadAgentsDocsOptions {
	cwd?: string;
	filenames?: readonly string[];
}

export interface RenderedAgentsDocs {
	text: string;
	truncated: boolean;
	files: string[];
}

export async function loadAgentsDocs(options: LoadAgentsDocsOptions = {}): Promise<AgentsDoc[]> {
	const cwd = resolve(options.cwd ?? process.cwd());
	const filenames = options.filenames ?? DEFAULT_AGENTS_FILENAMES;
	const gitRoot = await findGitRoot(cwd);
	const searchRoot = gitRoot ?? cwd;
	const dirs = listDirsFromRoot(searchRoot, cwd);
	const docs: AgentsDoc[] = [];

	for (const dir of dirs) {
		const match = await findFirstExistingFile(dir, filenames);
		if (!match) {
			continue;
		}
		const content = await readFile(match, "utf-8");
		docs.push({
			path: match,
			relativePath: toDisplayPath(searchRoot, match),
			content,
		});
	}

	return docs;
}

export function renderAgentsDocs(
	docs: AgentsDoc[],
	maxBytes: number = DEFAULT_AGENTS_BYTE_BUDGET
): RenderedAgentsDocs {
	if (docs.length === 0 || maxBytes <= 0) {
		return { text: "", truncated: false, files: [] };
	}

	let text = "";
	let remaining = maxBytes;
	const files: string[] = [];
	let truncated = false;

	for (const doc of docs) {
		const block = `\n\n# ${doc.relativePath}\n${doc.content}`;
		const blockBytes = Buffer.byteLength(block, "utf-8");
		if (blockBytes <= remaining) {
			text += block;
			remaining -= blockBytes;
			files.push(doc.path);
			continue;
		}
		const partial = truncateUtf8(block, remaining);
		if (partial.length > 0) {
			text += partial;
			files.push(doc.path);
		}
		truncated = true;
		break;
	}

	if (text.length === 0) {
		return { text: "", truncated, files };
	}

	return {
		text: `Project instructions from AGENTS files:${text}`,
		truncated,
		files,
	};
}

async function findGitRoot(startDir: string): Promise<string | null> {
	let current = startDir;
	while (true) {
		if (await exists(join(current, ".git"))) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

function listDirsFromRoot(root: string, target: string): string[] {
	const normalizedRoot = resolve(root);
	const normalizedTarget = resolve(target);
	if (normalizedRoot === normalizedTarget) {
		return [normalizedRoot];
	}
	const rel = relative(normalizedRoot, normalizedTarget);
	if (rel === "" || rel.startsWith("..")) {
		return [normalizedTarget];
	}
	const parts = rel.split(/[/\\]/).filter((part) => part.length > 0);
	const dirs: string[] = [normalizedRoot];
	let current = normalizedRoot;
	for (const part of parts) {
		current = join(current, part);
		dirs.push(current);
	}
	return dirs;
}

async function findFirstExistingFile(
	dir: string,
	filenames: readonly string[]
): Promise<string | null> {
	for (const name of filenames) {
		const path = join(dir, name);
		if (await exists(path)) {
			return path;
		}
	}
	return null;
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function truncateUtf8(input: string, maxBytes: number): string {
	if (maxBytes <= 0) {
		return "";
	}
	let total = 0;
	let out = "";
	for (const char of input) {
		const size = Buffer.byteLength(char, "utf-8");
		if (total + size > maxBytes) {
			break;
		}
		out += char;
		total += size;
	}
	return out;
}

function toDisplayPath(root: string, filePath: string): string {
	const rel = relative(root, filePath);
	return rel.length > 0 ? rel.replace(/\\/g, "/") : filePath;
}
