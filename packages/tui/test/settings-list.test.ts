import assert from "node:assert";
import { describe, it } from "node:test";
import { SettingsList, type SettingsListTheme } from "../src/components/settings-list.ts";

const testTheme: SettingsListTheme = {
	label: (text) => text,
	value: (text) => text,
	description: (text) => text,
	cursor: "> ",
	hint: (text) => text,
};

const items = [
	{
		id: "tui-mode",
		label: "TUI mode",
		currentValue: "regular",
		values: ["regular", "fullscreen"],
	},
];

describe("SettingsList", () => {
	it("includes spaces in an active search instead of changing the selected setting", () => {
		const changes: Array<{ id: string; value: string }> = [];
		const list = new SettingsList(
			items.map((item) => ({ ...item })),
			10,
			testTheme,
			(id, value) => changes.push({ id, value }),
			() => {},
			{ enableSearch: true },
		);

		for (const character of "TUI mode") list.handleInput(character);

		assert.deepStrictEqual(changes, []);
		assert.match(list.render(80)[0] ?? "", /TUI mode/);

		list.handleInput("\r");
		assert.deepStrictEqual(changes, [{ id: "tui-mode", value: "fullscreen" }]);
	});

	it("keeps Space as a change shortcut before a search query is entered", () => {
		const changes: Array<{ id: string; value: string }> = [];
		const list = new SettingsList(
			items.map((item) => ({ ...item })),
			10,
			testTheme,
			(id, value) => changes.push({ id, value }),
			() => {},
			{ enableSearch: true },
		);

		list.handleInput(" ");

		assert.deepStrictEqual(changes, [{ id: "tui-mode", value: "fullscreen" }]);
	});

	it("supports fixed rows, columns, and description height", () => {
		const list = new SettingsList(
			[
				{
					id: "first",
					label: "Short",
					currentValue: "one",
					description: "A long description that wraps beyond the two reserved lines in a narrow view.",
				},
				{ id: "second", label: "Longer label", currentValue: "two", description: "Short description." },
			],
			3,
			testTheme,
			() => {},
			() => {},
			{ descriptionLines: 2, fixedHeight: true, labelWidth: 16, showHint: false },
		);

		const rendered = list.render(34);
		assert.strictEqual(rendered.length, 7);
		assert.strictEqual(rendered[0]?.indexOf("one"), rendered[1]?.indexOf("two"));
		assert.strictEqual(rendered[2], "");
		assert.strictEqual(rendered[3], "");
	});
});
