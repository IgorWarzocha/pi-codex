import { cpSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(packageRoot, "src", "voice");
const target = join(packageRoot, "dist", "voice");
mkdirSync(target, { recursive: true });
for (const name of ["bin", "REALTIME-SYSTEM-PROMPT.md", "REALTIME-SYSTEM-PROMPT-CHANGELOG.md"]) {
	cpSync(join(source, name), join(target, name), { recursive: true });
}
mkdirSync(join(target, "lan"), { recursive: true });
cpSync(join(source, "lan", "assets"), join(target, "lan", "assets"), { recursive: true });
