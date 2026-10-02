"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const attach_1 = require("./attach");
const finder_1 = require("./finder");
const findings_1 = require("./findings");
const map_1 = require("./map");
const path_1 = require("./path");
const parser_1 = require("./parser");
const parse_1 = require("../engine-vendor/out/scene-sync/src/parse");
const validate_core_1 = require("../engine-vendor/out/validator/tools/validate-core");
const tree_1 = require("./tree");
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
let dirs = (0, map_1.defaultTstogdDirs)();
let warned = false;
async function exists(uri) {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    }
    catch {
        return false;
    }
}
async function readText(uri) {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return new TextDecoder().decode(bytes);
    }
    catch {
        return undefined;
    }
}
function scriptsOf(node, out) {
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
async function loadDirs(folder) {
    try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, "tstogd.json"));
        return (0, map_1.dirsFromJson)(new TextDecoder().decode(bytes));
    }
    catch {
        return (0, map_1.defaultTstogdDirs)();
    }
}
function sceneFile() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const relative = vscode.workspace.getConfiguration("sceneTree").get("scenePath");
    if (!folder || !relative) {
        return undefined;
    }
    return { folder, relative, uri: vscode.Uri.joinPath(folder.uri, relative) };
}
/** Prefer the TypeScript tstogd compiles. Fall back to the .gd the scene lists. */
async function scriptText(folder, script) {
    const source = (0, map_1.gdToTs)(script, dirs);
    if (source) {
        const text = await readText(vscode.Uri.joinPath(folder, source));
        if (text !== undefined) {
            return { text, fromTs: true };
        }
    }
    const gd = await readText(vscode.Uri.joinPath(folder, (0, path_1.workspacePath)(script)));
    if (gd === undefined) {
        return undefined;
    }
    return { text: gd, fromTs: false };
}
async function loadScene(provider) {
    const scene = sceneFile();
    if (!scene) {
        provider.setScene(undefined, []);
        return;
    }
    dirs = await loadDirs(scene.folder.uri);
    const text = await readText(scene.uri);
    const root = text === undefined ? undefined : (0, parser_1.parseTscn)(text);
    if (!root) {
        provider.setScene(undefined, []);
        return;
    }
    const scripts = [];
    scriptsOf(root, scripts);
    const missingTs = [];
    const bodies = new Map();
    const scannedTs = [];
    for (const script of scripts) {
        const source = (0, map_1.gdToTs)(script, dirs);
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
    const found = (0, finder_1.findMissing)(root, (script) => bodies.get(script));
    let required = [];
    let warnings = [];
    try {
        if (text === undefined) {
            throw new Error("scene text missing");
        }
        const engine = (0, parse_1.parseTscn)(text);
        const split = (0, findings_1.splitFindings)((0, validate_core_1.validate)(engine.root));
        required = split.required;
        warnings = split.warnings;
    }
    catch {
        required = [];
        warnings = [];
    }
    provider.setScene(root, found.missing, missingTs, scannedTs, dirs, required, warnings);
}
function className(nodeName) {
    const cleaned = nodeName.replace(/[^A-Za-z0-9_]/g, "");
    if (cleaned === "" || /^[0-9]/.test(cleaned)) {
        return "NodeScript";
    }
    return cleaned;
}
async function createTypeScript(node) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder || !node.script) {
        return;
    }
    const source = (0, map_1.gdToTs)(node.script, dirs);
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
async function addScript(node) {
    const scene = sceneFile();
    if (!scene || node.script) {
        return;
    }
    const text = await readText(scene.uri);
    if (text === undefined) {
        return;
    }
    const paths = (0, attach_1.scriptResourceFor)(text, node.name, dirs);
    if (!paths) {
        return;
    }
    noteGodot();
    await writeTypeScript(scene.folder.uri, paths.source, className(node.name), node.type);
    const next = (0, attach_1.attachScript)(text, node.line, paths.resource);
    await vscode.workspace.fs.writeFile(scene.uri, new TextEncoder().encode(next));
    void vscode.window.showInformationMessage(`Created ${paths.source}. tstogd still has to emit the .gd.`);
}
async function addShape(row) {
    const choices = attach_1.SHAPE_CHOICES[row.node.type];
    if (!choices || row.node.shape) {
        return;
    }
    const pick = await vscode.window.showQuickPick(choices.map((choice) => ({ label: choice.type, choice })), { placeHolder: "Shape resource" });
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
    const next = (0, attach_1.attachShape)(text, row.node.line, pick.choice, stem);
    await vscode.workspace.fs.writeFile(scene.uri, new TextEncoder().encode(next));
    void vscode.window.showInformationMessage(`Added a ${pick.choice.type} to ${row.node.name}. Resize it in Godot.`);
}
function noteGodot() {
    if (warned) {
        return;
    }
    warned = true;
    void vscode.window.showInformationMessage("If Godot has this scene open, it may overwrite this change. Reload the scene in Godot after editing.");
}
function nodeAt(root, path) {
    if (path === ".") {
        return root;
    }
    let current = root;
    for (const segment of path.split("/")) {
        current = current?.children.find((child) => child.name === segment);
        if (!current || current.instance) {
            return undefined;
        }
    }
    return current;
}
function findAt(root, parentPath, name) {
    if (parentPath === ".") {
        return root.children.find((child) => child.name === name);
    }
    const parent = nodeAt(root, parentPath);
    return parent?.children.find((child) => child.name === name);
}
async function writeTypeScript(folder, source, name, type) {
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
async function createNode(missing) {
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
    const paths = (0, attach_1.scriptResourceFor)(text, name, dirs);
    if (paths) {
        await writeTypeScript(scene.folder.uri, paths.source, className(name), safeType);
    }
    const next = (0, attach_1.appendNode)(text, {
        name,
        type: safeType,
        parent: missing.parentPath,
        unique: missing.unique,
        script: paths?.resource,
    });
    await vscode.workspace.fs.writeFile(scene.uri, new TextEncoder().encode(next));
    return { name, type: safeType, parent: missing.parentPath, source: paths?.source };
}
async function createRequired(row) {
    const typed = await vscode.window.showInputBox({
        prompt: "Node name",
        value: row.ghost.typeName,
    });
    if (!typed) {
        return undefined;
    }
    const type = row.ghost.typeName.replaceAll('"', "");
    const choices = attach_1.SHAPE_CHOICES[type];
    const pick = choices
        ? await vscode.window.showQuickPick(choices.map((choice) => ({ label: choice.type, choice })), { placeHolder: "Shape resource" })
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
    let next = (0, attach_1.appendNode)(text, {
        name,
        type,
        parent: row.ghost.parentPath,
        unique: false,
    });
    if (pick) {
        const created = (0, parser_1.parseTscn)(next);
        const node = created && findAt(created, row.ghost.parentPath, name);
        if (node) {
            const parts = row.ghost.parentPath.split("/");
            const stem = row.ghost.parentPath === "." ? name : (parts[parts.length - 1] ?? name);
            next = (0, attach_1.attachShape)(next, node.line, pick.choice, stem);
        }
    }
    await vscode.workspace.fs.writeFile(scene.uri, new TextEncoder().encode(next));
    return { name, type, parent: row.ghost.parentPath, shape: pick?.choice.type };
}
async function markUnique(missing) {
    const scene = sceneFile();
    if (!scene) {
        return;
    }
    const text = await readText(scene.uri);
    if (text === undefined) {
        return;
    }
    const root = (0, parser_1.parseTscn)(text);
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
function activate(context) {
    const provider = new tree_1.SceneTreeProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider("sceneTree", provider), vscode.commands.registerCommand("sceneTree.refresh", () => {
        void loadScene(provider);
    }), vscode.commands.registerCommand("sceneTree.createTypeScript", (row) => {
        void createTypeScript(row.node).then(() => loadScene(provider));
    }), vscode.commands.registerCommand("sceneTree.addScript", (row) => {
        void addScript(row.node).then(() => loadScene(provider));
    }), vscode.commands.registerCommand("sceneTree.addShape", (row) => {
        void addShape(row).then(() => loadScene(provider));
    }), vscode.commands.registerCommand("sceneTree.nothingMapped", (message) => {
        void vscode.window.showInformationMessage(message);
    }), vscode.commands.registerCommand("sceneTree.createNode", (row) => {
        void (async () => {
            const created = await createNode(row.missing);
            await loadScene(provider);
            if (created) {
                const parent = created.parent === "." ? "the root" : created.parent;
                const script = created.source ? ` Wrote ${created.source}. tstogd still has to emit the .gd.` : "";
                void vscode.window.showInformationMessage(`Created ${created.name} (${created.type}) under ${parent}.${script}`);
            }
        })();
    }), vscode.commands.registerCommand("sceneTree.createRequired", (row) => {
        void (async () => {
            const created = await createRequired(row);
            await loadScene(provider);
            if (created) {
                const parent = created.parent === "." ? "the root" : created.parent;
                const shape = created.shape ? ` Shape: ${created.shape}.` : "";
                void vscode.window.showInformationMessage(`Created ${created.name} (${created.type}) under ${parent}.${shape}`);
            }
        })();
    }), vscode.commands.registerCommand("sceneTree.markUnique", (row) => {
        void markUnique(row.missing).then(() => loadScene(provider));
    }), vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("sceneTree.scenePath")) {
            void loadScene(provider);
        }
    }));
    void loadScene(provider);
    void vscode.commands.executeCommand("sceneTree.focus");
}
function deactivate() { }
//# sourceMappingURL=extension.js.map