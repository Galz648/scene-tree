"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspacePath = workspacePath;
/** Godot resource paths are project-relative after the res:// prefix. */
function workspacePath(resourcePath) {
    return resourcePath.startsWith("res://") ? resourcePath.slice("res://".length) : resourcePath;
}
//# sourceMappingURL=path.js.map