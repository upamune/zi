import type {
	DirEntry,
	FileHandle,
	FileSystem,
	FilesystemStats,
	Stats,
} from "agentfs-sdk";
import * as nodeFs from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

function nodeStatsToAgentFs(s: import("node:fs").Stats): Stats {
	const mode = s.mode;
	return {
		ino: s.ino,
		mode,
		nlink: s.nlink,
		uid: s.uid,
		gid: s.gid,
		size: s.size,
		atime: s.atime.getTime(),
		mtime: s.mtime.getTime(),
		ctime: s.ctime.getTime(),
		isFile() {
			return (mode & S_IFMT) === S_IFREG;
		},
		isDirectory() {
			return (mode & S_IFMT) === S_IFDIR;
		},
		isSymbolicLink() {
			return (mode & S_IFMT) === S_IFLNK;
		},
	};
}

const MANIFEST_PATH = "/__zi_manifest.json";

export class OverlayAgentFS implements FileSystem {
	private modifiedFiles = new Set<string>();

	constructor(
		private delta: FileSystem,
		private baseDir: string,
	) {}

	getModifiedFiles(): string[] {
		return [...this.modifiedFiles];
	}

	async persistManifest(): Promise<void> {
		if (this.modifiedFiles.size === 0) return;
		await this.delta.writeFile(
			MANIFEST_PATH,
			JSON.stringify([...this.modifiedFiles]),
		);
	}

	static async loadManifest(delta: FileSystem): Promise<string[]> {
		try {
			const content = await delta.readFile(MANIFEST_PATH, "utf-8");
			return JSON.parse(content as string);
		} catch {
			return [];
		}
	}

	private toAbsolute(path: string): string {
		if (isAbsolute(path)) {
			return resolve(path);
		}
		return resolve(this.baseDir, path);
	}

	// --- Read operations: delta → base fallback ---

	readFile(path: string): Promise<Buffer>;
	readFile(path: string, encoding: BufferEncoding): Promise<string>;
	readFile(path: string, options: { encoding: BufferEncoding }): Promise<string>;
	readFile(
		path: string,
		options?: BufferEncoding | { encoding?: BufferEncoding },
	): Promise<Buffer | string>;
	async readFile(
		path: string,
		options?: BufferEncoding | { encoding?: BufferEncoding },
	): Promise<Buffer | string> {
		const p = this.toAbsolute(path);
		try {
			if (options === undefined) {
				return await this.delta.readFile(p);
			}
			if (typeof options === "string") {
				return await this.delta.readFile(p, options);
			}
			if (options.encoding) {
				return await this.delta.readFile(p, options as { encoding: BufferEncoding });
			}
			return await this.delta.readFile(p);
		} catch {
			const encoding = typeof options === "string" ? options : options?.encoding;
			if (encoding) {
				return nodeFs.readFile(p, { encoding });
			}
			return nodeFs.readFile(p);
		}
	}

	async stat(path: string): Promise<Stats> {
		const p = this.toAbsolute(path);
		try {
			return await this.delta.stat(p);
		} catch {
			return nodeStatsToAgentFs(await nodeFs.stat(p));
		}
	}

	async lstat(path: string): Promise<Stats> {
		const p = this.toAbsolute(path);
		try {
			return await this.delta.lstat(p);
		} catch {
			return nodeStatsToAgentFs(await nodeFs.lstat(p));
		}
	}

	async readdir(path: string): Promise<string[]> {
		const p = this.toAbsolute(path);
		const entries = new Set<string>();
		let deltaErr: unknown;
		let baseErr: unknown;

		try {
			for (const e of await this.delta.readdir(p)) entries.add(e);
		} catch (e) {
			deltaErr = e;
		}

		try {
			for (const e of await nodeFs.readdir(p)) entries.add(e);
		} catch (e) {
			baseErr = e;
		}

		if (deltaErr && baseErr) {
			throw baseErr;
		}
		return [...entries];
	}

	async readdirPlus(path: string): Promise<DirEntry[]> {
		const p = this.toAbsolute(path);
		const entryMap = new Map<string, DirEntry>();
		let deltaErr: unknown;
		let baseErr: unknown;

		try {
			const baseNames = await nodeFs.readdir(p, { withFileTypes: true });
			for (const dirent of baseNames) {
				try {
					const entryPath = resolve(p, dirent.name);
					const nodeStat = await nodeFs.stat(entryPath);
					entryMap.set(dirent.name, {
						name: dirent.name,
						stats: nodeStatsToAgentFs(nodeStat),
					});
				} catch {}
			}
		} catch (e) {
			baseErr = e;
		}

		try {
			for (const entry of await this.delta.readdirPlus(p)) {
				entryMap.set(entry.name, entry);
			}
		} catch (e) {
			deltaErr = e;
		}

		if (deltaErr && baseErr) {
			throw baseErr;
		}
		return [...entryMap.values()];
	}

	async access(path: string): Promise<void> {
		const p = this.toAbsolute(path);
		try {
			return await this.delta.access(p);
		} catch {
			await nodeFs.access(p);
		}
	}

	async readlink(path: string): Promise<string> {
		const p = this.toAbsolute(path);
		try {
			return await this.delta.readlink(p);
		} catch {
			return nodeFs.readlink(p);
		}
	}

	// --- Write operations: delta only ---

	async writeFile(
		path: string,
		data: string | Buffer,
		options?: BufferEncoding | { encoding?: BufferEncoding },
	): Promise<void> {
		const p = this.toAbsolute(path);
		this.modifiedFiles.add(p);
		return this.delta.writeFile(p, data, options);
	}

	async mkdir(path: string): Promise<void> {
		return this.delta.mkdir(this.toAbsolute(path));
	}

	async unlink(path: string): Promise<void> {
		return this.delta.unlink(this.toAbsolute(path));
	}

	async rmdir(path: string): Promise<void> {
		return this.delta.rmdir(this.toAbsolute(path));
	}

	async rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void> {
		return this.delta.rm(this.toAbsolute(path), options);
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const op = this.toAbsolute(oldPath);
		const np = this.toAbsolute(newPath);
		try {
			await this.delta.stat(op);
		} catch {
			const content = await nodeFs.readFile(op);
			await this.delta.writeFile(op, content);
		}
		this.modifiedFiles.delete(op);
		this.modifiedFiles.add(np);
		return this.delta.rename(op, np);
	}

	async copyFile(src: string, dest: string): Promise<void> {
		const sp = this.toAbsolute(src);
		const dp = this.toAbsolute(dest);
		let content: Buffer;
		try {
			content = await this.delta.readFile(sp);
		} catch {
			content = await nodeFs.readFile(sp);
		}
		this.modifiedFiles.add(dp);
		await this.delta.writeFile(dp, content);
	}

	async symlink(target: string, linkpath: string): Promise<void> {
		return this.delta.symlink(target, this.toAbsolute(linkpath));
	}

	// --- Delegated ---

	async statfs(): Promise<FilesystemStats> {
		return this.delta.statfs();
	}

	async open(path: string): Promise<FileHandle> {
		const p = this.toAbsolute(path);
		try {
			return await this.delta.open(p);
		} catch {
			const content = await nodeFs.readFile(p);
			await this.delta.writeFile(p, content);
			return this.delta.open(p);
		}
	}
}
