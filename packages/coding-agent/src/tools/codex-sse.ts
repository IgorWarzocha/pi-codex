interface CodexSSEEvent {
	type?: string | undefined;
	[key: string]: unknown;
}

export async function* parseSSE(
	response: Response,
	signal?: AbortSignal,
	idleTimeoutMs?: number,
): AsyncIterable<CodexSSEEvent> {
	if (!response.body) return;

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const onAbort = () => {
		void reader.cancel().catch(() => {});
	};
	signal?.addEventListener("abort", onAbort, { once: true });

	try {
		while (true) {
			if (signal?.aborted) throw new Error("Request was aborted");
			let idleTimer: ReturnType<typeof setTimeout> | undefined;
			const read = reader.read();
			const { done, value } =
				idleTimeoutMs === undefined || idleTimeoutMs <= 0
					? await read
					: await Promise.race([
							read,
							new Promise<never>((_resolve, reject) => {
								idleTimer = setTimeout(
									() => reject(new Error(`Codex SSE stream idle timeout after ${idleTimeoutMs}ms`)),
									idleTimeoutMs,
								);
							}),
						]).finally(() => {
							if (idleTimer) clearTimeout(idleTimer);
						});
			if (signal?.aborted) throw new Error("Request was aborted");
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const trailingCarriageReturn = buffer.endsWith("\r");
			const complete = trailingCarriageReturn ? buffer.slice(0, -1) : buffer;
			buffer = complete.replace(/\r\n/g, "\n").replace(/\r/g, "\n") + (trailingCarriageReturn ? "\r" : "");
			let index = buffer.indexOf("\n\n");
			while (index !== -1) {
				const chunk = buffer.slice(0, index);
				buffer = buffer.slice(index + 2);
				const data = chunk
					.split("\n")
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trim())
					.join("\n")
					.trim();
				if (data && data !== "[DONE]") {
					try {
						yield JSON.parse(data) as CodexSSEEvent;
					} catch {}
				}
				index = buffer.indexOf("\n\n");
			}
		}
	} finally {
		signal?.removeEventListener("abort", onAbort);
		await reader.cancel().catch(() => {});
		try {
			reader.releaseLock();
		} catch {}
	}
}
