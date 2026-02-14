import { Database as BunDatabase } from "bun:sqlite";

class BunSqliteStatement {
	private stmt: ReturnType<BunDatabase["prepare"]>;

	constructor(stmt: ReturnType<BunDatabase["prepare"]>) {
		this.stmt = stmt;
	}

	async run(...params: unknown[]) {
		const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
		this.stmt.run(...flatParams);
		return { changes: 0, lastInsertRowid: 0 };
	}

	async get(...params: unknown[]) {
		const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
		return this.stmt.get(...flatParams) ?? undefined;
	}

	async all(...params: unknown[]) {
		const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
		return this.stmt.all(...flatParams);
	}

	raw(_raw?: boolean) {
		return this;
	}
	pluck(_pluckMode?: boolean) {
		return this;
	}
	safeIntegers(_toggle?: boolean) {
		return this;
	}
	columns() {
		return this.stmt.columnNames.map((name) => ({ name, type: "" }));
	}
	bind(..._params: unknown[]) {
		return this;
	}
	close() {
		this.stmt.finalize();
	}
	interrupt() {}
}

export class BunSqliteAdapter {
	private db: BunDatabase;
	readonly name: string;
	readonly readonly = false;
	readonly open = true;
	readonly memory = false;
	inTransaction = false;

	constructor(path: string) {
		this.name = path;
		this.db = new BunDatabase(path, { create: true });
		this.db.run("PRAGMA journal_mode=WAL");
	}

	async connect() {}

	prepare(sql: string) {
		return new BunSqliteStatement(this.db.prepare(sql));
	}

	// agentfs-sdk が db.exec(sql) を呼ぶため必要
	// biome-ignore lint/suspicious/noThenProperty: agentfs-sdk 互換のためメソッド名変更不可
	async ["exec"](sql: string) {
		this.db.run(sql);
	}

	async close() {
		this.db.close();
	}

	transaction(fn: (...args: unknown[]) => Promise<unknown>) {
		const wrapper = async (...args: unknown[]) => {
			this.db.run("BEGIN");
			try {
				const result = await fn(...args);
				this.db.run("COMMIT");
				return result;
			} catch (err) {
				this.db.run("ROLLBACK");
				throw err;
			}
		};
		return wrapper;
	}

	async pragma(source: string) {
		const stmt = this.prepare(`PRAGMA ${source}`);
		return await stmt.all();
	}

	defaultSafeIntegers() {}
	interrupt() {}
	backup() {
		throw new Error("not implemented");
	}
	serialize() {
		throw new Error("not implemented");
	}
	function() {
		throw new Error("not implemented");
	}
	aggregate() {
		throw new Error("not implemented");
	}
	table() {
		throw new Error("not implemented");
	}
	loadExtension() {
		throw new Error("not implemented");
	}
	maxWriteReplicationIndex() {
		throw new Error("not implemented");
	}
}
