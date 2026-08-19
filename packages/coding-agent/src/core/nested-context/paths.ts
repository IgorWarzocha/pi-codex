import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

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
