import {
	type Component,
	Container,
	Editor,
	type EditorTheme,
	Markdown,
	type MarkdownTheme,
	matchesKey,
	type OverlayHandle,
	ProcessTerminal,
	TUI,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import type { ModelMessage } from "ai";
import type { Agent, StreamEvent } from "@/agent/index.js";
import { VERSION } from "@/config/index.js";
import { formatSkillsList, setSkillsOff, updateSkillPreference } from "@/skills/index.js";
import {
	isCommandAvailableWhileRunning,
	parseSlashCommand,
	type SlashCommand,
} from "@/tui/slash-commands.js";

export interface TuiOptions {
	sessionId: string;
	model: string;
	provider: string;
	cwd: string;
}

export interface MessageItem {
	role: "user" | "assistant";
	content: string;
	toolCalls?: Array<{
		name: string;
		args: Record<string, unknown>;
	}>;
}

interface StatusState {
	mode: "ready" | "busy" | "error" | "info";
	text: string;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const DEFAULT_MARKDOWN_THEME: MarkdownTheme = {
	heading: (text: string) => `\x1b[1;38;5;111m${text}\x1b[0m`,
	link: (text: string) => `\x1b[4;38;5;75m${text}\x1b[0m`,
	linkUrl: (text: string) => `\x1b[2;38;5;75m${text}\x1b[0m`,
	code: (text: string) => `\x1b[38;5;221m${text}\x1b[0m`,
	codeBlock: (text: string) => `\x1b[38;5;252m${text}\x1b[0m`,
	codeBlockBorder: (text: string) => `\x1b[2;38;5;244m${text}\x1b[0m`,
	quote: (text: string) => `\x1b[2;38;5;250m${text}\x1b[0m`,
	quoteBorder: (text: string) => `\x1b[2;38;5;244m${text}\x1b[0m`,
	hr: (text: string) => `\x1b[2;38;5;244m${text}\x1b[0m`,
	listBullet: (text: string) => `\x1b[38;5;220m${text}\x1b[0m`,
	bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
	italic: (text: string) => `\x1b[3m${text}\x1b[0m`,
	strikethrough: (text: string) => `\x1b[9m${text}\x1b[0m`,
	underline: (text: string) => `\x1b[4m${text}\x1b[0m`,
};

const DEFAULT_EDITOR_THEME: EditorTheme = {
	borderColor: (str: string) => `\x1b[38;5;117m${str}\x1b[0m`,
	selectList: {
		selectedPrefix: (str: string) => `\x1b[48;5;24;38;5;255m${str}\x1b[0m`,
		selectedText: (str: string) => `\x1b[48;5;24;38;5;255m${str}\x1b[0m`,
		description: (str: string) => `\x1b[2;38;5;252m${str}\x1b[0m`,
		scrollInfo: (str: string) => `\x1b[2;38;5;245m${str}\x1b[0m`,
		noMatch: (str: string) => `\x1b[2;38;5;245m${str}\x1b[0m`,
	},
};

class Header implements Component {
	private sessionId: string;
	private model: string;
	private provider: string;
	private inFlight = false;

	constructor(options: TuiOptions) {
		this.sessionId = options.sessionId;
		this.model = options.model;
		this.provider = options.provider;
	}

	setInFlight(inFlight: boolean): void {
		this.inFlight = inFlight;
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 0) {
			return [""];
		}

		const ver = `\x1b[2;38;5;245mv${VERSION}\x1b[0m`;
		const left = this.inFlight
			? `\x1b[1;38;5;118mʕ•ᴥ•ʔ xi\x1b[0m ${ver} \x1b[1;38;5;118m● live\x1b[0m`
			: `\x1b[1;38;5;117mʕ•ᴥ•ʔ xi\x1b[0m ${ver}`;
		const right = `\x1b[2;38;5;252m${this.provider}/${this.model}\x1b[0m`;
		const session = `\x1b[2;38;5;248msession ${this.sessionId}\x1b[0m`;
		return [
			joinSides(left, right, width),
			truncateToWidth(session, width),
			truncateToWidth("\x1b[2;38;5;240m─\x1b[0m".repeat(width), width),
		];
	}
}

interface ActiveToolCall {
	toolName: string;
	args: Record<string, unknown>;
	done: boolean;
}

class ConversationArea implements Component {
	private messages: MessageItem[] = [];
	private streaming = false;
	private reasoningText = "";
	private activeToolCalls: ActiveToolCall[] = [];
	private thinkingFrame = 0;
	private thinkingTimer: Timer | null = null;
	private ui: TUI;

	private static readonly THINKING_FRAMES = ["ʕ•ᴥ•ʔ", "ʕ·ᴥ·ʔ", "ʕ˘ᴥ˘ʔ", "ʕ-ᴥ-ʔ"];
	private static readonly THINKING_INTERVAL_MS = 600;

	constructor(ui: TUI) {
		this.ui = ui;
	}

	addMessage(message: MessageItem): void {
		this.messages.push(message);
	}

	clear(): void {
		this.messages = [];
	}

	count(): number {
		return this.messages.length;
	}

	startStreaming(): void {
		this.messages.push({ role: "assistant", content: "" });
		this.streaming = true;
	}

	appendToStream(chunk: string): void {
		if (!this.streaming || this.messages.length === 0) return;
		this.messages[this.messages.length - 1].content += chunk;
	}

	finishStreaming(): void {
		this.streaming = false;
	}

	setReasoning(text: string): void {
		this.reasoningText += text;
		const lines = this.reasoningText.split("\n");
		this.reasoningText = lines[lines.length - 1];
	}

	clearReasoning(): void {
		this.reasoningText = "";
	}

	addToolCall(toolName: string, args: Record<string, unknown>): void {
		this.activeToolCalls.push({ toolName, args, done: false });
	}

	completeToolCall(toolName: string): void {
		for (let i = this.activeToolCalls.length - 1; i >= 0; i--) {
			if (this.activeToolCalls[i].toolName === toolName && !this.activeToolCalls[i].done) {
				this.activeToolCalls[i].done = true;
				break;
			}
		}
	}

	clearToolCalls(): void {
		this.activeToolCalls = [];
	}

	startThinking(): void {
		this.thinkingFrame = 0;
		this.thinkingTimer = setInterval(() => {
			this.thinkingFrame++;
			this.ui.requestRender();
		}, ConversationArea.THINKING_INTERVAL_MS);
	}

	stopThinking(): void {
		if (this.thinkingTimer) {
			clearInterval(this.thinkingTimer);
			this.thinkingTimer = null;
		}
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 0) {
			return [""];
		}

		if (this.messages.length === 0 && !this.thinkingTimer) {
			return [
				truncateToWidth("", width),
				truncateToWidth("\x1b[2;38;5;245mAsk anything. Use Shift+Enter for newline.\x1b[0m", width),
				truncateToWidth("\x1b[2;38;5;245mCtrl+G: help  Ctrl+L: clear chat\x1b[0m", width),
				truncateToWidth("", width),
			];
		}

		const lines: string[] = [];
		for (const message of this.messages) {
			lines.push(...this.renderMessage(message, width));
		}

		if (this.activeToolCalls.length > 0 && !this.streaming) {
			lines.push(...this.renderToolCalls());
			lines.push("");
		}

		if (this.thinkingTimer) {
			const bear =
				ConversationArea.THINKING_FRAMES[
					this.thinkingFrame % ConversationArea.THINKING_FRAMES.length
				];
			if (this.reasoningText) {
				const maxLen = width - 12;
				const display =
					this.reasoningText.length > maxLen
						? `…${this.reasoningText.slice(-(maxLen - 1))}`
						: this.reasoningText;
				lines.push(`\x1b[1;38;5;117m${bear}\x1b[0m \x1b[2;38;5;245m${display}\x1b[0m`);
			} else {
				lines.push(`\x1b[1;38;5;117m${bear}\x1b[0m \x1b[2;38;5;245m...\x1b[0m`);
			}
			lines.push("");
		}

		return lines;
	}

	private renderToolCalls(): string[] {
		const lines: string[] = [];
		for (const tc of this.activeToolCalls) {
			const icon = tc.done ? "✓" : "⟳";
			const style = tc.done ? "\x1b[2;38;5;245m" : "\x1b[38;5;215m";
			const argStr = formatToolCallShort(tc.args);
			lines.push(`${style}  ${icon} ${tc.toolName}(${argStr})\x1b[0m`);
		}
		return lines;
	}

	private renderMessage(message: MessageItem, width: number): string[] {
		const lines: string[] = [];
		const roleLabel =
			message.role === "user" ? "\x1b[1;38;5;121mYOU\x1b[0m" : "\x1b[1;38;5;228mʕ•ᴥ•ʔ\x1b[0m";
		const borderColor = message.role === "user" ? "\x1b[38;5;36m" : "\x1b[38;5;178m";

		lines.push(truncateToWidth(`${borderColor}╭─\x1b[0m ${roleLabel}`, width));

		if (
			this.streaming &&
			this.activeToolCalls.length > 0 &&
			message === this.messages[this.messages.length - 1]
		) {
			for (const tcLine of this.renderToolCalls()) {
				lines.push(truncateToWidth(`${borderColor}│\x1b[0m ${tcLine}`, width));
			}
		}

		const innerWidth = Math.max(6, width - 4);
		const body = this.renderBody(message, innerWidth);
		for (const line of body) {
			lines.push(truncateToWidth(`${borderColor}│\x1b[0m ${line}`, width));
		}

		if (message.toolCalls && message.toolCalls.length > 0) {
			const tools = message.toolCalls
				.map((tool) => formatToolCall(tool.name, tool.args))
				.join("  ·  ");
			lines.push(
				truncateToWidth(`${borderColor}│\x1b[0m \x1b[2;38;5;245mtools: ${tools}\x1b[0m`, width)
			);
		}

		lines.push(truncateToWidth(`${borderColor}╰─\x1b[0m`, width));
		lines.push("");
		return lines;
	}

	private renderBody(message: MessageItem, width: number): string[] {
		if (message.role === "assistant") {
			const markdown = new Markdown(message.content, 0, 0, DEFAULT_MARKDOWN_THEME);
			const rendered = markdown.render(width);
			return rendered.length > 0 ? rendered : [""];
		}

		const wrapped = wrapTextWithAnsi(message.content, width);
		return wrapped.length > 0 ? wrapped : [""];
	}
}

