import { resolve } from "node:path";
import type { CpOptions, FsStat, IFileSystem, MkdirOptions, RmOptions } from "just-bash";
import type { OverlayAgentFS } from "./overlay-agentfs.js";

interface DirentEntry {
	name: string;
	isFile: boolean;
	isDirectory: boolean;
	isSymbolicLink: boolean;
}

function agentStatsToFsStat(s: {
	mode: number;
	size: number;
	mtime: number;
	isFile(): boolean;
	isDirectory(): boolean;
	isSymbolicLink(): boolean;
}): FsStat {
	return {
		isFile: s.isFile(),
		isDirectory: s.isDirectory(),
		isSymbolicLink: s.isSymbolicLink(),
		mode: s.mode,
		size: s.size,
		mtime: new Date(s.mtime),
	};
}

export class BashFsAdapter implements IFileSystem {
	constructor(
		private overlay: OverlayAgentFS,
		private cwd: string
	) {}

	async readFile(path: string): Promise<string> {
		const result = await this.overlay.readFile(path, "utf-8");
		return result as string;
	}

	async readFileBuffer(path: string): Promise<Uint8Array> {
		const buf = await this.overlay.readFile(path);
		return new Uint8Array(buf as Buffer);
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		await this.overlay.writeFile(path, content as string | Buffer);
	}

	async appendFile(path: string, content: string | Uint8Array): Promise<void> {
		let existing = "";
		try {
			existing = (await this.overlay.readFile(path, "utf-8")) as string;
		} catch {
			// ファイルが存在しない場合は空文字
		}
		const appendStr = typeof content === "string" ? content : new TextDecoder().decode(content);
		await this.overlay.writeFile(path, existing + appendStr);
	}

	async exists(path: string): Promise<boolean> {
		try {
			await this.overlay.access(path);
			return true;
		} catch {
			return false;
		}
	}

	async stat(path: string): Promise<FsStat> {
		const s = await this.overlay.stat(path);
		return agentStatsToFsStat(s);
	}

	async lstat(path: string): Promise<FsStat> {
		const s = await this.overlay.lstat(path);
		return agentStatsToFsStat(s);
	}

	async mkdir(path: string, options?: MkdirOptions): Promise<void> {
		if (options?.recursive) {
			const parts = resolve(path).split("/").filter(Boolean);
			let current = "/";
			for (const part of parts) {
				current = resolve(current, part);
				try {
					await this.overlay.stat(current);
				} catch {
					try {
						await this.overlay.mkdir(current);
					} catch {
						// 既に存在する場合は無視
					}
				}
			}
			return;
		}
		await this.overlay.mkdir(path);
	}

	async readdir(path: string): Promise<string[]> {
		return this.overlay.readdir(path);
	}

	async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
		const entries = await this.overlay.readdirPlus(path);
		return entries.map((e) => ({
			name: e.name,
			isFile: e.stats.isFile(),
			isDirectory: e.stats.isDirectory(),
			isSymbolicLink: e.stats.isSymbolicLink(),
		}));
	}

	async rm(path: string, options?: RmOptions): Promise<void> {
		await this.overlay.rm(path, options);
	}

	async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
		if (options?.recursive) {
			try {
				const s = await this.overlay.stat(src);
				if (s.isDirectory()) {
					await this._cpDir(src, dest);
					return;
				}
			} catch {
				// stat 失敗 = 通常コピーを試行
			}
		}
		await this.overlay.copyFile(src, dest);
	}

	private async _cpDir(src: string, dest: string): Promise<void> {
		try {
			await this.overlay.mkdir(dest);
		} catch {
			// 既に存在
		}
		const entries = await this.overlay.readdir(src);
		for (const entry of entries) {
			const srcPath = resolve(src, entry);
			const destPath = resolve(dest, entry);
			const s = await this.overlay.stat(srcPath);
			if (s.isDirectory()) {
				await this._cpDir(srcPath, destPath);
			} else {
				await this.overlay.copyFile(srcPath, destPath);
			}
		}
	}

	async mv(src: string, dest: string): Promise<void> {
		await this.overlay.rename(src, dest);
	}

	resolvePath(base: string, path: string): string {
		return resolve(base, path);
	}

	getAllPaths(): string[] {
		return [];
	}

	async chmod(path: string, _mode: number): Promise<void> {
		await this.overlay.access(path);
	}

	async symlink(target: string, linkPath: string): Promise<void> {
		await this.overlay.symlink(target, linkPath);
	}

	async link(existingPath: string, newPath: string): Promise<void> {
		await this.overlay.copyFile(existingPath, newPath);
	}

	async readlink(path: string): Promise<string> {
		return this.overlay.readlink(path);
	}

	async realpath(path: string): Promise<string> {
		const MAX_DEPTH = 40;
		let current = resolve(this.cwd, path);
		for (let i = 0; i < MAX_DEPTH; i++) {
			try {
				const s = await this.overlay.lstat(current);
				if (!s.isSymbolicLink()) {
					return current;
				}
				const target = await this.overlay.readlink(current);
				current = resolve(resolve(current, ".."), target);
			} catch {
				return current;
			}
		}
		throw new Error(`ELOOP: too many levels of symbolic links, realpath '${path}'`);
	}

	async utimes(_path: string, _atime: Date, _mtime: Date): Promise<void> {
		// no-op
	}
}
