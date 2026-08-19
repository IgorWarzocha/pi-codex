import { fauxAssistantMessage } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./suite/harness.ts";

describe("custom turn preparation", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		for (const harness of harnesses) harness.cleanup();
		harnesses.length = 0;
	});

	it("runs before_agent_start for idle custom messages that trigger a turn", async () => {
		const starts: Array<{ source: "prompt" | "custom"; prompt: string }> = [];
		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.on("before_agent_start", (event) => {
						starts.push({ source: event.source, prompt: event.prompt });
						return {
							message: {
								customType: "prepared-context",
								content: "injected",
								display: false,
							},
							systemPrompt: `${event.systemPrompt}\n\ncustom turn prepared`,
						};
					});
				},
			],
		});
		harnesses.push(harness);
		let providerSystemPrompt = "";
		harness.setResponses([
			(context) => {
				providerSystemPrompt = context.systemPrompt ?? "";
				return fauxAssistantMessage("done");
			},
		]);

		await harness.session.sendCustomMessage(
			{ customType: "turn-trigger", content: "start from developer context", display: true },
			{ triggerTurn: true },
		);

		expect(starts).toEqual([{ source: "custom", prompt: "start from developer context" }]);
		expect(providerSystemPrompt).toContain("custom turn prepared");
		expect(
			harness.session.messages.filter((message) => message.role === "custom").map((message) => message.customType),
		).toEqual(["turn-trigger", "prepared-context"]);
	});
});
