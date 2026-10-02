import * as vscode from "vscode";
import { appendNode, attachShape, attachScript, scriptResourceFor, SHAPE_CHOICES } from "./attach";
import { findMissing, type Missing } from "./finder";
import { splitFindings } from "./findings";
import { defaultTstogdDirs, dirsFromJson, gdToTs, type TstogdDirs } from "./map";
import { workspacePath } from "./path";
import { parseTscn, type SceneNode } from "./parser";
import { parseTscn as readEngineScene } from "../engine-vendor/out/scene-sync/src/parse";
import { validate } from "../engine-vendor/out/validator/tools/validate-core";
import { SceneTreeProvider, type GhostRow, type RequiredRow, type SceneRow } from "./tree";

const NODE_TYPES = [
  "Node",
  "Node2D",
  "Sprite2D",
  "CharacterBody2D",
  "CollisionShape2D",
  "Area2D",
  "Label",
  "Timer",
  "AnimationPlayer",
];

let dirs: TstogdDirs = defaultTstogdDirs();
let warned = false;

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

function scriptsOf(node: SceneNode, out: string[]): void {
  if (node.script) {
    out.push(node.script);
  }
  if (node.instance) {
    return;
  }
  for (const child of node.children) {
    scriptsOf(child, out);
  }
}

async function loadDirs(folder: vscode.Uri): Promise<TstogdDirs> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, "tstogd.json"));
    return dirsFromJson(new TextDecoder().decode(bytes));
  } catch {
    return defaultTstogdDirs();
  }
}

function sceneFile(): { folder: vscode.WorkspaceFolder; relative: string; uri: vscode.Uri } | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const relative = vscode.workspace.getConfiguration("sceneTree").get<string>("scenePath");
  if (!folder || !relative) {
    return undefined;
  }
  return { folder, relative, uri: vscode.Uri.joinPath(folder.uri, relative) };
}

/** Prefer the TypeScript tstogd compiles. Fall back to the .gd the scene lists. */
async function scriptText(
  folder: vscode.Uri,
  script: string,
): Promise<{ text: string; fromTs: boolean } | undefined> {
  const source = gdToTs(script, dirs);
  if (source) {
    const text = await readText(vscode.Uri.joinPath(folder, source));
    if (text !== undefined) {
      return { text, fromTs: true };
    }
  }
  const gd = await readText(vscode.Uri.joinPath(folder, workspacePath(script)));
  if (gd === undefined) {
    return undefined;
  }
  return { text: gd, fromTs: false };
}

async function loadScene(provider: SceneTreeProvider): Promise<void> {
  const scene = sceneFile();
  if (!scene) {
    provider.setScene(undefined, []);
    return;
  }
  dirs = await loadDirs(scene.folder.uri);
  const text = await readText(scene.uri);
  const root = text === undefined ? undefined : parseTscn(text);
  if (!root) {
    provider.setScene(undefined, []);
    return;
  }
  const scripts: string[] = [];
  scriptsOf(root, scripts);
  const missingTs: string[] = [];
  const bodies = new Map<string, string>();
  const scannedTs: string[] = [];
  for (const script of scripts) {
    const source = gdToTs(script, dirs);
    const body = await scriptText(scene.folder.uri, script);
    if (source && !(await exists(vscode.Uri.joinPath(scene.folder.uri, source)))) {
      missingTs.push(source);
    }
    if (!body) {
      continue;
    }
    bodies.set(script, body.text);
    if (body.fromTs) {
      scannedTs.push(script);
    }
  }
  const found = findMissing(root, (script) => bodies.get(script));
  let required: ReturnType<typeof splitFindings>["required"] = [];
  let warnings: ReturnType<typeof splitFindings>["warnings"] = [];
  try {
    if (text === undefined) {
      throw new Error("scene text missing");
    }
    const engine = readEngineScene(text);
    const split = splitFindings(validate(engine.root));
    required = split.required;
    warnings = split.warnings;
  } catch {
    required = [];
    warnings = [];
  }
  provider.setScene(root, found.missing, missingTs, scannedTs, dirs, required, warnings);
}

function className(nodeName: string): string {
  const cleaned = nodeName.replace(/[^A-Za-z0-9_]/g, "");
  if (cleaned === "" || /^[0-9]/.test(cleaned)) {
    return "NodeScript";
  }
  return cleaned;
}

