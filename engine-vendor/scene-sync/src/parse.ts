// Reads a .tscn back into the shared scene type: the first half of "syncing" a scene that both the Godot editor and
// TypeScript write to. Whatever the model cannot hold is listed in `unsupported`, never dropped silently.
import type { PropValue, SceneNode } from "../../scene/src/index";

export type Parsed = { root: SceneNode; unsupported: string[]; ignored: string[] };
type Section = { kind: string; attrs: Record<string, string>; props: [string, string][] };

const ATTR = /([A-Za-z_]+)=("(?:[^"\\]|\\.)*"|\[[^\]]*\]|[A-Za-z_]+\((?:[^()"]|"(?:[^"\\]|\\.)*")*\)|[^\s\]]+)/g;

/** Are all brackets and parentheses closed (outside strings)? A value can continue on the next line until they are. */
function balanced(text: string): boolean {
  let depth = 0, inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (c === "\\") i++; else if (c === '"') inString = false; }
    else if (c === '"') inString = true;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
  }
  return depth <= 0;
}

function sections(text: string): Section[] {
  const out: Section[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const header = /^\[(\w+)(.*)\]\s*$/.exec(lines[i]);
    if (header) {
      const attrs: Record<string, string> = {};
      for (const a of header[2].matchAll(ATTR)) attrs[a[1]] = a[2];
      out.push({ kind: header[1], attrs, props: [] });
      continue;
    }
    const prop = /^([^\s=]+) = (.*)$/.exec(lines[i]);
    if (prop && out.length) {
      let value = prop[2];
      while (!balanced(value) && i + 1 < lines.length) value += "\n" + lines[++i];
      out[out.length - 1].props.push([prop[1], value]);
    }
  }
  return out;
}

const unquote = (s: string | undefined) => (s === undefined ? undefined : (JSON.parse(s) as string));

export function parseTscn(text: string): Parsed {
  const secs = sections(text);
  const unsupported: string[] = [];
  const ignored: string[] = [];
  const ext = new Map<string, { type: string; path: string }>();
  const sub = new Map<string, { type: string; props: Record<string, PropValue> }>();

  for (const s of secs) if (s.kind === "ext_resource") ext.set(unquote(s.attrs.id)!, { type: unquote(s.attrs.type)!, path: unquote(s.attrs.path)! });

  const toValue = (raw: string, where: string): PropValue => {
    const t = raw.trim();
    if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t);
    if (t === "true") return true;
    if (t === "false") return false;
    if (t.startsWith('"')) { try { const v = JSON.parse(t); if (typeof v === "string") return v; } catch { /* not a plain string */ } }
    const e = /^ExtResource\("([^"]+)"\)$/.exec(t);
    if (e) {
      const r = ext.get(e[1]);
      if (r?.type === "Texture2D") return { ext: r.path };
      unsupported.push(`${where}: a ${r?.type ?? "missing"} resource (only textures are modelled)`);
      return { raw: t };
    }
    const s = /^SubResource\("([^"]+)"\)$/.exec(t);
    if (s && sub.get(s[1])) return { sub: { type: sub.get(s[1])!.type, props: sub.get(s[1])!.props } };
    return { raw: t };
  };

  for (const s of secs) {
    if (s.kind !== "sub_resource") continue;
    const props: Record<string, PropValue> = {};
    for (const [k, v] of s.props) props[k] = toValue(v, `sub_resource ${s.attrs.id}.${k}`);
    sub.set(unquote(s.attrs.id)!, { type: unquote(s.attrs.type)!, props });
  }

  const byPath = new Map<string, SceneNode>();
  let root: SceneNode | undefined;
  for (const s of secs) {
    if (s.kind === "gd_scene") { if (s.attrs.uid) ignored.push("scene uid"); continue; }
    if (s.kind === "ext_resource" || s.kind === "sub_resource") continue;
    if (s.kind !== "node") { unsupported.push(`[${s.kind}] section${s.kind === "connection" ? ` (${s.attrs.signal ?? "?"} -> ${s.attrs.method ?? "?"}): signal connections are not modelled` : " is not modelled"}`); continue; }

    const name = unquote(s.attrs.name)!;
    for (const attr of Object.keys(s.attrs)) {
      if (attr === "unique_id") ignored.push("node unique_id");
      else if (!["name", "type", "parent"].includes(attr)) unsupported.push(`node ${name}: attribute "${attr}" (${attr === "instance" ? "instanced scenes" : attr === "groups" ? "groups" : "this attribute"} not modelled)`);
    }
    if (s.attrs.type === undefined) continue; // an instanced scene: already reported above
    const node: SceneNode = { name, type: unquote(s.attrs.type)! };
    let afterScript = false;
    for (const [k, v] of s.props) {
      if (k === "script") {
        const r = /^ExtResource\("([^"]+)"\)$/.exec(v.trim()); const res = r && ext.get(r[1]);
        if (res && res.type === "Script") node.script = res.path; else unsupported.push(`node ${name}: script is not a plain script resource`);
        afterScript = true;
        continue;
      }
      const bag = afterScript ? (node.scriptProps ??= {}) : (node.props ??= {}); // variables after the script line are the script's own
      bag[k] = toValue(v, `node ${name}.${k}`);
    }

    const parent = unquote(s.attrs.parent);
    if (parent === undefined) { root = node; byPath.set(".", node); continue; }
    const parentNode = byPath.get(parent);
    if (!parentNode) { unsupported.push(`node ${name}: parent "${parent}" not found`); continue; }
    (parentNode.children ??= []).push(node);
    byPath.set(parent === "." ? name : `${parent}/${name}`, node);
  }
  if (!root) throw new Error("no root node found");
  return { root, unsupported: [...new Set(unsupported)], ignored: [...new Set(ignored)] };
}