class PromptHint implements Component {
	private disabled = false;

	setDisabled(disabled: boolean): void {
		this.disabled = disabled;
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 0) {
			return [""];
		}
		const prompt = this.disabled
			? "\x1b[2;38;5;245mWaiting for model... (Ctrl+C to cancel)\x1b[0m"
			: "\x1b[2;38;5;245mEnter: send  Shift+Enter: newline  Ctrl+C: exit  Ctrl+G: help\x1b[0m";
		return [truncateToWidth(prompt, width)];
	}
}

class StatusBar implements Component {
	private state: StatusState = { mode: "ready", text: "Ready" };
	private spinner = "";
	private frame = 0;
	private animationTimer: Timer | null = null;
	private ui: TUI;

	private static readonly READY_INTERVAL_MS = 300;
	private static readonly BLINK_CYCLE = 15;
	private static readonly SLEEP_START = 100;
	private static readonly SLEEP_CYCLE = 10;
	private static readonly BAR = "\x1b[48;5;236;37m";
	private static readonly BUSY_BEARS = ["ʕ•ᴥ•ʔ", "ʕ·ᴥ·ʔ", "ʕ˘ᴥ˘ʔ", "ʕ-ᴥ-ʔ", "ʕ˘ᴥ˘ʔ", "ʕ·ᴥ·ʔ"];
	private busyFrame = 0;

