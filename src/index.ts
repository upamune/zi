import { randomUUID } from "node:crypto";
import { Bash } from "just-bash";
import {
	DEFAULT_AGENTS_BYTE_BUDGET,
	loadAgentsDocs,
	renderAgentsDocs,
} from "./agent/agents-doc.js";
import { Agent } from "./agent/index.js";
import { createProvider, getModelsByProvider, type ProviderName } from "./agent/provider.js";
import { createSession, listSessions, loadSession, sessionExists } from "./agent/session.js";
import { buildSystemPrompt } from "./agent/system-prompt.js";
import { parseCliArgs, printHelp, printVersion } from "./cli.js";
import {
	applyApiKeyOverride,
	filterModels,
	resolveOutputMode,
	resolveSession,
	resolveThinkingLevel,
	resolveToolSelection,
	validateApiKey,
} from "./cli-runtime.js";
import { loadConfig } from "./config/index.js";
import { BashFsAdapter } from "./fs/bash-fs-adapter.js";
import type { OverlayAgentFS } from "./fs/overlay-agentfs.js";
import { buildPromptFromInputs, expandFileArgs, readStdinIfAvailable } from "./input-ingestion.js";
import {
	discoverSkills,
	renderMentionedSkillContext,
	renderSkillsSection,
	resolveSkillSelection,
} from "./skills/index.js";
import { runSubcommand } from "./subcommands.js";
import { createToolRegistry } from "./tools/index.js";
import { createTui } from "./tui/index.js";

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

	if (args.command) {
		try {
			await runSubcommand(args.command, process.cwd(), args.sessionDir ?? undefined);
			process.exit(0);
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
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
	const thinkingLevel = resolveThinkingLevel(args.thinking);
	if (thinkingLevel) {
		config.thinking = thinkingLevel;
	}

	const availableModels = filterModels(getModelsByProvider(config.provider), args.models);
	if (args.listModels) {
		if (availableModels.length === 0) {
			console.error("No models matched the provided --models filter");
			process.exit(1);
		}
		for (const model of availableModels) {
			console.log(model);
		}
		process.exit(0);
	}
	if (args.models && !availableModels.includes(config.model)) {
		console.error(
			`Selected model "${config.model}" is not allowed by --models filter: ${args.models}`
		);
		process.exit(1);
	}

	applyApiKeyOverride(config.provider, args.apiKey);

	try {
		validateApiKey(config.provider);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}

	const outputMode = resolveOutputMode(args);
	const selectedTools = resolveToolSelection({
		tools: args.tools,
		noTools: args.noTools,
	});
	let promptArgs: string[] = [];
	try {
		promptArgs = await expandFileArgs(args.promptArgs);
	} catch (error) {
		console.error(
			"Failed to read @file argument:",
			error instanceof Error ? error.message : String(error)
		);
		process.exit(1);
	}
	const shouldReadStdin = outputMode !== "text" || !args.prompt;
	const stdinInput = shouldReadStdin ? await readStdinIfAvailable() : null;
	const prompt = buildPromptFromInputs(promptArgs, stdinInput, " ");
	const baseDir = args.sessionDir ?? undefined;
	const resolvedSession = resolveSession({
		session: args.session,
		resume: args.resume,
		continue: args.continue,
		availableSessions: listSessions(baseDir),
	});

	const sessionId = resolvedSession.sessionId ?? randomUUID().slice(0, 8);
	if (resolvedSession.shouldResume) {
		if (!sessionId) {
			console.error("No previous session to continue");
			process.exit(1);
		}
		if (!sessionExists(sessionId, baseDir)) {
			console.error(`Session not found: ${sessionId}`);
			process.exit(1);
		}
	}

	const session = args.noSession
		? await createSession(`temp-${sessionId}`, baseDir)
		: resolvedSession.shouldResume || sessionExists(sessionId, baseDir)
			? await loadSession(sessionId, baseDir)
			: await createSession(sessionId, baseDir);

	const cwd = baseDir ?? process.cwd();
	const bashFs = new BashFsAdapter(session.fs as OverlayAgentFS, cwd);
	const bash = new Bash({ fs: bashFs, cwd });
	const tools = createToolRegistry(bash, session.fs, session.tools, selectedTools.enabledTools);
	const provider = createProvider(config);
	const agentsDocs = await loadAgentsDocs({ cwd: process.cwd() });
	const agentsInstructions = renderAgentsDocs(agentsDocs, DEFAULT_AGENTS_BYTE_BUDGET).text;
	const skillCatalog = await discoverSkills({ cwd });
	const skillSelection = resolveSkillSelection(skillCatalog, config, {
		cliSkillNames: args.skills,
		noSkills: args.noSkills,
	});
	const skillsInstructions = renderSkillsSection(skillSelection);

	const agent = new Agent({
		session,
		tools,
		provider,
		config: {
			systemPrompt: buildSystemPrompt({
				customPrompt: args.systemPrompt ?? undefined,
				appendSystemPrompt: args.appendSystemPrompt ?? undefined,
				agentsInstructions: agentsInstructions || undefined,
				skillsInstructions: skillsInstructions || undefined,
			}),
			resolveSystemPromptAppendix: (message: string) =>
				renderMentionedSkillContext(message, skillSelection),
			maxRetries: 3,
			enabledTools: selectedTools.enabledTools,
			thinking: config.thinking,
		},
	});

	if (prompt && outputMode !== "text") {
		try {
			const response = await agent.prompt(prompt);
			if (outputMode === "json") {
				console.log(
					JSON.stringify(
						{
							content: response.content,
							toolCalls: response.toolCalls ?? [],
							sessionId,
						},
						null,
						2
					)
				);
			} else {
				console.log(
					JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						result: {
							content: response.content,
							toolCalls: response.toolCalls ?? [],
							sessionId,
						},
					})
				);
			}
		} catch (error) {
			console.error("Error:", error instanceof Error ? error.message : String(error));
			process.exit(1);
		} finally {
			await session.close();
		}
		return;
	}

	if (!prompt && outputMode !== "text") {
		console.error("--mode json/rpc requires a prompt");
		process.exit(1);
	}

	if (prompt) {
		try {
			const response = await agent.prompt(prompt);

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
		cwd,
	});

	const handleShutdown = () => {
		tui.stop();
		(async () => {
			const modifiedFiles = session.getModifiedFiles();
			const deletedFiles = session.getDeletedFiles();
			if (modifiedFiles.length > 0 || deletedFiles.length > 0) {
				await session.persistManifest().catch(() => {});
				const cwdPrefix = `${cwd}/`;
				const total = modifiedFiles.length + deletedFiles.length;
				console.log("\n━━━ Session ended ━━━");
				console.log(`📝 ${total} file(s) changed:\n`);
				for (const f of modifiedFiles) {
					const display = f.startsWith(cwdPrefix) ? f.slice(cwdPrefix.length) : f;
					console.log(`  M ${display}`);
				}
				for (const f of deletedFiles) {
					const display = f.startsWith(cwdPrefix) ? f.slice(cwdPrefix.length) : f;
					console.log(`  D ${display}`);
				}
				console.log(`\nTo review and apply:\n  xi apply ${sessionId}`);
			}
			await session.close().catch(() => {});
			process.exit(0);
		})();
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
