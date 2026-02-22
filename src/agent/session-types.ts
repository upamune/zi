import type { ModelMessage } from "ai";

export const CURRENT_SESSION_VERSION = 1;

export interface SessionHeader {
	type: "session";
	version: number;
	id: string;
	timestamp: string;
	cwd: string;
	parentSession?: string;
}

interface SessionEntryBase {
	id: string;
	parentId: string | null;
	timestamp: number;
}

export interface ContentBlock {
	type: "text" | "image";
	text?: string;
	image?: string;
	mimeType?: string;
}

interface ToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
	result?: unknown;
}

export interface ToolInvocation {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	state: "partial" | "call" | "result";
	result?: unknown;
}

export interface MessageEntry extends SessionEntryBase {
	type: "message";
	role: "user" | "assistant" | "tool";
	content: string | ContentBlock[];
	toolInvocations?: ToolInvocation[];
	provider?: string;
	model?: string;
}

export interface ModelChangeEntry extends SessionEntryBase {
	type: "model_change";
	provider: string;
	modelId: string;
}

export interface CompactionEntry extends SessionEntryBase {
	type: "compaction";
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
}

export type SessionEntry = MessageEntry | ModelChangeEntry | CompactionEntry;

export type FileEntry = SessionHeader | SessionEntry;

export interface SessionTreeNode {
	entry: SessionEntry;
	children: SessionTreeNode[];
}

export interface SessionContext {
	messages: ModelMessage[];
	model: { provider: string; modelId: string } | null;
}

export interface SessionInfo {
	path: string;
	id: string;
	cwd: string;
	name?: string;
	parentSessionPath?: string;
	created: Date;
	modified: Date;
	messageCount: number;
	firstMessage: string;
}

export type AppendMessage = Omit<MessageEntry, "type" | "id" | "parentId" | "timestamp">;