	constructor(ui: TUI) {
		this.ui = ui;
	}

	setStatus(state: StatusState): void {
		this.stopAnimation();
		this.state = state;
		this.frame = 0;
		this.busyFrame = 0;
		if (state.mode === "ready") {
			this.startAnimation(StatusBar.READY_INTERVAL_MS);
		}
	}

	setSpinner(spinner: string): void {
		this.spinner = spinner;
		this.busyFrame++;
	}

	stopAnimation(): void {
		if (this.animationTimer) {
			clearInterval(this.animationTimer);
			this.animationTimer = null;
		}
	}

	private startAnimation(ms: number): void {
		this.animationTimer = setInterval(() => {
			this.frame++;
			this.ui.requestRender();
		}, ms);
	}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 0) {
			return [""];
		}
		const S = StatusBar.BAR;

		if (this.state.mode === "busy") {
			const bearIdx = Math.floor(this.busyFrame / 2) % StatusBar.BUSY_BEARS.length;
			const bear = StatusBar.BUSY_BEARS[bearIdx];
			const sp = this.spinner ? ` ${this.spinner}` : "";
			const text = ` ${bear}${sp} ${this.state.text}`;
			return [`${S}${truncateToWidth(`${text}${" ".repeat(width)}`, width)}\x1b[0m`];
		}

		if (this.state.mode === "ready") {
			if (this.frame >= StatusBar.SLEEP_START) {
				const zzz = "z".repeat(
					Math.min(((this.frame - StatusBar.SLEEP_START) % StatusBar.SLEEP_CYCLE) + 1, 3)
				);
				const text = ` ʕ-ᴥ-ʔ < ${zzz}`;
				return [`${S}${truncateToWidth(`${text}${" ".repeat(width)}`, width)}\x1b[0m`];
			}
			const blink = this.frame % StatusBar.BLINK_CYCLE >= StatusBar.BLINK_CYCLE - 1;
			const bear = blink ? "ʕ-ᴥ-ʔ" : "ʕ•ᴥ•ʔ";
			const text = ` ${bear} < ${this.state.text}`;
			return [`${S}${truncateToWidth(`${text}${" ".repeat(width)}`, width)}\x1b[0m`];
		}

		if (this.state.mode === "error") {
			const text = ` ʕ>ᴥ<ʔ < ${this.state.text}`;
			return [`${S}${truncateToWidth(`${text}${" ".repeat(width)}`, width)}\x1b[0m`];
		}

		const text = ` ʕ•ᴥ•ʔ < ${this.state.text}`;
		return [`${S}${truncateToWidth(`${text}${" ".repeat(width)}`, width)}\x1b[0m`];
	}
}

