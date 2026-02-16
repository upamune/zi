import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleRequest } from "../src/browse/routes.js";

describe("browse", () => {
	let baseDir: string;

	beforeEach(async () => {
		baseDir = await mkdtemp(join(tmpdir(), "xi-browse-"));
		mkdirSync(join(baseDir, ".xi", "sessions"), { recursive: true });
	});

	afterEach(async () => {
		await rm(baseDir, { recursive: true, force: true });
	});

	function createTestDb(sessionId: string): void {
		const dbPath = join(baseDir, ".xi", "sessions", `${sessionId}.db`);
		const db = new Database(dbPath, { create: true });
		db.run("PRAGMA journal_mode=WAL");
		db.run(`CREATE TABLE IF NOT EXISTS tool_calls (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			parameters TEXT,
			result TEXT,
			error TEXT,
			status TEXT NOT NULL DEFAULT 'pending',
			started_at INTEGER NOT NULL,
			completed_at INTEGER,
			duration_ms INTEGER
		)`);
		db.run(`INSERT INTO tool_calls (name, parameters, status, started_at, completed_at, duration_ms)
			VALUES ('read', '{"path":"test.ts"}', 'success', 1000, 1050, 50)`);
		db.run(`INSERT INTO tool_calls (name, parameters, status, started_at, completed_at, duration_ms)
			VALUES ('write', '{"path":"out.ts"}', 'success', 1100, 1200, 100)`);
		db.close();
	}

	function makeRequest(path: string, htmx = false): Request {
		const headers: Record<string, string> = {};
		if (htmx) headers["HX-Request"] = "true";
		return new Request(`http://localhost:3141${path}`, { headers });
	}

	test("GET / should return sessions page", async () => {
		createTestDb("test-session-1");
		const res = await handleRequest(makeRequest("/"), baseDir);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("xi browse");
		expect(body).toContain("test-session-1");
	});

	test("GET / with no sessions should show empty state", async () => {
		const res = await handleRequest(makeRequest("/"), baseDir);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("No sessions found");
	});

	test("GET /sessions/:id should return detail page", async () => {
		createTestDb("detail-test");
		const res = await handleRequest(makeRequest("/sessions/detail-test"), baseDir);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("detail-test");
		expect(body).toContain("Tool Calls");
	});

	test("GET /sessions/:id for missing session should return 404", async () => {
		const res = await handleRequest(makeRequest("/sessions/nonexistent"), baseDir);
		expect(res.status).toBe(404);
	});

	test("GET /sessions/:id/tools with HX-Request should return partial", async () => {
		createTestDb("tools-test");
		const res = await handleRequest(makeRequest("/sessions/tools-test/tools", true), baseDir);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("read");
		expect(body).toContain("write");
		expect(body).not.toContain("<!DOCTYPE html>");
	});

	test("GET /sessions/:id/files with HX-Request should return partial", async () => {
		createTestDb("files-test");
		const res = await handleRequest(makeRequest("/sessions/files-test/files", true), baseDir);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).not.toContain("<!DOCTYPE html>");
	});

	test("unknown route should return 404", async () => {
		const res = await handleRequest(makeRequest("/unknown"), baseDir);
		expect(res.status).toBe(404);
		const body = await res.text();
		expect(body).toContain("Page not found");
	});
});
