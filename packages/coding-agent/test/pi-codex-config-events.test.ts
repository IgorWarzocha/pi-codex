import { afterEach, describe, expect, it } from "vitest";
import { PI_CODEX_CONFIG_CHANGED_CHANNEL } from "../src/adapter/activation/config-events.ts";
import { createHarness, type Harness } from "./suite/harness.ts";

describe("Pi-Codex config events", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		for (const harness of harnesses) harness.cleanup();
		harnesses.length = 0;
	});

	it("notifies the native extension when session settings change", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		let notifications = 0;
		harness.session.resourceLoader.getExtensions().runtime.events.on(PI_CODEX_CONFIG_CHANGED_CHANNEL, () => {
			notifications += 1;
		});

		harness.session.setPiCodexSettings({ ui: { backgroundShellWidget: false } });

		expect(harness.settingsManager.getPiCodexSettings()).toEqual({
			ui: { backgroundShellWidget: false },
		});
		expect(notifications).toBe(1);
	});
});