class HelpOverlay implements Component {
	invalidate(): void {}

	render(width: number): string[] {
		const w = Math.max(28, width);
		const inner = Math.max(10, w - 4);
		const title = "\x1b[1;38;5;117mKeyboard Shortcuts\x1b[0m";
		const rows = [
			"Enter            Send message",
			"Shift+Enter      Insert newline",
			"Ctrl+C           Cancel while running / exit when idle",
			"Ctrl+D           Exit when editor is empty",
			"Ctrl+L           Clear visible chat messages",
			"Ctrl+G           Toggle this help",
			"/help            Show command help",
			"/clear           Clear conversation history",
			"/quit            Exit xi",
			"/resume          Show current session state",
			"/skills          Show or configure skills",
			"/init            Show initialization guidance",
			"/plan            Show planning guidance",
			"Esc              Close this dialog",
		];
		const lines = [
			`\x1b[38;5;111m╭${"─".repeat(Math.max(1, w - 2))}╮\x1b[0m`,
			`\x1b[38;5;111m│\x1b[0m ${truncateToWidth(title, inner, "", true)} \x1b[38;5;111m│\x1b[0m`,
			`\x1b[38;5;111m├${"─".repeat(Math.max(1, w - 2))}┤\x1b[0m`,
		];

		for (const row of rows) {
			lines.push(
				`\x1b[38;5;111m│\x1b[0m ${truncateToWidth(row, inner, "", true)} \x1b[38;5;111m│\x1b[0m`
			);
		}

		lines.push(`\x1b[38;5;111m╰${"─".repeat(Math.max(1, w - 2))}╯\x1b[0m`);
		return lines;
	}
}

