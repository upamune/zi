import { randomUUID } from "node:crypto";
import { Bash } from "just-bash";
import { Agent } from "./agent/index.js";
import { createProvider, type ProviderName } from "./agent/provider.js";
import { createSession, listSessions, sessionExists } from "./agent/session.js";
import { parseCliArgs, printHelp, printVersion } from "./cli.js";
import { loadConfig } from "./config/index.js";
import { createToolRegistry } from "./tools/index.js";
import { createTui } from "./tui/index.js";

async function getLastSessionId(): Promise<string | null> {
	const sessions = listSessions();
	if (sessions.length === 0) {
		return null;
	}
	return sessions[sessions.length - 1] ?? null;
}

async function main(): Promise<void> {
	const args = parseCliArgs();

	if (args.help) {
		printHelp();
		process.exit(0);
	}

	if (args.version) {
		printVersion();
		process.exit(0);
	}

	const config = await loadConfig();

	if (args.provider) {
		const validProviders: ProviderName[] = ["anthropic", "openai", "kimi"];
		if (!validProviders.includes(args.provider as ProviderName)) {
			console.error(
				`Invalid provider: ${args.provider}. Must be one of: ${validProviders.join(", ")}`
			);
			process.exit(1);
		}
		config.provider = args.provider as ProviderName;
	}
	if (args.model) {
		config.model = args.model;
	}

	let sessionId: string;
	if (args.resume) {
		if (!sessionExists(args.resume)) {
			console.error(`Session not found: ${args.resume}`);
			process.exit(1);
		}
		sessionId = args.resume;
	} else if (args.continue) {
		const lastSession = await getLastSessionId();
		if (!lastSession) {
			console.error("No previous session to continue");
			process.exit(1);
		}
		sessionId = lastSession;
	} else {
		sessionId = randomUUID().slice(0, 8);
	}

	const session = args.noSession
		? await createSession(`temp-${sessionId}`)
		: await createSession(sessionId);

	const bash = new Bash();
	const tools = createToolRegistry(bash, session.fs, session.tools);
	const provider = createProvider(config);

	const agent = new Agent({
		session,
		tools,
		provider,
		config: {
			maxRetries: 3,
		},
	});

	if (args.print && args.prompt) {
		try {
			const response = await agent.prompt(args.prompt);
			console.log(response.content);
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : String(error));
			process.exit(1);
		} finally {
			await session.close();
		}
		return;
	}

	if (args.prompt) {
		try {
			const response = await agent.prompt(args.prompt);

			console.log("\n--- Response ---");
			console.log(response.content);
			if (response.toolCalls && response.toolCalls.length > 0) {
				console.log("\n--- Tool Calls ---");
				for (const tc of response.toolCalls) {
					console.log(`  ${tc.name}: ${JSON.stringify(tc.args)}`);
				}
			}
			console.log(`\nSession: ${sessionId}`);
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : String(error));
			process.exit(1);
		} finally {
			await session.close();
		}
		return;
	}

	const tui = createTui(agent, {
		sessionId,
		model: config.model,
		provider: config.provider,
	});

	const handleShutdown = () => {
		tui.stop();
		session.close().catch(() => {});
		process.exit(0);
	};

	tui.onExit = handleShutdown;
	process.on("SIGINT", handleShutdown);
	process.on("SIGTERM", handleShutdown);

	tui.start();
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
