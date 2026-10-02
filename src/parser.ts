export type SceneNode = {
  name: string;
  type: string;
  script?: string;
  instance?: string;
  /** CollisionShape has a `shape =` line. */
  shape?: boolean;
  unique?: boolean;
  line: number;
  children: SceneNode[];
};

function attr(header: string, key: string): string | undefined {
  const match = header.match(new RegExp(`(?:^|\\s)${key}="([^"]*)"`));
  return match?.[1];
}

function extId(header: string, key: string): string | undefined {
  const match = header.match(new RegExp(`(?:^|\\s)${key}=ExtResource\\("([^"]+)"\\)`));
  return match?.[1];
}

/**
 * Godot parent paths are relative to the root and do not include the root name.
 * "." is the root. "A/B" is the node reached by those names under the root.
 */
export function parseTscn(text: string): SceneNode | undefined {
  const scripts = new Map<string, string>();
  const packedScenes = new Map<string, string>();
  const byPath = new Map<string, SceneNode>();
  let root: SceneNode | undefined;
  let current: SceneNode | undefined;
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const trimmed = lines[i].trim();

    if (trimmed.startsWith("[ext_resource")) {
      current = undefined;
      const id = attr(trimmed, "id");
      const path = attr(trimmed, "path");
      const type = attr(trimmed, "type");
      if (id && path && type === "Script") {
        scripts.set(id, path);
      } else if (id && path && type === "PackedScene") {
        packedScenes.set(id, path);
      }
      continue;
    }

    if (trimmed.startsWith("[node")) {
      const name = attr(trimmed, "name") ?? "";
      const instanceId = extId(trimmed, "instance");
      const node: SceneNode = {
        name,
        type: instanceId ? "" : (attr(trimmed, "type") ?? ""),
        line: lineNo,
        children: [],
      };
      if (instanceId) {
        const scenePath = packedScenes.get(instanceId);
        if (scenePath) {
          node.instance = scenePath;
        }
      }

      const parentAttr = attr(trimmed, "parent");
      if (parentAttr === undefined) {
        root = node;
        byPath.set(".", node);
      } else {
        const parent = byPath.get(parentAttr);
        parent?.children.push(node);
        const path = parentAttr === "." ? name : `${parentAttr}/${name}`;
        byPath.set(path, node);
      }
      current = node;
      continue;
    }

    if (trimmed.startsWith("[")) {
      current = undefined;
      continue;
    }

    if (current && /^unique_name_in_owner\s*=\s*true$/.test(trimmed)) {
      current.unique = true;
    }

    const scriptMatch = trimmed.match(/^script\s*=\s*ExtResource\("([^"]+)"\)/);
    if (current && scriptMatch) {
      const path = scripts.get(scriptMatch[1]);
      if (path) {
        current.script = path;
      }
    }

    if (current && /^shape\s*=/.test(trimmed)) {
      current.shape = true;
    }
  }

  return root;
}