export class ZiTui {
	private tui: TUI;
	private header: Header;
	private conversationArea: ConversationArea;
	private promptHint: PromptHint;
	private editor: Editor;
	private statusBar: StatusBar;
	private container: Container;
	private agent: Agent;
	private inFlight = false;
	private spinnerFrameIndex = 0;
	private spinnerTimer: Timer | null = null;
	private helpOverlay: OverlayHandle | null = null;
	private cwd: string;
	onExit?: () => void;

	constructor(agent: Agent, options: TuiOptions) {
		this.agent = agent;
		this.cwd = options.cwd;

		const terminal = new ProcessTerminal();
		this.tui = new TUI(terminal, true);

		this.header = new Header(options);
		this.conversationArea = new ConversationArea(this.tui);
		this.promptHint = new PromptHint();
		this.editor = new Editor(this.tui, DEFAULT_EDITOR_THEME, { paddingX: 1 });
		this.statusBar = new StatusBar(this.tui);

		this.container = new Container();
		this.container.addChild(this.header);
		this.container.addChild(this.conversationArea);
		this.container.addChild(this.promptHint);
		this.container.addChild(this.editor);
		this.container.addChild(this.statusBar);

		this.tui.addChild(this.container);
		this.tui.setFocus(this.editor);

		this.loadHistory(agent.getMessages());
		this.statusBar.setStatus({
			mode: "ready",
			text:
				this.conversationArea.count() > 0
					? `${this.conversationArea.count()} messages loaded`
					: "Ready",
		});

		this.editor.onSubmit = (text: string) => {
			void this.handleSubmit(text);
		};

		this.tui.addInputListener((data: string) => {
			if (matchesKey(data, "esc") && this.tui.hasOverlay()) {
				this.tui.hideOverlay();
				if (this.helpOverlay) {
					this.helpOverlay.setHidden(true);
				}
				return { consume: true };
			}
			if (matchesKey(data, "ctrl+g")) {
				this.toggleHelp();
				return { consume: true };
			}
			if (matchesKey(data, "ctrl+l")) {
				this.conversationArea.clear();
				this.statusBar.setStatus({ mode: "info", text: "Conversation cleared" });
				this.tui.requestRender();
				return { consume: true };
			}
			if (matchesKey(data, "ctrl+c")) {
				if (this.inFlight) {
					this.agent.abort();
					this.statusBar.setStatus({ mode: "busy", text: "Cancelling request..." });
					this.tui.requestRender();
					return { consume: true };
				}
				this.onExit?.();
				return { consume: true };
			}
			if (matchesKey(data, "ctrl+d") && this.editor.getText().trim() === "" && !this.inFlight) {
				this.onExit?.();
				return { consume: true };
			}
			return undefined;
		});
	}

	private async handleSubmit(text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) {
			return;
		}
		if (trimmed.startsWith("/")) {
			let command: SlashCommand;
			try {
				command = parseSlashCommand(trimmed);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.conversationArea.addMessage({ role: "user", content: trimmed });
				this.conversationArea.addMessage({ role: "assistant", content: `Error: ${message}` });
				this.statusBar.setStatus({ mode: "error", text: message });
				this.editor.setText("");
				this.tui.requestRender();
				return;
			}
			await this.handleSlashCommand(command);
			return;
		}
		if (this.inFlight) {
			this.statusBar.setStatus({ mode: "busy", text: "Previous request still running" });
			this.tui.requestRender();
			return;
		}

