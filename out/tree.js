"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SceneTreeProvider = void 0;
const vscode = require("vscode");
const map_1 = require("./map");
const path_1 = require("./path");
const SHAPE_TYPES = new Set([
    "CollisionShape2D",
    "CollisionPolygon2D",
    "CollisionShape3D",
    "CollisionPolygon3D",
]);
function fileName(path) {
    const parts = path.split("/");
    return parts[parts.length - 1] ?? path;
}
class SceneTreeProvider {
    change = new vscode.EventEmitter();
    onDidChangeTreeData = this.change.event;
    root;
    missing = [];
    missingTs = new Set();
    /** Scene script paths whose get_node lines were read from the .ts file. */
    scannedTs = new Set();
    required = [];
    warnings = [];
    dirs = (0, map_1.defaultTstogdDirs)();
    setScene(root, missing, missingTs = [], scannedTs = [], dirs, required = [], warnings = []) {
        this.root = root;
        this.missing = missing;
        this.missingTs = new Set(missingTs);
        this.scannedTs = new Set(scannedTs);
        this.required = required;
        this.warnings = warnings;
        if (dirs) {
            this.dirs = dirs;
        }
        this.change.fire(undefined);
    }
    getTreeItem(row) {
        if (row.kind === "ghost") {
            return this.ghostItem(row.missing);
        }
        if (row.kind === "required") {
            return this.requiredItem(row.ghost);
        }
        return this.sceneItem(row);
    }
    getChildren(row) {
        if (!row) {
            return this.root ? [{ kind: "scene", node: this.root, path: "." }] : [];
        }
        if (row.kind !== "scene" || row.node.instance) {
            return [];
        }
        const children = row.node.children.map((node) => ({
            kind: "scene",
            node,
            path: row.path === "." ? node.name : `${row.path}/${node.name}`,
        }));
        for (const missing of this.missing) {
            if (missing.parentPath === row.path) {
                children.push({ kind: "ghost", missing });
            }
        }
        for (const ghost of this.required) {
            if (ghost.parentPath === row.path) {
                children.push({ kind: "required", ghost });
            }
        }
        return children;
    }
    sourceOf(script) {
        return (0, map_1.gdToTs)(script, this.dirs);
    }
    sceneItem(row) {
        const node = row.node;
        const ghosts = this.missing.some((missing) => missing.parentPath === row.path) ||
            this.required.some((ghost) => ghost.parentPath === row.path);
        const notes = this.warnings.filter((warning) => warning.path === row.path);
        const item = new vscode.TreeItem(node.name, node.instance || (node.children.length === 0 && !ghosts)
            ? vscode.TreeItemCollapsibleState.None
            : vscode.TreeItemCollapsibleState.Expanded);
        const source = node.script ? this.sourceOf(node.script) : undefined;
        const needsTs = source !== undefined && this.missingTs.has(source);
        item.description = needsTs ? `create ${fileName(source)}` : node.instance ? fileName(node.instance) : node.type;
        const tip = [...notes.map((warning) => warning.message), source ?? node.script].filter((line) => line !== undefined && line !== "");
        item.tooltip = tip.length > 0 ? tip.join("\n") : item.description;
        const needsShape = (node.type === "CollisionShape2D" || node.type === "CollisionShape3D") && !node.shape;
        const canHaveScript = !node.instance && !SHAPE_TYPES.has(node.type);
        if (notes.some((warning) => warning.severity === "error")) {
            item.iconPath = new vscode.ThemeIcon("error");
        }
        else if (notes.length > 0 || needsShape) {
            item.iconPath = new vscode.ThemeIcon("warning");
        }
        else if (node.script && canHaveScript && !needsTs) {
            item.iconPath = new vscode.ThemeIcon("file-code");
        }
        const warningText = notes.map((warning) => warning.message).join("\n");
        if (needsTs) {
            item.contextValue = "missingTs";
            item.iconPath = new vscode.ThemeIcon("warning");
            item.command = {
                command: "sceneTree.nothingMapped",
                title: "No TypeScript file",
                arguments: [`${node.name} has no TypeScript file yet.`],
            };
        }
        else if (needsShape) {
            item.contextValue = "addShape";
            item.description = "add shape";
            item.command = {
                command: "sceneTree.nothingMapped",
                title: "Needs a shape",
                arguments: [warningText || `${node.name} needs a shape.`],
            };
        }
        else if (!node.script && canHaveScript) {
            item.contextValue = "addScript";
            item.description = "add script";
            item.command = {
                command: "sceneTree.nothingMapped",
                title: "No script",
                arguments: [`${node.name} has no script.`],
            };
        }
        else if (!source && warningText) {
            item.command = {
                command: "sceneTree.nothingMapped",
                title: "Scene warning",
                arguments: [warningText],
            };
        }
        else if (!source && !SHAPE_TYPES.has(node.type)) {
            item.command = {
                command: "sceneTree.nothingMapped",
                title: "No script",
                arguments: [`${node.name} has no script.`],
            };
        }
        else if (source) {
            const folder = vscode.workspace.workspaceFolders?.[0];
            if (folder) {
                item.command = {
                    command: "vscode.open",
                    title: "Open Script",
                    arguments: [vscode.Uri.joinPath(folder.uri, source)],
                };
            }
        }
        return item;
    }
    requiredItem(ghost) {
        const item = new vscode.TreeItem(ghost.typeName, vscode.TreeItemCollapsibleState.None);
        item.description = `required by ${ghost.ownerType}: ${ghost.message}`;
        item.iconPath = new vscode.ThemeIcon("warning");
        item.contextValue = "required";
        item.tooltip = ghost.message;
        return item;
    }
    ghostItem(missing) {
        const item = new vscode.TreeItem(missing.name, vscode.TreeItemCollapsibleState.None);
        const openPath = this.openPath(missing);
        const where = `${fileName(openPath)}:${missing.scriptLine}`;
        item.description = missing.kind === "missing" ? `missing, ${where}` : `not marked unique, ${where}`;
        item.iconPath = new vscode.ThemeIcon("warning");
        item.contextValue = missing.kind === "missing" ? "missing" : "notUnique";
        item.tooltip = missing.ref;
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder) {
            const line = Math.max(missing.scriptLine - 1, 0);
            const position = new vscode.Position(line, 0);
            item.command = {
                command: "vscode.open",
                title: "Open Script",
                arguments: [
                    vscode.Uri.joinPath(folder.uri, openPath),
                    { selection: new vscode.Range(position, position) },
                ],
            };
        }
        return item;
    }
    openPath(missing) {
        const source = this.sourceOf(missing.script);
        if (source && this.scannedTs.has(missing.script)) {
            return source;
        }
        return (0, path_1.workspacePath)(missing.script);
    }
}
exports.SceneTreeProvider = SceneTreeProvider;
//# sourceMappingURL=tree.js.map