import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(packageRoot, process.argv[2] ?? "dist");
const platformArch = `${process.platform}-${process.arch}`;
const tools = [
	["apply-patch", "apply_patch"],
	["exec", "exec_bridge"],
	["view-image", "view_image"],
	["web-run", "web_run"],
	["imagegen", "imagegen"],
];

for (const [directory, name] of tools) {
	const filename = process.platform === "win32" ? `${name}.exe` : name;
	const source = join(packageRoot, "src", "tools", directory, "bin", platformArch, filename);
	const targetDirectory = join(outputRoot, "tools", directory);
	mkdirSync(targetDirectory, { recursive: true });
	const target = join(targetDirectory, filename);
	copyFileSync(source, target);
	if (process.platform !== "win32") chmodSync(target, 0o755);
}

const shellDirectory = join(outputRoot, "shell");
mkdirSync(shellDirectory, { recursive: true });
copyFileSync(join(packageRoot, "src", "shell", "tree-sitter-bash.wasm"), join(shellDirectory, "tree-sitter-bash.wasm"));

const codeModeDirectory = join(outputRoot, "tools", "code-mode");
mkdirSync(codeModeDirectory, { recursive: true });
copyFileSync(
	join(packageRoot, "src", "tools", "code-mode", "CUSTOM-TOOLS.md"),
	join(codeModeDirectory, "CUSTOM-TOOLS.md"),
);