		this.conversationArea.addMessage({ role: "user", content: text });
		this.editor.setText("");
		this.inFlight = true;
		this.editor.disableSubmit = true;
		this.header.setInFlight(true);
		this.promptHint.setDisabled(true);
		this.startSpinner();
		this.conversationArea.startThinking();
		this.statusBar.setStatus({ mode: "busy", text: "Thinking..." });
		this.tui.requestRender();

		let streamStarted = false;

		try {
			const response = await this.agent.prompt(text, undefined, (event: StreamEvent) => {
				switch (event.type) {
					case "reasoning":
						this.conversationArea.setReasoning(event.text);
						this.tui.requestRender();
						break;
					case "text":
						if (!streamStarted) {
							streamStarted = true;
							this.conversationArea.stopThinking();
							this.conversationArea.clearReasoning();
							this.conversationArea.startStreaming();
						}
						this.conversationArea.appendToStream(event.text);
						this.tui.requestRender();
						break;
					case "tool-call-start":
						this.conversationArea.stopThinking();
						this.conversationArea.clearReasoning();
						this.conversationArea.addToolCall(event.toolName, event.args);
						this.tui.requestRender();
						break;
					case "tool-call-end":
						this.conversationArea.completeToolCall(event.toolName);
						this.tui.requestRender();
						break;
				}
			});

			if (!streamStarted) {
				this.conversationArea.stopThinking();
				this.conversationArea.addMessage({
					role: "assistant",
					content: response.content,
					toolCalls: response.toolCalls?.map((tc) => ({
						name: tc.name,
						args: tc.args,
					})),
				});
			} else {
				this.conversationArea.finishStreaming();
			}
			this.conversationArea.clearToolCalls();
			this.conversationArea.clearReasoning();
			this.statusBar.setStatus({ mode: "ready", text: "Ready" });
		} catch (error) {
			this.conversationArea.stopThinking();
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (streamStarted) {
				this.conversationArea.finishStreaming();
			}
			this.conversationArea.clearToolCalls();
			this.conversationArea.clearReasoning();
			this.conversationArea.addMessage({
				role: "assistant",
				content: `Error: ${errorMessage}`,
			});
			this.statusBar.setStatus({ mode: "error", text: errorMessage });
		} finally {
			this.stopSpinner();
			this.inFlight = false;
			this.editor.disableSubmit = false;
			this.header.setInFlight(false);
			this.promptHint.setDisabled(false);
			this.tui.requestRender();
		}
	}

	private async handleSlashCommand(command: SlashCommand): Promise<void> {
		this.conversationArea.addMessage({ role: "user", content: command.rawInput });
		this.editor.setText("");
		try {
			if (this.inFlight && !isCommandAvailableWhileRunning(command)) {
				throw new Error(`/${command.name} is unavailable while a request is running`);
			}

			switch (command.name) {
				case "help":
					this.toggleHelp();
					this.conversationArea.addMessage({
						role: "assistant",
						content:
							"Commands: /help, /clear, /quit, /resume, /skills, /init, /plan\n" +
							"/skills enable <name> | /skills disable <name> | /skills on | /skills off",
					});
					this.statusBar.setStatus({ mode: "info", text: "Help listed" });
					this.tui.requestRender();
					return;
				case "clear":
					this.agent.clearMessages();
					this.conversationArea.clear();
					this.statusBar.setStatus({ mode: "info", text: "Conversation cleared" });
					this.tui.requestRender();
					return;
				case "quit":
					this.statusBar.setStatus({ mode: "info", text: "Exiting..." });
					this.tui.requestRender();
					this.onExit?.();
					return;
				case "resume": {
					const count = this.agent.getMessages().length;
					this.conversationArea.addMessage({
						role: "assistant",
						content: count > 0 ? `Session active (${count} messages).` : "Session is empty.",
					});
					this.statusBar.setStatus({ mode: "info", text: "Session status shown" });
					this.tui.requestRender();
					return;
				}
				case "skills":
					if (!command.args) {
						const list = await formatSkillsList(this.cwd);
						this.conversationArea.addMessage({ role: "assistant", content: list });
						this.statusBar.setStatus({ mode: "info", text: "Skills listed" });
						this.tui.requestRender();
						return;
					}
					await this.handleSkillsCommand(command.tokens);
					this.tui.requestRender();
					return;
				case "init":
					this.conversationArea.addMessage({
						role: "assistant",
						content:
							"Initialization hint: create or update `AGENTS.md` with project-specific rules.",
					});
					this.statusBar.setStatus({ mode: "info", text: "Init guidance shown" });
					this.tui.requestRender();
					return;
				case "plan":
					this.conversationArea.addMessage({
						role: "assistant",
						content:
							"Planning hint: break work into small verifiable steps, then run check + test before closing.",
					});
					this.statusBar.setStatus({ mode: "info", text: "Plan guidance shown" });
					this.tui.requestRender();
					return;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.conversationArea.addMessage({
				role: "assistant",
				content: `Error: ${message}`,
			});
			this.statusBar.setStatus({ mode: "error", text: message });
			this.tui.requestRender();
		}
	}

	private async handleSkillsCommand(tokens: string[]): Promise<void> {
		const action = tokens[0]?.toLowerCase();
		const skillName = tokens.slice(1).join(" ").trim();
		if (action === "enable" || action === "disable") {
			if (!skillName) {
				throw new Error(`/skills ${action} requires a skill name`);
			}
			await updateSkillPreference(skillName, action, "project", this.cwd);
			this.conversationArea.addMessage({
				role: "assistant",
				content: `Skill ${action}d: ${skillName}`,
			});
			this.statusBar.setStatus({ mode: "info", text: `Skill ${action}d` });
			return;
		}

		if (action === "on" || action === "off") {
			await setSkillsOff(action === "off", "project", this.cwd);
			this.conversationArea.addMessage({
				role: "assistant",
				content: action === "off" ? "All skills disabled for this project." : "Skills enabled.",
			});
			this.statusBar.setStatus({ mode: "info", text: "Skill mode updated" });
			return;
		}

		throw new Error("Unknown /skills action. Use enable, disable, on, off");
	}

	private startSpinner(): void {
		this.spinnerFrameIndex = 0;
		this.statusBar.setSpinner(SPINNER_FRAMES[this.spinnerFrameIndex] ?? "");
		this.spinnerTimer = setInterval(() => {
			this.spinnerFrameIndex = (this.spinnerFrameIndex + 1) % SPINNER_FRAMES.length;
			this.statusBar.setSpinner(SPINNER_FRAMES[this.spinnerFrameIndex] ?? "");
			this.tui.requestRender();
		}, 80);
	}

	private stopSpinner(): void {
		if (this.spinnerTimer) {
			clearInterval(this.spinnerTimer);
			this.spinnerTimer = null;
		}
		this.statusBar.setSpinner("");
	}

	private toggleHelp(): void {
		if (!this.helpOverlay) {
			this.helpOverlay = this.tui.showOverlay(new HelpOverlay(), {
				anchor: "center",
				width: "76%",
				minWidth: 40,
				maxHeight: "80%",
				margin: 1,
			});
			this.statusBar.setStatus({ mode: "info", text: "Help opened" });
			this.tui.requestRender();
			return;
		}
		if (this.helpOverlay.isHidden()) {
			this.helpOverlay.setHidden(false);
			this.statusBar.setStatus({ mode: "info", text: "Help opened" });
		} else {
			this.helpOverlay.setHidden(true);
			this.statusBar.setStatus({ mode: "info", text: "Help closed" });
		}
		this.tui.requestRender();
	}

	private loadHistory(messages: ModelMessage[]): void {
		for (const message of messages) {
			if (message.role !== "user" && message.role !== "assistant") {
				continue;
			}
			const content = modelMessageToText(message);
			if (!content) {
				continue;
			}
			this.conversationArea.addMessage({
				role: message.role,
				content,
				toolCalls: message.role === "assistant" ? modelMessageToToolCalls(message) : undefined,
			});
		}
	}

	start(): void {
		this.tui.start();
		this.tui.requestRender();
	}

	stop(): void {
		this.stopSpinner();
		this.statusBar.stopAnimation();
		this.conversationArea.stopThinking();
		this.tui.stop();
	}

	addMessage(message: MessageItem): void {
		this.conversationArea.addMessage(message);
		this.tui.requestRender();
	}
}