async function createTypeScript(node: SceneNode): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder || !node.script) {
    return;
  }
  const source = gdToTs(node.script, dirs);
  if (!source) {
    return;
  }
  const uri = vscode.Uri.joinPath(folder.uri, source);
  if (await exists(uri)) {
    await vscode.window.showTextDocument(uri);
    return;
  }
  const slash = source.lastIndexOf("/");
  if (slash > 0) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, source.slice(0, slash)));
  }
  const name = className(node.name);
  const body = /^[A-Za-z_][A-Za-z0-9_]*$/.test(node.type)
    ? `export class ${name} extends ${node.type} {}\n`
    : `export class ${name} {}\n`;
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(body));
  await vscode.window.showTextDocument(uri);
  void vscode.window.showInformationMessage(`Created ${source}. tstogd still has to emit the .gd.`);
}

async function addScript(node: SceneNode): Promise<void> {
  const scene = sceneFile();
  if (!scene || node.script) {
    return;
  }
  const text = await readText(scene.uri);
  if (text === undefined) {
    return;
  }
  const paths = scriptResourceFor(text, node.name, dirs);
  if (!paths) {
    return;
  }
  noteGodot();
  await writeTypeScript(scene.folder.uri, paths.source, className(node.name), node.type);
  const next = attachScript(text, node.line, paths.resource);
  await vscode.workspace.fs.writeFile(scene.uri, new TextEncoder().encode(next));
  void vscode.window.showInformationMessage(`Created ${paths.source}. tstogd still has to emit the .gd.`);
}

async function addShape(row: SceneRow): Promise<void> {
  const choices = SHAPE_CHOICES[row.node.type];
  if (!choices || row.node.shape) {
    return;
  }
  const pick = await vscode.window.showQuickPick(
    choices.map((choice) => ({ label: choice.type, choice })),
    { placeHolder: "Shape resource" },
  );
  if (!pick) {
    return;
  }
  const scene = sceneFile();
  if (!scene) {
    return;
  }
  const text = await readText(scene.uri);
  if (text === undefined) {
    return;
  }
  noteGodot();
  const parts = row.path.split("/");
  const stem = parts.length > 1 ? parts[parts.length - 2] : row.node.name;
  const next = attachShape(text, row.node.line, pick.choice, stem);
  await vscode.workspace.fs.writeFile(scene.uri, new TextEncoder().encode(next));
  void vscode.window.showInformationMessage(
    `Added a ${pick.choice.type} to ${row.node.name}. Resize it in Godot.`,
  );
}

function noteGodot(): void {
  if (warned) {
    return;
  }
  warned = true;
  void vscode.window.showInformationMessage(
    "If Godot has this scene open, it may overwrite this change. Reload the scene in Godot after editing.",
  );
}

function nodeAt(root: SceneNode, path: string): SceneNode | undefined {
  if (path === ".") {
    return root;
  }
  let current: SceneNode | undefined = root;
  for (const segment of path.split("/")) {
    current = current?.children.find((child) => child.name === segment);
    if (!current || current.instance) {
      return undefined;
    }
  }
  return current;
}

function findAt(root: SceneNode, parentPath: string, name: string): SceneNode | undefined {
  if (parentPath === ".") {
    return root.children.find((child) => child.name === name);
  }
  const parent = nodeAt(root, parentPath);
  return parent?.children.find((child) => child.name === name);
}

async function writeTypeScript(folder: vscode.Uri, source: string, name: string, type: string): Promise<void> {
  const uri = vscode.Uri.joinPath(folder, source);
  if (await exists(uri)) {
    return;
  }
  const slash = source.lastIndexOf("/");
  if (slash > 0) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder, source.slice(0, slash)));
  }
  const body = /^[A-Za-z_][A-Za-z0-9_]*$/.test(type)
    ? `export class ${name} extends ${type} {}\n`
    : `export class ${name} {}\n`;
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(body));
  await vscode.window.showTextDocument(uri);
}

async function createNode(
  missing: Missing,
): Promise<{ name: string; type: string; parent: string; source?: string } | undefined> {
  const pick = await vscode.window.showQuickPick([...NODE_TYPES, "Other..."], {
    placeHolder: "Node type",
  });
  if (!pick) {
    return undefined;
  }
  let type = pick;
  if (pick === "Other...") {
    const typed = await vscode.window.showInputBox({ prompt: "Node type" });
    if (!typed) {
      return undefined;
    }
    type = typed;
  }
  const scene = sceneFile();
  if (!scene) {
    return undefined;
  }
  const text = await readText(scene.uri);
  if (text === undefined) {
    return undefined;
  }
  noteGodot();
  const name = missing.name.replaceAll('"', "");
  const safeType = type.replaceAll('"', "");
  const paths = scriptResourceFor(text, name, dirs);
  if (paths) {
    await writeTypeScript(scene.folder.uri, paths.source, className(name), safeType);
  }
  const next = appendNode(text, {
    name,
    type: safeType,
    parent: missing.parentPath,
    unique: missing.unique,
    script: paths?.resource,
  });
  await vscode.workspace.fs.writeFile(scene.uri, new TextEncoder().encode(next));
  return { name, type: safeType, parent: missing.parentPath, source: paths?.source };
}

