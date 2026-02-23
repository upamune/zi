import { Database } from "bun:sqlite";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ToolCall, ToolCallStats } from "agentfs-sdk";
import { BunSqliteAdapter } from "../db/bun-sqlite-adapter.js";
import { OverlayAgentFS } from "../fs/overlay-agentfs.js";

const { AgentFS } = await import("../../node_modules/agentfs-sdk/dist/index_browser.js");

const SESSIONS_DIR = ".xi/sessions";

export interface SessionSummary {
	id: string;
	created: Date;
	modified: Date;
	fileSize: number;
	toolCallCount: number;
	toolNames: string[];
}

export interface SessionDetail extends SessionSummary {
	toolCalls: ToolCall[];
	toolStats: ToolCallStats[];
	modifiedFiles: string[];
	deletedFiles: string[];
}

interface FileContent {
	path: string;
	content: string;
}

function getSessionsDir(baseDir: string): string {
	return join(baseDir, SESSIONS_DIR);
}

export function listSessionSummaries(baseDir: string): SessionSummary[] {
	const dir = getSessionsDir(baseDir);
	if (!existsSync(dir)) {
		return [];
	}

	const files = readdirSync(dir).filter((f) => f.endsWith(".db"));
	const summaries: SessionSummary[] = [];

	for (const file of files) {
		const dbPath = join(dir, file);
		const id = file.replace(".db", "");

		try {
			const stat = statSync(dbPath);
			const db = new Database(dbPath, { readonly: true });

			let toolCallCount = 0;
			let toolNames: string[] = [];
			try {
				const countRow = db.query("SELECT count(*) as cnt FROM tool_calls").get() as {
					cnt: number;
				} | null;
				toolCallCount = countRow?.cnt ?? 0;

				const nameRows = db.query("SELECT DISTINCT name FROM tool_calls ORDER BY name").all() as {
					name: string;
				}[];
				toolNames = nameRows.map((r) => r.name);
			} catch {
				// tool_calls テーブルが存在しない場合
			} finally {
				db.close();
			}

			summaries.push({
				id,
				created: stat.birthtime,
				modified: stat.mtime,
				fileSize: stat.size,
				toolCallCount,
				toolNames,
			});
		} catch {
			// 読めないDBはスキップ
		}
	}

	summaries.sort((a, b) => b.modified.getTime() - a.modified.getTime());
	return summaries;
}

export async function getSessionDetail(
	sessionId: string,
	baseDir: string
): Promise<SessionDetail | null> {
	const dbPath = join(getSessionsDir(baseDir), `${sessionId}.db`);
	if (!existsSync(dbPath)) {
		return null;
	}

	const stat = statSync(dbPath);
	const db = new BunSqliteAdapter(dbPath);
	// biome-ignore lint/suspicious/noExplicitAny: BunSqliteAdapter は DatabasePromise の public API を満たすが private プロパティが型に含まれるため
	const agentfs = await AgentFS.openWith(db as any);

	try {
		const toolCalls = await agentfs.tools.getRecent(0);
		const toolStats = await agentfs.tools.getStats();
		const manifest = await OverlayAgentFS.loadManifest(agentfs.fs);

		let toolCallCount = 0;
		let toolNames: string[] = [];
		try {
			const rawDb = new Database(dbPath, { readonly: true });
			const countRow = rawDb.query("SELECT count(*) as cnt FROM tool_calls").get() as {
				cnt: number;
			} | null;
			toolCallCount = countRow?.cnt ?? 0;
			const nameRows = rawDb.query("SELECT DISTINCT name FROM tool_calls ORDER BY name").all() as {
				name: string;
			}[];
			toolNames = nameRows.map((r) => r.name);
			rawDb.close();
		} catch {
			toolCallCount = toolCalls.length;
			toolNames = [...new Set(toolCalls.map((tc) => tc.name))];
		}

		return {
			id: sessionId,
			created: stat.birthtime,
			modified: stat.mtime,
			fileSize: stat.size,
			toolCallCount,
			toolNames,
			toolCalls,
			toolStats,
			modifiedFiles: manifest.modified,
			deletedFiles: manifest.deleted,
		};
	} finally {
		await agentfs.close();
	}
}

export async function getFileContent(
	sessionId: string,
	filePath: string,
	baseDir: string
): Promise<FileContent | null> {
	const dbPath = join(getSessionsDir(baseDir), `${sessionId}.db`);
	if (!existsSync(dbPath)) {
		return null;
	}

	const db = new BunSqliteAdapter(dbPath);
	// biome-ignore lint/suspicious/noExplicitAny: BunSqliteAdapter は DatabasePromise の public API を満たすが private プロパティが型に含まれるため
	const agentfs = await AgentFS.openWith(db as any);

	try {
		const content = await agentfs.fs.readFile(filePath, "utf-8");
		return { path: filePath, content: content as string };
	} catch {
		return null;
	} finally {
		await agentfs.close();
	}
}