function joinSides(left: string, right: string, width: number): string {
	const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
	const line = `${left}${" ".repeat(gap)}${right}`;
	return truncateToWidth(line, width);
}

function formatToolCallShort(args: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(args)) {
		if (typeof value === "string") {
			if (key === "path" || key === "file" || key === "filePath") {
				const basename = value.split("/").pop() ?? value;
				parts.push(`"${basename}"`);
			} else if (value.length > 30) {
				parts.push(`"${value.slice(0, 27)}..."`);
			} else {
				parts.push(`"${value}"`);
			}
		}
	}
	return parts.join(", ");
}

function formatToolCall(name: string, args: Record<string, unknown>): string {
	const parts = Object.entries(args)
		.slice(0, 2)
		.map(([k, v]) => `${k}=${formatArgValue(v)}`);
	const suffix = Object.keys(args).length > 2 ? ", ..." : "";
	return `${name}(${parts.join(", ")}${suffix})`;
}

function formatArgValue(value: unknown): string {
	if (value === null) {
		return "null";
	}
	if (typeof value === "string") {
		const oneLine = value.replace(/\s+/g, " ");
		return JSON.stringify(oneLine.length > 24 ? `${oneLine.slice(0, 21)}...` : oneLine);
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		return `[${value.length}]`;
	}
	if (typeof value === "object") {
		return "{...}";
	}
	const serialized = JSON.stringify(value);
	return serialized === undefined ? String(value) : serialized;
}

