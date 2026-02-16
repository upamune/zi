import type { ToolCall } from "agentfs-sdk";
import {
	escapeHtml,
	fileContentView,
	fileList,
	formatBytes,
	formatDate,
	sessionCard,
	toolCallRow,
	toolStatsTable,
} from "./components.js";
import type { SessionDetail, SessionSummary } from "./session-loader.js";

function layoutHtml(title: string, body: string): string {
	return `<!DOCTYPE html>
<html lang="ja" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - xi browse</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
    }
  </script>
</head>
<body class="bg-gray-950 text-gray-200 min-h-screen">
  <header class="border-b border-gray-800 px-6 py-4">
    <a href="/" class="flex items-center gap-3 hover:opacity-80 transition-opacity">
      <span class="text-2xl">ʕ•ᴥ•ʔ</span>
      <span class="text-xl font-bold text-gray-100">xi browse</span>
    </a>
  </header>
  <main class="max-w-5xl mx-auto px-6 py-8">
    ${body}
  </main>
</body>
</html>`;
}

export function sessionsPage(sessions: SessionSummary[]): string {
	if (sessions.length === 0) {
		const body = `
<div class="text-center py-16">
  <p class="text-4xl mb-4">ʕ•ᴥ•ʔ</p>
  <p class="text-gray-400">No sessions found.</p>
  <p class="text-gray-500 text-sm mt-2">Run <code class="bg-gray-800 px-2 py-1 rounded">xi</code> to create a session.</p>
</div>`;
		return layoutHtml("Sessions", body);
	}

	const cards = sessions.map(sessionCard).join("");
	const body = `
<h1 class="text-xl font-bold text-gray-100 mb-6">Sessions <span class="text-gray-500 font-normal text-base">(${sessions.length})</span></h1>
<div class="grid gap-4">${cards}</div>`;
	return layoutHtml("Sessions", body);
}

export function sessionDetailPage(detail: SessionDetail): string {
	const body = `
<div class="mb-6">
  <a href="/" class="text-sm text-gray-400 hover:text-gray-200">&larr; All Sessions</a>
</div>
<div class="mb-6">
  <h1 class="text-xl font-bold text-gray-100 mb-2">
    <code class="font-mono">${escapeHtml(detail.id)}</code>
  </h1>
  <div class="flex gap-4 text-sm text-gray-400">
    <span>Created: ${formatDate(detail.created)}</span>
    <span>Modified: ${formatDate(detail.modified)}</span>
    <span>${formatBytes(detail.fileSize)}</span>
    <span>${detail.toolCallCount} tool calls</span>
  </div>
</div>

<div class="mb-6">
  <h2 class="text-lg font-semibold text-gray-200 mb-3">Tool Stats</h2>
  ${toolStatsTable(detail.toolStats)}
</div>

<div class="border-b border-gray-800 mb-6">
  <nav class="flex gap-1">
    <button
      hx-get="/sessions/${escapeHtml(detail.id)}/tools"
      hx-target="#tab-content"
      hx-swap="innerHTML"
      class="px-4 py-2 text-sm text-gray-300 hover:text-white border-b-2 border-blue-500 font-medium"
      onclick="selectTab(this)"
    >Tool Calls</button>
    <button
      hx-get="/sessions/${escapeHtml(detail.id)}/files"
      hx-target="#tab-content"
      hx-swap="innerHTML"
      class="px-4 py-2 text-sm text-gray-400 hover:text-white border-b-2 border-transparent"
      onclick="selectTab(this)"
    >Files</button>
  </nav>
</div>

<div id="tab-content">
  ${toolCallsPartial(detail.toolCalls)}
</div>

<div id="file-content" class="mt-6"></div>

<script>
function selectTab(el) {
  const buttons = el.parentElement.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.classList.remove('border-blue-500', 'text-gray-300', 'font-medium');
    btn.classList.add('border-transparent', 'text-gray-400');
  });
  el.classList.remove('border-transparent', 'text-gray-400');
  el.classList.add('border-blue-500', 'text-gray-300', 'font-medium');
}
</script>`;
	return layoutHtml(`Session ${detail.id}`, body);
}

export function toolCallsPartial(toolCalls: ToolCall[]): string {
	if (toolCalls.length === 0) {
		return '<p class="text-gray-500">No tool calls recorded.</p>';
	}

	const rows = toolCalls.map(toolCallRow).join("");
	return `
<table class="w-full text-sm text-gray-300">
  <thead>
    <tr class="border-b border-gray-700 text-gray-400 text-xs uppercase">
      <th class="py-2 px-3 w-10"></th>
      <th class="py-2 px-3 text-left">Tool</th>
      <th class="py-2 px-3 text-left">Parameters</th>
      <th class="py-2 px-3 text-right">Duration</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

export function filesPartial(
	sessionId: string,
	modifiedFiles: string[],
	deletedFiles: string[]
): string {
	return fileList(sessionId, modifiedFiles, deletedFiles);
}

export function fileContentPartial(path: string, content: string): string {
	return fileContentView(path, content);
}

export function notFoundPage(): string {
	const body = `
<div class="text-center py-16">
  <p class="text-4xl mb-4">ʕ>ᴥ<ʔ</p>
  <p class="text-gray-400">Page not found.</p>
  <a href="/" class="text-sm text-blue-400 hover:underline mt-4 inline-block">&larr; Back to sessions</a>
</div>`;
	return layoutHtml("Not Found", body);
}
