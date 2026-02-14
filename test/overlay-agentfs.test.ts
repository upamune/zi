import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FileSystem } from "agentfs-sdk";
import { OverlayAgentFS } from "../src/fs/overlay-agentfs.js";

function createMockDelta() {
	const files = new Map<string, Buffer>();

	const fs: FileSystem = {
		async readFile(path: string, options?: any): Promise<any> {
			const content = files.get(path);
			if (!content) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
			const encoding = typeof options === "string" ? options : options?.encoding;
			if (encoding) return content.toString(encoding as BufferEncoding);
			return content;
		},
		async writeFile(path: string, data: string | Buffer): Promise<void> {
			files.set(path, Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8"));
		},
		async stat(path: string): Promise<any> {
			if (!files.has(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
			return {
				ino: 1,
				mode: 0o100644,
				nlink: 1,
				uid: 0,
				gid: 0,
				size: files.get(path)!.length,
				atime: Date.now(),
				mtime: Date.now(),
				ctime: Date.now(),
				isFile: () => true,
				isDirectory: () => false,
				isSymbolicLink: () => false,
			};
		},
		async lstat(path: string): Promise<any> {
			return fs.stat(path);
		},
		async readdir(path: string): Promise<string[]> {
			const prefix = path.endsWith("/") ? path : `${path}/`;
			const entries = new Set<string>();
			for (const key of files.keys()) {
				if (key.startsWith(prefix)) {
					const rest = key.slice(prefix.length);
					const name = rest.split("/")[0];
					if (name) entries.add(name);
				}
			}
			if (entries.size === 0) {
				throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
			}
			return [...entries];
		},
		async readdirPlus(path: string): Promise<any[]> {
			const names = await fs.readdir(path);
			return names.map((name) => ({
				name,
				stats: {
					ino: 1,
					mode: 0o100644,
					nlink: 1,
					uid: 0,
					gid: 0,
					size: 0,
					atime: Date.now(),
					mtime: Date.now(),
					ctime: Date.now(),
					isFile: () => true,
					isDirectory: () => false,
					isSymbolicLink: () => false,
				},
			}));
		},
		async access(path: string): Promise<void> {
			if (!files.has(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
		},
		async readlink(_path: string): Promise<string> {
			throw new Error("EINVAL");
		},
		async mkdir(_path: string): Promise<void> {},
		async rmdir(_path: string): Promise<void> {},
		async unlink(path: string): Promise<void> {
			files.delete(path);
		},
		async rm(path: string): Promise<void> {
			files.delete(path);
		},
		async rename(oldPath: string, newPath: string): Promise<void> {
			const content = files.get(oldPath);
			if (!content) throw new Error(`ENOENT: ${oldPath}`);
			files.set(newPath, content);
			files.delete(oldPath);
		},
		async copyFile(src: string, dest: string): Promise<void> {
			const content = files.get(src);
			if (!content) throw new Error(`ENOENT: ${src}`);
			files.set(dest, content);
		},
		async symlink(): Promise<void> {},
		async statfs(): Promise<any> {
			return { inodes: files.size, bytesUsed: 0 };
		},
		async open(path: string): Promise<any> {
			if (!files.has(path)) throw new Error(`ENOENT: ${path}`);
			return {};
		},
	};

	return { fs, files };
}

describe("OverlayAgentFS", () => {
	const tempDir = join("/tmp", `zi-overlay-test-${Date.now()}`);

	beforeEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		mkdirSync(tempDir, { recursive: true });
		writeFileSync(join(tempDir, "base-file.txt"), "base content");
		mkdirSync(join(tempDir, "subdir"), { recursive: true });
		writeFileSync(join(tempDir, "subdir", "nested.txt"), "nested content");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe("readFile", () => {
		test("delta にないファイルは base（実FS）から読む", async () => {
			const { fs: delta } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);

			const content = await overlay.readFile(join(tempDir, "base-file.txt"));
			expect(content.toString("utf-8")).toBe("base content");
		});

		test("delta にあるファイルは delta から読む", async () => {
			const { fs: delta, files } = createMockDelta();
			const filePath = join(tempDir, "base-file.txt");
			files.set(filePath, Buffer.from("delta content"));
			const overlay = new OverlayAgentFS(delta, tempDir);

			const content = await overlay.readFile(filePath);
			expect(content.toString("utf-8")).toBe("delta content");
		});

		test("encoding 指定で文字列を返す", async () => {
			const { fs: delta } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);

			const content = await overlay.readFile(join(tempDir, "base-file.txt"), "utf-8");
			expect(content).toBe("base content");
		});

		test("相対パスを baseDir で解決する", async () => {
			const { fs: delta } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);

			const content = await overlay.readFile("base-file.txt");
			expect(content.toString("utf-8")).toBe("base content");
		});

		test("存在しないファイルはエラーになる", async () => {
			const { fs: delta } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);

			expect(overlay.readFile(join(tempDir, "nonexistent.txt"))).rejects.toThrow();
		});
	});

	describe("writeFile", () => {
		test("delta にのみ書き込む（base は変更されない）", async () => {
			const { fs: delta, files } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);
			const filePath = join(tempDir, "new-file.txt");

			await overlay.writeFile(filePath, "new content");

			expect(files.get(filePath)?.toString("utf-8")).toBe("new content");
		});

		test("書き込み後に readFile で delta の内容が返る", async () => {
			const { fs: delta } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);
			const filePath = join(tempDir, "base-file.txt");

			await overlay.writeFile(filePath, "overwritten");

			const content = await overlay.readFile(filePath);
			expect(content.toString("utf-8")).toBe("overwritten");
		});
	});

	describe("stat", () => {
		test("delta にないファイルは base の stat を返す", async () => {
			const { fs: delta } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);

			const stats = await overlay.stat(join(tempDir, "base-file.txt"));
			expect(stats.isFile()).toBe(true);
			expect(stats.isDirectory()).toBe(false);
		});

		test("ディレクトリの stat を返す", async () => {
			const { fs: delta } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);

			const stats = await overlay.stat(join(tempDir, "subdir"));
			expect(stats.isDirectory()).toBe(true);
		});

		test("存在しないパスはエラーになる", async () => {
			const { fs: delta } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);

			expect(overlay.stat(join(tempDir, "nonexistent"))).rejects.toThrow();
		});
	});

	describe("readdir", () => {
		test("base のディレクトリ一覧を返す", async () => {
			const { fs: delta } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);

			const entries = await overlay.readdir(tempDir);
			expect(entries).toContain("base-file.txt");
			expect(entries).toContain("subdir");
		});

		test("delta + base のマージ結果を返す", async () => {
			const { fs: delta, files } = createMockDelta();
			files.set(join(tempDir, "/delta-only.txt"), Buffer.from("delta"));
			const overlay = new OverlayAgentFS(delta, tempDir);

			const entries = await overlay.readdir(tempDir);
			expect(entries).toContain("base-file.txt");
			expect(entries).toContain("delta-only.txt");
		});

		test("両方のレイヤーに存在するファイルは重複しない", async () => {
			const { fs: delta, files } = createMockDelta();
			files.set(join(tempDir, "/base-file.txt"), Buffer.from("delta version"));
			const overlay = new OverlayAgentFS(delta, tempDir);

			const entries = await overlay.readdir(tempDir);
			const count = entries.filter((e) => e === "base-file.txt").length;
			expect(count).toBe(1);
		});

		test("存在しないディレクトリはエラーになる", async () => {
			const { fs: delta } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);

			expect(overlay.readdir(join(tempDir, "nonexistent-dir"))).rejects.toThrow();
		});
	});

	describe("rename", () => {
		test("base にしかないファイルを rename できる（CoW コピー）", async () => {
			const { fs: delta, files } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);
			const oldPath = join(tempDir, "base-file.txt");
			const newPath = join(tempDir, "renamed.txt");

			await overlay.rename(oldPath, newPath);

			expect(files.has(newPath)).toBe(true);
			expect(files.get(newPath)?.toString("utf-8")).toBe("base content");
		});
	});

	describe("copyFile", () => {
		test("base のファイルを delta にコピーする", async () => {
			const { fs: delta, files } = createMockDelta();
			const overlay = new OverlayAgentFS(delta, tempDir);
			const src = join(tempDir, "base-file.txt");
			const dest = join(tempDir, "copied.txt");

			await overlay.copyFile(src, dest);

			expect(files.get(dest)?.toString("utf-8")).toBe("base content");
		});
	});
});
