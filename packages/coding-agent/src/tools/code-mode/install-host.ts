import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getProxyForUrl } from "proxy-from-env";
import { fetch, ProxyAgent } from "undici";
import { codeModeHostBinaryName, hostAssetUrl, resolveCodeModeHostAsset } from "./host-assets.ts";

const DOWNLOAD_TIMEOUT_MS = 120_000;
const INSTALL_LOCK_POLL_MS = 200;
const INSTALL_LOCK_TIMEOUT_MS = 125_000;
const INSTALL_LOCK_STALE_MS = 180_000;
const INSTALL_LOCK_OWNER_FILE = "owner.json";
export interface InstallCodeModeHostOptions {
	destination: string;
	platform: string;
	arch: string;
	signal?: AbortSignal | undefined;
}

export async function installCodeModeHost(options: InstallCodeModeHostOptions): Promise<void> {
	const { destination: destinationInput, platform, arch, signal } = options;
	const [assetName, expectedSha256] = resolveCodeModeHostAsset(platform, arch);
	const binaryName = codeModeHostBinaryName(platform);
	const destination = resolve(destinationInput);
	if (basename(destination) !== binaryName) {
		throw new Error(`Code-mode host destination must end with ${binaryName}`);
	}
	if (existsSync(destination)) return;
	mkdirSync(resolve(destination, ".."), { recursive: true });
	const lockPath = `${destination}.lock`;
	const lockToken = await acquireInstallLock(lockPath, destination, signal);
	if (!lockToken) return;

	const temporary = mkdtempSync(join(tmpdir(), "pi-codex-code-mode-"));
	const staged = `${destination}.${process.pid}.tmp`;
	try {
		const assetUrl = hostAssetUrl(assetName);
		let bytes: Buffer;
		let dispatcher: ProxyAgent | undefined;
		try {
			const timeoutSignal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
			const proxy = getProxyForUrl(assetUrl);
			dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
			const response = await fetch(assetUrl, {
				redirect: "follow",
				signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
				...(dispatcher ? { dispatcher } : {}),
			});
			if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);
			bytes = Buffer.from(await response.arrayBuffer());
		} catch (error) {
			throw new Error(`failed to download ${assetUrl}: ${error instanceof Error ? error.message : String(error)}`, {
				cause: error,
			});
		} finally {
			await dispatcher?.close();
		}
		if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) {
			throw new Error(`checksum mismatch for ${assetName}`);
		}
		if (platform === "win32") {
			writeFileSync(staged, bytes);
		} else {
			const archive = join(temporary, basename(assetName));
			writeFileSync(archive, bytes);
			const extracted = join(temporary, "extracted");
			mkdirSync(extracted);
			const result = spawnSync("tar", ["-xzf", archive, "-C", extracted], { stdio: "inherit" });
			signal?.throwIfAborted();
			if (result.status !== 0) throw new Error("failed to extract code-mode host archive");
			const candidates = walk(extracted).filter((path) => basename(path).startsWith("codex-code-mode-host"));
			if (candidates.length !== 1) throw new Error(`expected one code-mode host binary, found ${candidates.length}`);
			copyFileSync(candidates[0]!, staged);
			chmodSync(staged, 0o755);
		}
		renameSync(staged, destination);
	} finally {
		rmSync(staged, { force: true });
		rmSync(temporary, { recursive: true, force: true });
		releaseInstallLock(lockPath, lockToken);
	}
}

export async function acquireInstallLock(
	lockPath: string,
	destination: string,
	signal: AbortSignal | undefined,
): Promise<string | undefined> {
	const token = randomUUID();
	const deadline = Date.now() + INSTALL_LOCK_TIMEOUT_MS;
	while (Date.now() < deadline) {
		signal?.throwIfAborted();
		if (existsSync(destination)) return undefined;
		try {
			mkdirSync(lockPath);
			try {
				writeFileSync(join(lockPath, INSTALL_LOCK_OWNER_FILE), JSON.stringify({ token, pid: process.pid }));
			} catch (error) {
				rmSync(lockPath, { recursive: true, force: true });
				throw error;
			}
			return token;
		} catch (error) {
			if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
			try {
				if (canRemoveStaleLock(lockPath)) {
					rmSync(lockPath, { recursive: true, force: true });
					continue;
				}
			} catch (statError) {
				if (!statError || typeof statError !== "object" || !("code" in statError) || statError.code !== "ENOENT")
					throw statError;
			}
			await delay(INSTALL_LOCK_POLL_MS, undefined, signal ? { signal } : undefined);
		}
	}
	if (existsSync(destination)) return undefined;
	throw new Error(`timed out waiting for code-mode host install lock: ${lockPath}`);
}

export function releaseInstallLock(lockPath: string, token: string): void {
	try {
		const owner = readLockOwner(lockPath);
		if (owner?.token === token) rmSync(lockPath, { recursive: true, force: true });
	} catch {
		// A missing or replaced lock does not belong to this installer.
	}
}

function canRemoveStaleLock(lockPath: string): boolean {
	if (Date.now() - statSync(lockPath).mtimeMs <= INSTALL_LOCK_STALE_MS) return false;
	const owner = readLockOwner(lockPath);
	return !owner || !isProcessAlive(owner.pid);
}

function readLockOwner(lockPath: string): { token: string; pid: number } | undefined {
	try {
		const value = JSON.parse(readFileSync(join(lockPath, INSTALL_LOCK_OWNER_FILE), "utf8")) as Record<
			string,
			unknown
		>;
		return typeof value.token === "string" && Number.isSafeInteger(value.pid) && Number(value.pid) > 0
			? { token: value.token, pid: Number(value.pid) }
			: undefined;
	} catch {
		return undefined;
	}
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return Boolean(error && typeof error === "object" && "code" in error && error.code !== "ESRCH");
	}
}

function walk(dir: string): string[] {
	const paths: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) paths.push(...walk(path));
		else paths.push(path);
	}
	return paths;
}
