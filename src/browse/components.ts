import type { ToolCall, ToolCallStats } from "agentfs-sdk";
import type { SessionSummary } from "./session-loader.js";

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(date: Date): string {
	return date.toLocaleString("ja-JP", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function sessionCard(session: SessionSummary): string {
	const toolBadges = session.toolNames
		.map(
			(name) =>
				`<span class="inline-block bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded">${escapeHtml(name)}</span>`
		)
		.join(" ");

	return `
<a href="/sessions/${escapeHtml(session.id)}" class="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors">
  <div class="flex items-center justify-between mb-2">
    <code class="text-sm text-blue-400 font-mono">${escapeHtml(session.id)}</code>
    <span class="text-xs text-gray-500">${formatBytes(session.fileSize)}</span>
  </div>
  <div class="text-xs text-gray-400 mb-2">
    <span>Modified: ${formatDate(session.modified)}</span>
  </div>
  <div class="flex items-center gap-2 mb-2">
    <span class="text-sm text-gray-300">${session.toolCallCount} tool calls</span>
  </div>
  <div class="flex flex-wrap gap-1">${toolBadges}</div>
</a>`;
}

export function toolCallRow(tc: ToolCall): string {
	const statusIcon =
		tc.status === "success"
			? '<span class="text-green-400">&#10003;</span>'
			: tc.status === "error"
				? '<span class="text-red-400">&#10007;</span>'
				: '<span class="text-yellow-400">&#9679;</span>';

	const duration = tc.duration_ms != null ? `${tc.duration_ms}ms` : "-";
	const params = tc.parameters ? escapeHtml(JSON.stringify(tc.parameters).slice(0, 120)) : "-";
	const errorText = tc.error
		? `<div class="text-red-400 text-xs mt-1">${escapeHtml(tc.error)}</div>`
		: "";

	return `
<tr class="border-b border-gray-800 hover:bg-gray-900/50">
  <td class="py-2 px-3 text-center">${statusIcon}</td>
  <td class="py-2 px-3 font-mono text-sm text-blue-300">${escapeHtml(tc.name)}</td>
  <td class="py-2 px-3 text-xs text-gray-400 max-w-md truncate">${params}${errorText}</td>
  <td class="py-2 px-3 text-xs text-gray-500 text-right">${duration}</td>
</tr>`;
}

export function toolStatsTable(stats: ToolCallStats[]): string {
	if (stats.length === 0) return '<p class="text-gray-500">No stats available.</p>';

	const rows = stats
		.map(
			(s) => `
<tr class="border-b border-gray-800">
  <td class="py-2 px-3 font-mono text-sm text-blue-300">${escapeHtml(s.name)}</td>
  <td class="py-2 px-3 text-right">${s.total_calls}</td>
  <td class="py-2 px-3 text-right text-green-400">${s.successful}</td>
  <td class="py-2 px-3 text-right text-red-400">${s.failed}</td>
  <td class="py-2 px-3 text-right text-gray-400">${Math.round(s.avg_duration_ms)}ms</td>
</tr>`
		)
		.join("");

	return `
<table class="w-full text-sm text-gray-300">
  <thead>
    <tr class="border-b border-gray-700 text-gray-400 text-xs uppercase">
      <th class="py-2 px-3 text-left">Tool</th>
      <th class="py-2 px-3 text-right">Total</th>
      <th class="py-2 px-3 text-right">OK</th>
      <th class="py-2 px-3 text-right">Err</th>
      <th class="py-2 px-3 text-right">Avg</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

export function fileList(
	sessionId: string,
	modifiedFiles: string[],
	deletedFiles: string[]
): string {
	if (modifiedFiles.length === 0 && deletedFiles.length === 0) {
		return '<p class="text-gray-500">No file changes recorded.</p>';
	}

	const modified = modifiedFiles
		.map(
			(f) => `
<li class="flex items-center gap-2 py-1">
  <span class="text-green-400 text-xs font-bold">M</span>
  <button hx-get="/sessions/${escapeHtml(sessionId)}/files/${escapeHtml(encodeURIComponent(f))}" hx-target="#file-content" hx-swap="innerHTML" class="text-sm text-blue-300 hover:underline font-mono truncate text-left">${escapeHtml(f)}</button>
</li>`
		)
		.join("");

	const deleted = deletedFiles
		.map(
			(f) => `
<li class="flex items-center gap-2 py-1">
  <span class="text-red-400 text-xs font-bold">D</span>
  <span class="text-sm text-gray-400 font-mono truncate line-through">${escapeHtml(f)}</span>
</li>`
		)
		.join("");

	return `<ul class="space-y-0.5">${modified}${deleted}</ul>`;
}

export function fileContentView(path: string, content: string): string {
	return `
<div class="mt-4">
  <div class="flex items-center justify-between mb-2">
    <h3 class="text-sm font-mono text-gray-300">${escapeHtml(path)}</h3>
  </div>
  <pre class="bg-gray-900 border border-gray-800 rounded p-4 text-xs text-gray-300 overflow-x-auto"><code>${escapeHtml(content)}</code></pre>
</div>`;
}
