import { describe, expect, it } from "vitest";
import { isJupyterPortConflict } from "../src/tools/notebook-mode/jupyter-connection.ts";

describe("Jupyter connection", () => {
	it.each([
		"listen EADDRINUSE: address already in use 127.0.0.1:3000",
		"Address already in use (os error 98)",
		"Only one usage of each socket address is normally permitted (os error 10048)",
	])("recognizes a lost loopback port reservation: %s", (message) => {
		expect(isJupyterPortConflict(new Error(message))).toBe(true);
	});

	it("does not retry unrelated startup failures", () => {
		expect(isJupyterPortConflict(new Error("Deno executable not found"))).toBe(false);
	});
});
