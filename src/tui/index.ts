import {
	type Component,
	Container,
	Editor,
	type EditorTheme,
	Markdown,
	type MarkdownTheme,
	ProcessTerminal,
	TUI,
} from "@mariozechner/pi-tui";
import type { Agent, AgentResponse } from "@/agent/index.js";

export interface TuiOptions {
	sessionId: string;
	model: string;
	provider: string;
}

export interface MessageItem {
	role: "user" | "assistant";
	content: string;
}

const DEFAULT_MARKDOWN_THEME: MarkdownTheme = {
	heading: (text: string) => `\x1b[1;36m${text}\x1b[0m`,
	link: (text: string) => `\x1b[4;34m${text}\x1b[0m`,
	linkUrl: (text: string) => `\x1b[2;34m${text}\x1b[0m`,
	code: (text: string) => `\x1b[33m${text}\x1b[0m`,
	codeBlock: (text: string) => `\x1b[2;37m${text}\x1b[0m`,
	codeBlockBorder: (text: string) => `\x1b[2;37m${text}\x1b[0m`,
	quote: (text: string) => `\x1b[2;37m${text}\x1b[0m`,
	quoteBorder: (text: string) => `\x1b[2;37m${text}\x1b[0m`,
	hr: (text: string) => `\x1b[2;37m${text}\x1b[0m`,
	listBullet: (text: string) => `\x1b[33m${text}\x1b[0m`,
	bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
	italic: (text: string) => `\x1b[3m${text}\x1b[0m`,
	strikethrough: (text: string) => `\x1b[9m${text}\x1b[0m`,
	underline: (text: string) => `\x1b[4m${text}\x1b[0m`,
};

const DEFAULT_EDITOR_THEME: EditorTheme = {
	borderColor: (str: string) => `\x1b[36m${str}\x1b[0m`,
	selectList: {
		selectedPrefix: (str: string) => `\x1b[7m${str}\x1b[0m`,
		selectedText: (str: string) => `\x1b[7m${str}\x1b[0m`,
		description: (str: string) => `\x1b[2m${str}\x1b[0m`,
		scrollInfo: (str: string) => `\x1b[2m${str}\x1b[0m`,
		noMatch: (str: string) => `\x1b[2m${str}\x1b[0m`,
	},
};

class Header implements Component {
	private sessionId: string;
	private model: string;
	private provider: string;

	constructor(options: TuiOptions) {
		this.sessionId = options.sessionId;
		this.model = options.model;
		this.provider = options.provider;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const sessionPart = `Session: ${this.sessionId}`;
		const modelPart = `${this.provider}/${this.model}`;

		const content = `${sessionPart} │ ${modelPart}`;

		const line = content.length > width ? content.slice(0, width - 3) + "..." : content;
		return [`\x1b[1;36m${line}\x1b[0m`];
	}
}

class MessageArea implements Component {
	private messages: MessageItem[] = [];

	addMessage(message: MessageItem): void {
		this.messages.push(message);
	}

	clear(): void {
		this.messages = [];
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines: string[] = [];

		for (const msg of this.messages) {
			const prefix =
				msg.role === "user" ? "\x1b[1;32mYou:\x1b[0m " : "\x1b[1;33mAssistant:\x1b[0m ";
			const markdown = new Markdown(msg.content, 0, 0, DEFAULT_MARKDOWN_THEME);
			const rendered = markdown.render(width - 2);
			lines.push(prefix);
			lines.push(...rendered);
			lines.push("");
		}

		return lines;
	}
}

class StatusBar implements Component {
	private status: string = "Ready";

	setStatus(status: string): void {
		this.status = status;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const line = `\x1b[7m ${this.status.padEnd(width - 1)}\x1b[0m`;
		return [line.slice(0, width)];
	}
}

export class ZiTui {
	private tui: TUI;
	private header: Header;
	private messageArea: MessageArea;
	private editor: Editor;
	private statusBar: StatusBar;
	private container: Container;
	private agent: Agent;

	constructor(agent: Agent, options: TuiOptions) {
		this.agent = agent;

		const terminal = new ProcessTerminal();
		this.tui = new TUI(terminal, true);

		this.header = new Header(options);
		this.messageArea = new MessageArea();
		this.editor = new Editor(this.tui, DEFAULT_EDITOR_THEME, { paddingX: 1 });
		this.statusBar = new StatusBar();

		this.container = new Container();
		this.container.addChild(this.header);
		this.container.addChild(this.messageArea);
		this.container.addChild(this.editor);
		this.container.addChild(this.statusBar);

		this.tui.addChild(this.container);
		this.tui.setFocus(this.editor);

		this.editor.onSubmit = async (text: string) => {
			await this.handleSubmit(text);
		};
	}

	private async handleSubmit(text: string): Promise<void> {
		if (!text.trim()) return;

		this.messageArea.addMessage({ role: "user", content: text });
		this.editor.setText("");
		this.statusBar.setStatus("Thinking...");
		this.tui.requestRender();

		try {
			const response: AgentResponse = await this.agent.prompt(text);
			this.messageArea.addMessage({ role: "assistant", content: response.content });
			this.statusBar.setStatus("Ready");
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.messageArea.addMessage({ role: "assistant", content: `Error: ${errorMessage}` });
			this.statusBar.setStatus("Error");
		}

		this.tui.requestRender();
	}

	start(): void {
		this.tui.start();
		this.statusBar.setStatus("Ready");
		this.tui.requestRender();
	}

	stop(): void {
		this.tui.stop();
	}

	addMessage(message: MessageItem): void {
		this.messageArea.addMessage(message);
		this.tui.requestRender();
	}
}

export function createTui(agent: Agent, options: TuiOptions): ZiTui {
	return new ZiTui(agent, options);
}