function modelMessageToText(message: ModelMessage): string {
	if (typeof message.content === "string") {
		return message.content;
	}
	if (!Array.isArray(message.content)) {
		return "";
	}
	const chunks: string[] = [];
	for (const part of message.content) {
		if (part && typeof part === "object" && "type" in part && part.type === "text") {
			const text = "text" in part ? part.text : "";
			if (typeof text === "string" && text.length > 0) {
				chunks.push(text);
			}
		}
	}
	return chunks.join("\n");
}

function modelMessageToToolCalls(
	message: ModelMessage
): Array<{ name: string; args: Record<string, unknown> }> | undefined {
	const maybeMessage = message as {
		toolInvocations?: unknown;
	};
	if (!Array.isArray(maybeMessage.toolInvocations)) {
		return undefined;
	}

	const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
	const seen = new Set<string>();

	for (const invocation of maybeMessage.toolInvocations) {
		if (!invocation || typeof invocation !== "object") {
			continue;
		}
		const item = invocation as {
			toolCallId?: unknown;
			toolName?: unknown;
			args?: unknown;
		};
		if (typeof item.toolName !== "string" || typeof item.args !== "object" || item.args === null) {
			continue;
		}
		const key =
			typeof item.toolCallId === "string"
				? item.toolCallId
				: `${item.toolName}:${JSON.stringify(item.args)}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		toolCalls.push({
			name: item.toolName,
			args: item.args as Record<string, unknown>,
		});
	}

	return toolCalls.length > 0 ? toolCalls : undefined;
}

export function createTui(agent: Agent, options: TuiOptions): ZiTui {
	return new ZiTui(agent, options);
}
