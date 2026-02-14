import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { FileSystem, KvStore, ToolCalls } from "agentfs-sdk";
import { BunSqliteAdapter } from "../db/bun-sqlite-adapter.js";
import { OverlayAgentFS } from "../fs/overlay-agentfs.js";
import { SessionManager } from "./session-manager.js";

// agentfs-sdk の browser export を使用 (native binding 不要、bun compile 対応)
// node export は @tursodatabase/database の native binding を top-level import するため使えない
const { AgentFS } = await import("../../node_modules/agentfs-sdk/dist/index_browser.js");

export interface Session {
	id: string;
	path: string;
	fs: FileSystem;
	kv: KvStore;
	tools: ToolCalls;
	sessionManager: SessionManager;
	getModifiedFiles(): string[];
	persistManifest(): Promise<void>;
	close(): Promise<void>;
}

const SESSIONS_DIR = ".zi/sessions";

function getSessionsDir(baseDir?: string): string {
	return join(baseDir ?? process.cwd(), SESSIONS_DIR);
}

function getSessionPath(id: string, baseDir?: string): string {
	return join(getSessionsDir(baseDir), `${id}.db`);
}

async function ensureSessionsDir(baseDir?: string): Promise<void> {
	const dir = getSessionsDir(baseDir);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

export async function createSession(id: string, baseDir?: string): Promise<Session> {
	await ensureSessionsDir(baseDir);
	const path = getSessionPath(id, baseDir);
	const cwd = baseDir ?? process.cwd();

	const db = new BunSqliteAdapter(path);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- BunSqliteAdapter は DatabasePromise の public API を満たすが private プロパティが型に含まれるため
	const agentfs = await AgentFS.openWith(db as any);
	const sessionManager = SessionManager.create(cwd);
	const overlay = new OverlayAgentFS(agentfs.fs, cwd);

	return {
		id,
		path,
		fs: overlay,
		kv: agentfs.kv,
		tools: agentfs.tools,
		sessionManager,
		getModifiedFiles: () => overlay.getModifiedFiles(),
		persistManifest: () => overlay.persistManifest(),
		close: () => agentfs.close(),
	};
}

export async function loadSession(id: string, baseDir?: string): Promise<Session> {
	const path = getSessionPath(id, baseDir);

	if (!existsSync(path)) {
		throw new Error(`Session not found: ${id}`);
	}

	const cwd = baseDir ?? process.cwd();
	const db = new BunSqliteAdapter(path);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- BunSqliteAdapter は DatabasePromise の public API を満たすが private プロパティが型に含まれるため
	const agentfs = await AgentFS.openWith(db as any);
	const sessionManager = SessionManager.create(cwd);
	const overlay = new OverlayAgentFS(agentfs.fs, cwd);

	return {
		id,
		path,
		fs: overlay,
		kv: agentfs.kv,
		tools: agentfs.tools,
		sessionManager,
		getModifiedFiles: () => overlay.getModifiedFiles(),
		persistManifest: () => overlay.persistManifest(),
		close: () => agentfs.close(),
	};
}

export function sessionExists(id: string, baseDir?: string): boolean {
	const path = getSessionPath(id, baseDir);
	return existsSync(path);
}

export function listSessions(baseDir?: string): string[] {
	const dir = getSessionsDir(baseDir);
	if (!existsSync(dir)) {
		return [];
	}

	const files = readdirSync(dir);
	return files.filter((f) => f.endsWith(".db")).map((f) => f.replace(".db", ""));
}

export interface ApplySession {
	deltaFs: FileSystem;
	modifiedFiles: string[];
	close(): Promise<void>;
}

export async function openSessionForApply(id: string, baseDir?: string): Promise<ApplySession> {
	const path = getSessionPath(id, baseDir);
	if (!existsSync(path)) {
		throw new Error(`Session not found: ${id}`);
	}

	const db = new BunSqliteAdapter(path);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const agentfs = await AgentFS.openWith(db as any);
	const modifiedFiles = await OverlayAgentFS.loadManifest(agentfs.fs);

	return {
		deltaFs: agentfs.fs,
		modifiedFiles,
		close: () => agentfs.close(),
	};
}

export function deleteSession(id: string, baseDir?: string): void {
	const path = getSessionPath(id, baseDir);
	if (existsSync(path)) {
		unlinkSync(path);
	}
}
