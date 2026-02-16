import { handleRequest } from "./routes.js";

const DEFAULT_PORT = 3141;
const MAX_PORT_TRIES = 10;

export async function startBrowseServer(baseDir: string = process.cwd()): Promise<void> {
	let port = DEFAULT_PORT;
	let server: ReturnType<typeof Bun.serve> | null = null;

	for (let i = 0; i < MAX_PORT_TRIES; i++) {
		try {
			server = Bun.serve({
				port,
				fetch(req) {
					return handleRequest(req, baseDir);
				},
			});
			break;
		} catch {
			port++;
		}
	}

	if (!server) {
		console.error(`Failed to start server after ${MAX_PORT_TRIES} attempts.`);
		process.exit(1);
	}

	const url = `http://localhost:${server.port}`;
	console.log(`ʕ•ᴥ•ʔ xi browse running at ${url}`);

	if (process.platform === "darwin") {
		Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
	}

	await new Promise<void>((resolve) => {
		process.on("SIGINT", () => {
			console.log("\nʕ•ᴥ•ʔ bye!");
			server?.stop();
			resolve();
		});
	});
}
