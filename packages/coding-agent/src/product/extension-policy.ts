export const RETIRED_PI_CODEX_EXTENSION_PACKAGE = "@howaboua/pi-codex-conversion";

/** The native fork supersedes the conversion extension, so it must never execute. */
export function isRetiredPiCodexExtension(extensionPath: string): boolean {
	const normalizedPath = extensionPath.replaceAll("\\", "/");
	return `/${normalizedPath}/`.includes(`/${RETIRED_PI_CODEX_EXTENSION_PACKAGE}/`);
}
