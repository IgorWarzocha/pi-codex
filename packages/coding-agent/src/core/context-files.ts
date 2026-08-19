import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";

export const PROJECT_CONTEXT_FILE_NAMES = [
	"AGENTS.override.md",
	"AGENTS.md",
	"AGENTS.MD",
	"CLAUDE.md",
	"CLAUDE.MD",
] as const;

export function loadContextFileFromDir(dir: string): { path: string; content: string } | null {
	for (const filename of PROJECT_CONTEXT_FILE_NAMES) {
		const filePath = join(dir, filename);
		if (!existsSync(filePath)) continue;
		try {
			if (!statSync(filePath).isFile()) continue;
			return { path: filePath, content: readFileSync(filePath, "utf-8") };
		} catch (error) {
			console.error(chalk.yellow(`Warning: Could not read ${filePath}: ${error}`));
		}
	}
	return null;
}
