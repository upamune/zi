import { getFileContent, getSessionDetail, listSessionSummaries } from "./session-loader.js";
import {
	fileContentPartial,
	filesPartial,
	notFoundPage,
	sessionDetailPage,
	sessionsPage,
	toolCallsPartial,
} from "./templates.js";

function html(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

function matchRoute(pathname: string, pattern: string): Record<string, string> | null {
	const patternParts = pattern.split("/");
	const pathParts = pathname.split("/");

	if (pattern.endsWith("/*")) {
		if (pathParts.length < patternParts.length - 1) return null;
	} else {
		if (patternParts.length !== pathParts.length) return null;
	}

	const params: Record<string, string> = {};
	for (let i = 0; i < patternParts.length; i++) {
		const pp = patternParts[i];
		if (pp === "*") {
			params["*"] = pathParts.slice(i).join("/");
			return params;
		}
		if (pp.startsWith(":")) {
			params[pp.slice(1)] = pathParts[i];
		} else if (pp !== pathParts[i]) {
			return null;
		}
	}
	return params;
}

export async function handleRequest(req: Request, baseDir: string): Promise<Response> {
	const url = new URL(req.url);
	const pathname = url.pathname;
	const isHtmx = req.headers.get("HX-Request") === "true";

	if (pathname === "/" || pathname === "") {
		const sessions = listSessionSummaries(baseDir);
		return html(sessionsPage(sessions));
	}

	let params = matchRoute(pathname, "/sessions/:id");
	if (params) {
		const detail = await getSessionDetail(params.id, baseDir);
		if (!detail) return html(notFoundPage(), 404);
		return html(sessionDetailPage(detail));
	}

	params = matchRoute(pathname, "/sessions/:id/tools");
	if (params) {
		const detail = await getSessionDetail(params.id, baseDir);
		if (!detail) return html(notFoundPage(), 404);
		if (isHtmx) return html(toolCallsPartial(detail.toolCalls));
		return html(sessionDetailPage(detail));
	}

	params = matchRoute(pathname, "/sessions/:id/files");
	if (params) {
		const detail = await getSessionDetail(params.id, baseDir);
		if (!detail) return html(notFoundPage(), 404);
		if (isHtmx) return html(filesPartial(params.id, detail.modifiedFiles, detail.deletedFiles));
		return html(sessionDetailPage(detail));
	}

	params = matchRoute(pathname, "/sessions/:id/files/*");
	if (params) {
		const filePath = decodeURIComponent(params["*"]);
		const content = await getFileContent(params.id, filePath, baseDir);
		if (!content) return html('<p class="text-gray-500">File not found.</p>', 404);
		if (isHtmx) return html(fileContentPartial(content.path, content.content));
		return html(fileContentPartial(content.path, content.content));
	}

	return html(notFoundPage(), 404);
}