async function createRequired(
  row: RequiredRow,
): Promise<{ name: string; type: string; parent: string; shape?: string } | undefined> {
  const typed = await vscode.window.showInputBox({
    prompt: "Node name",
    value: row.ghost.typeName,
  });
  if (!typed) {
    return undefined;
  }
  const type = row.ghost.typeName.replaceAll('"', "");
  const choices = SHAPE_CHOICES[type];
  const pick = choices
    ? await vscode.window.showQuickPick(
        choices.map((choice) => ({ label: choice.type, choice })),
        { placeHolder: "Shape resource" },
      )
    : undefined;
  if (choices && !pick) {
    return undefined;
  }
  const scene = sceneFile();
  if (!scene) {
    return undefined;
  }
  const text = await readText(scene.uri);
  if (text === undefined) {
    return undefined;
  }
  noteGodot();
  const name = typed.replaceAll('"', "");
  let next = appendNode(text, {
    name,
    type,
    parent: row.ghost.parentPath,
    unique: false,
  });
  if (pick) {
    const created = parseTscn(next);
    const node = created && findAt(created, row.ghost.parentPath, name);
    if (node) {
      const parts = row.ghost.parentPath.split("/");
      const stem = row.ghost.parentPath === "." ? name : (parts[parts.length - 1] ?? name);
      next = attachShape(next, node.line, pick.choice, stem);
    }
  }
  await vscode.workspace.fs.writeFile(scene.uri, new TextEncoder().encode(next));
  return { name, type, parent: row.ghost.parentPath, shape: pick?.choice.type };
}

async function markUnique(missing: Missing): Promise<void> {
  const scene = sceneFile();
  if (!scene) {
    return;
  }
  const text = await readText(scene.uri);
  if (text === undefined) {
    return;
  }
  const root = parseTscn(text);
  const node = root && findAt(root, missing.parentPath, missing.name);
  if (!root || !node) {
    return;
  }
  noteGodot();
  const lines = text.split("\n");
  lines.splice(node.line, 0, "unique_name_in_owner = true");
  const next = lines.join("\n");
  await vscode.workspace.fs.writeFile(scene.uri, new TextEncoder().encode(next));
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SceneTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("sceneTree", provider),
    vscode.commands.registerCommand("sceneTree.refresh", () => {
      void loadScene(provider);
    }),
    vscode.commands.registerCommand("sceneTree.createTypeScript", (row: SceneRow) => {
      void createTypeScript(row.node).then(() => loadScene(provider));
    }),
    vscode.commands.registerCommand("sceneTree.addScript", (row: SceneRow) => {
      void addScript(row.node).then(() => loadScene(provider));
    }),
    vscode.commands.registerCommand("sceneTree.addShape", (row: SceneRow) => {
      void addShape(row).then(() => loadScene(provider));
    }),
    vscode.commands.registerCommand("sceneTree.nothingMapped", (message: string) => {
      void vscode.window.showInformationMessage(message);
    }),
    vscode.commands.registerCommand("sceneTree.createNode", (row: GhostRow) => {
      void (async () => {
        const created = await createNode(row.missing);
        await loadScene(provider);
        if (created) {
          const parent = created.parent === "." ? "the root" : created.parent;
          const script = created.source ? ` Wrote ${created.source}. tstogd still has to emit the .gd.` : "";
          void vscode.window.showInformationMessage(
            `Created ${created.name} (${created.type}) under ${parent}.${script}`,
          );
        }
      })();
    }),
    vscode.commands.registerCommand("sceneTree.createRequired", (row: RequiredRow) => {
      void (async () => {
        const created = await createRequired(row);
        await loadScene(provider);
        if (created) {
          const parent = created.parent === "." ? "the root" : created.parent;
          const shape = created.shape ? ` Shape: ${created.shape}.` : "";
          void vscode.window.showInformationMessage(
            `Created ${created.name} (${created.type}) under ${parent}.${shape}`,
          );
        }
      })();
    }),
    vscode.commands.registerCommand("sceneTree.markUnique", (row: GhostRow) => {
      void markUnique(row.missing).then(() => loadScene(provider));
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("sceneTree.scenePath")) {
        void loadScene(provider);
      }
    }),
  );
  void loadScene(provider);
  void vscode.commands.executeCommand("sceneTree.focus");
}

export function deactivate(): void {}
