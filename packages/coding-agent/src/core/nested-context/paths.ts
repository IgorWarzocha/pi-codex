import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export function resolveContextPath(targetPath: string, baseDir: string): string {
	const cleaned = targetPath.startsWith("@") ? targetPath.slice(1) : targetPath;
	const absolute = isAbsolute(cleaned) ? resolve(cleaned) : resolve(baseDir, cleaned);
	try {
		return realpathSync.native?.(absolute) ?? realpathSync(absolute);
	} catch {
		return absolute;
	}
}

export function isInsideRoot(rootDir: string, targetPath: string): boolean {
	if (!rootDir) return false;
	const rel = relative(rootDir, targetPath);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function contentRootForTarget(targetPath: string): string {
	try {
		const startDir = existsSync(targetPath) && statSync(targetPath).isDirectory() ? targetPath : dirname(targetPath);
		let dir = startDir;
		let nearestContextRoot = "";
		while (true) {
			if (existsSync(join(dir, "AGENTS.md")) || existsSync(join(dir, "AGENTS.override.md"))) {
				nearestContextRoot = dir;
			}
			if (existsSync(join(dir, ".git"))) return dir;
			const parent = dirname(dir);
			if (parent === dir) return nearestContextRoot || startDir;
			dir = parent;
		}
	} catch {
		return "";
	}
}
