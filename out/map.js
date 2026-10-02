"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultTstogdDirs = defaultTstogdDirs;
exports.normalizeDir = normalizeDir;
exports.dirsFromJson = dirsFromJson;
exports.gdToTs = gdToTs;
function defaultTstogdDirs() {
    return { tsDir: "src", gdDir: "scripts" };
}
/** Empty string means the project root. "." and "" both mean that. */
function normalizeDir(dir) {
    const trimmed = dir.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (trimmed === "" || trimmed === ".") {
        return "";
    }
    return trimmed;
}
function dirsFromJson(text) {
    const parsed = JSON.parse(text);
    const record = parsed && typeof parsed === "object" ? parsed : {};
    const fallback = defaultTstogdDirs();
    return {
        tsDir: typeof record.tsDir === "string" ? record.tsDir : fallback.tsDir,
        gdDir: typeof record.gdDir === "string" ? record.gdDir : fallback.gdDir,
    };
}
/**
 * Scene script `res://…` back to the TypeScript file tstogd compiled.
 * Returns undefined when the .gd path is not under gdDir.
 */
function gdToTs(scriptPath, dirs) {
    let relative = scriptPath.startsWith("res://") ? scriptPath.slice("res://".length) : scriptPath;
    relative = relative.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!relative.endsWith(".gd")) {
        return undefined;
    }
    const gdDir = normalizeDir(dirs.gdDir);
    let rest = relative;
    if (gdDir) {
        const prefix = `${gdDir}/`;
        if (!relative.startsWith(prefix)) {
            return undefined;
        }
        rest = relative.slice(prefix.length);
    }
    const source = `${rest.slice(0, -3)}.ts`;
    const tsDir = normalizeDir(dirs.tsDir);
    return tsDir ? `${tsDir}/${source}` : source;
}
//# sourceMappingURL=map.js.map