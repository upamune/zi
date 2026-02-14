import { randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import type {
	AppendMessage,
	CompactionEntry,
	FileEntry,
	MessageEntry,
	ModelChangeEntry,
	SessionContext,
	SessionEntry,
	SessionHeader,
	SessionInfo,
	SessionTreeNode,
} from "./session-types.js";
import { CURRENT_SESSION_VERSION } from "./session-types.js";

function generateId(byId: { has(id: string): boolean }): string {
	for (let i = 0; i < 100; i++) {
		const id = randomUUID().slice(0, 8);
		if (!byId.has(id)) return id;
	}
	return randomUUID();
}

function toToolOutput(result: unknown): Record<string, unknown> {
	try {
		JSON.stringify(result);
		return { type: "json", value: result };
	} catch {
		return { type: "text", value: String(result) };
	}
}

function entryToMessage(entry: MessageEntry): ModelMessage {
	const content = entry.content;

	if (entry.role === "assistant" && entry.toolInvocations?.length) {
		const parts: Array<Record<string, unknown>> = [];
		const textContent = typeof content === "string" ? content : content?.[0]?.text;
		if (textContent) {
			parts.push({ type: "text", text: textContent });
		}
		for (const inv of entry.toolInvocations) {
			parts.push({
				type: "tool-call",
				toolCallId: inv.toolCallId,
				toolName: inv.toolName,
				input: inv.args,
			});
		}
		return { role: "assistant", content: parts } as unknown as ModelMessage;
	}

	if (entry.role === "tool" && entry.toolInvocations?.length) {
		const parts = entry.toolInvocations.map((inv) => ({
			type: "tool-result" as const,
			toolCallId: inv.toolCallId,
			toolName: inv.toolName,
			output: toToolOutput(inv.result),
		}));
		return { role: "tool", content: parts } as unknown as ModelMessage;
	}

	if (typeof content === "string") {
		return { role: entry.role, content } as ModelMessage;
	}

	return {
		role: entry.role,
		content: content.map((block) => {
			if (block.type === "text") {
				return { type: "text" as const, text: block.text ?? "" };
			}
			return {
				type: "image" as const,
				image: block.image ?? "",
				mimeType: block.mimeType ?? "image/png",
			};
		}),
	} as ModelMessage;
}

export class SessionManager {
	private sessionId: string = "";
	private sessionFile: string | undefined;
	private sessionDir: string;
	private cwd: string;
	private persist: boolean;
	private fileEntries: FileEntry[] = [];
	private byId: Map<string, SessionEntry> = new Map();
	private leafId: string | null = null;

	private constructor(
		cwd: string,
		sessionDir: string,
		sessionFile: string | undefined,
		persist: boolean
	) {
		this.cwd = cwd;
		this.sessionDir = sessionDir;
		this.persist = persist;

		if (sessionFile) {
			this.setSessionFile(sessionFile);
		} else {
			this.newSession();
		}
	}

	setSessionFile(sessionFile: string): void {
		this.sessionFile = sessionFile;
		this._loadFromFile();
	}

	private _loadFromFile(): void {
		if (!this.sessionFile) return;
		this.fileEntries = this._readEntriesFromFile();
		if (this.fileEntries.length === 0) {
			this.newSession();
			return;
		}

		const header = this.fileEntries[0];
		if (header.type !== "session") {
			this.newSession();
			return;
		}

		this.sessionId = header.id;
		this._buildIndex();
	}

	protected _readEntriesFromFile(): FileEntry[] {
		return [];
	}

	protected _writeEntriesToFile(): void {}

	private _buildIndex(): void {
		this.byId.clear();
		this.leafId = null;

		for (const entry of this.fileEntries) {
			if (entry.type === "session") continue;
			this.byId.set(entry.id, entry);
			this.leafId = entry.id;
		}
	}

	newSession(options?: { parentSession?: string }): string | undefined {
		this.sessionId = randomUUID();
		const timestamp = new Date().toISOString();
		const header: SessionHeader = {
			type: "session",
			version: CURRENT_SESSION_VERSION,
			id: this.sessionId,
			timestamp,
			cwd: this.cwd,
			parentSession: options?.parentSession,
		};
		this.fileEntries = [header];
		this.byId.clear();
		this.leafId = null;

		if (this.persist) {
			this._writeEntriesToFile();
		}

		return this.sessionFile;
	}

	getCwd(): string {
		return this.cwd;
	}

	getSessionDir(): string {
		return this.sessionDir;
	}

	getSessionId(): string {
		return this.sessionId;
	}

	getSessionFile(): string | undefined {
		return this.sessionFile;
	}

	isPersisted(): boolean {
		return this.persist;
	}

	private _appendEntry(entry: SessionEntry): void {
		this.fileEntries.push(entry);
		this.byId.set(entry.id, entry);
		this.leafId = entry.id;

		if (this.persist) {
			this._persistEntry(entry);
		}
	}

	protected _persistEntry(_entry: SessionEntry): void {}

	appendMessage(message: AppendMessage): string {
		const entry: MessageEntry = {
			type: "message",
			id: generateId(this.byId),
			parentId: this.leafId,
			timestamp: Date.now(),
			...message,
		};
		this._appendEntry(entry);
		return entry.id;
	}

	appendModelChange(provider: string, modelId: string): string {
		const entry: ModelChangeEntry = {
			type: "model_change",
			id: generateId(this.byId),
			parentId: this.leafId,
			timestamp: Date.now(),
			provider,
			modelId,
		};
		this._appendEntry(entry);
		return entry.id;
	}

	appendCompaction(summary: string, firstKeptEntryId: string, tokensBefore: number): string {
		const entry: CompactionEntry = {
			type: "compaction",
			id: generateId(this.byId),
			parentId: this.leafId,
			timestamp: Date.now(),
			summary,
			firstKeptEntryId,
			tokensBefore,
		};
		this._appendEntry(entry);
		return entry.id;
	}

	getLeafId(): string | null {
		return this.leafId;
	}

	getLeafEntry(): SessionEntry | undefined {
		return this.leafId ? this.byId.get(this.leafId) : undefined;
	}

	getEntry(id: string): SessionEntry | undefined {
		return this.byId.get(id);
	}

	getChildren(parentId: string): SessionEntry[] {
		const children: SessionEntry[] = [];
		for (const entry of this.byId.values()) {
			if (entry.parentId === parentId) {
				children.push(entry);
			}
		}
		return children.sort((a, b) => a.timestamp - b.timestamp);
	}

	getBranch(fromId?: string): SessionEntry[] {
		const path: SessionEntry[] = [];
		const startId = fromId ?? this.leafId;
		let current = startId ? this.byId.get(startId) : undefined;

		while (current) {
			path.unshift(current);
			current = current.parentId ? this.byId.get(current.parentId) : undefined;
		}

		return path;
	}

	getTree(): SessionTreeNode[] {
		const entries = this.getEntries();
		const nodeMap = new Map<string, SessionTreeNode>();
		const roots: SessionTreeNode[] = [];

		for (const entry of entries) {
			nodeMap.set(entry.id, { entry, children: [] });
		}

		for (const entry of entries) {
			const node = nodeMap.get(entry.id)!;
			if (entry.parentId === null) {
				roots.push(node);
			} else {
				const parent = nodeMap.get(entry.parentId);
				if (parent) {
					parent.children.push(node);
				} else {
					roots.push(node);
				}
			}
		}

		const stack: SessionTreeNode[] = [...roots];
		while (stack.length > 0) {
			const node = stack.pop()!;
			node.children.sort((a, b) => a.entry.timestamp - b.entry.timestamp);
			stack.push(...node.children);
		}

		return roots;
	}

	buildSessionContext(): SessionContext {
		const path = this.getBranch();

		let model: { provider: string; modelId: string } | null = null;

		for (const entry of path) {
			if (entry.type === "model_change") {
				model = { provider: entry.provider, modelId: entry.modelId };
			} else if (
				entry.type === "message" &&
				entry.role === "assistant" &&
				entry.provider &&
				entry.model
			) {
				model = { provider: entry.provider, modelId: entry.model };
			}
		}

		const messages: ModelMessage[] = [];
		for (const entry of path) {
			if (entry.type === "message") {
				messages.push(entryToMessage(entry));
			}
		}

		return { messages, model };
	}

	getHeader(): SessionHeader | null {
		const h = this.fileEntries.find((e) => e.type === "session");
		return h ? (h as SessionHeader) : null;
	}

	getEntries(): SessionEntry[] {
		return this.fileEntries.filter((e): e is SessionEntry => e.type !== "session");
	}

	branch(branchFromId: string): void {
		if (!this.byId.has(branchFromId)) {
			throw new Error(`Entry ${branchFromId} not found`);
		}
		this.leafId = branchFromId;
	}

	resetLeaf(): void {
		this.leafId = null;
	}

	static create(cwd: string, sessionDir?: string): SessionManager {
		return new SessionManager(cwd, sessionDir ?? cwd, undefined, true);
	}

	static open(path: string, sessionDir?: string): SessionManager {
		const dir = sessionDir ?? path;
		return new SessionManager(process.cwd(), dir, path, true);
	}

	static continueRecent(_cwd: string): SessionManager {
		throw new Error("Not implemented: need to find most recent session");
	}

	static inMemory(cwd: string = process.cwd()): SessionManager {
		return new SessionManager(cwd, "", undefined, false);
	}

	static async list(_cwd: string): Promise<SessionInfo[]> {
		return [];
	}
}
