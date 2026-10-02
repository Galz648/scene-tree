/** tstogd writes `{gdDir}/{rel}.gd` from `{tsDir}/{rel}.ts`. Defaults match tstogd: src → scripts. */
export type TstogdDirs = {
  tsDir: string;
  gdDir: string;
};

export function defaultTstogdDirs(): TstogdDirs {
  return { tsDir: "src", gdDir: "scripts" };
}

/** Empty string means the project root. "." and "" both mean that. */
export function normalizeDir(dir: string): string {
  const trimmed = dir.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (trimmed === "" || trimmed === ".") {
    return "";
  }
  return trimmed;
}

export function dirsFromJson(text: string): TstogdDirs {
  const parsed: unknown = JSON.parse(text);
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
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
export function gdToTs(scriptPath: string, dirs: TstogdDirs): string | undefined {
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
