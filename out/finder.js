"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findMissing = findMissing;
const CALL = /get_node(?:_or_null)?\s*\(([^)]*)\)/g;
function walk(node, path, parentPath, out) {
    out.push({ node, path, parentPath });
    if (node.instance) {
        return;
    }
    for (const child of node.children) {
        const childPath = path === "." ? child.name : `${path}/${child.name}`;
        walk(child, childPath, path, out);
    }
}
function childNamed(node, name) {
    return node.children.find((child) => child.name === name);
}
function sameMissing(a, b) {
    return (a.kind === b.kind &&
        a.name === b.name &&
        a.parentPath === b.parentPath &&
        a.unique === b.unique &&
        a.script === b.script &&
        a.scriptLine === b.scriptLine &&
        a.ref === b.ref);
}
function sameUnsupported(a, b) {
    return a.script === b.script && a.scriptLine === b.scriptLine && a.ref === b.ref;
}
/**
 * String literals passed to get_node / get_node_or_null.
 * "%" names are scene-wide. "A" and "A/B" are relative to the script node.
 * Other shapes are listed in `unsupported` and do not become ghosts.
 */
function findMissing(root, readScript) {
    const located = [];
    walk(root, ".", "", located);
    const missing = [];
    const unsupported = [];
    function addMissing(entry) {
        if (!missing.some((existing) => sameMissing(existing, entry))) {
            missing.push(entry);
        }
    }
    function addUnsupported(entry) {
        if (!unsupported.some((existing) => sameUnsupported(existing, entry))) {
            unsupported.push(entry);
        }
    }
    for (const { node, path } of located) {
        if (!node.script || node.instance) {
            continue;
        }
        const text = readScript(node.script);
        if (text === undefined) {
            continue;
        }
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const scriptLine = i + 1;
            CALL.lastIndex = 0;
            let match;
            while ((match = CALL.exec(lines[i])) !== null) {
                const arg = match[1].trim();
                const literal = arg.match(/^"([^"]*)"$/) ?? arg.match(/^'([^']*)'$/);
                const ref = match[0];
                if (!literal) {
                    addUnsupported({ script: node.script, scriptLine, ref });
                    continue;
                }
                resolveLiteral(node, path, literal[1], node.script, scriptLine, ref);
            }
        }
    }
    function resolveLiteral(owner, ownerPath, value, script, scriptLine, ref) {
        if (value.startsWith("%") && !value.includes("/")) {
            const name = value.slice(1);
            if (!name) {
                addUnsupported({ script, scriptLine, ref });
                return;
            }
            const named = located.filter((entry) => entry.node.name === name);
            if (named.some((entry) => entry.node.unique)) {
                return;
            }
            if (named.length === 0) {
                addMissing({
                    kind: "missing",
                    name,
                    parentPath: ".",
                    unique: true,
                    script,
                    scriptLine,
                    ref,
                });
                return;
            }
            addMissing({
                kind: "notUnique",
                name,
                parentPath: named[0].parentPath,
                unique: true,
                script,
                scriptLine,
                ref,
            });
            return;
        }
        if (value.startsWith("%") ||
            value.startsWith("/") ||
            value.startsWith("$") ||
            value.includes("..") ||
            value === "") {
            addUnsupported({ script, scriptLine, ref });
            return;
        }
        const segments = value.split("/");
        if (segments.some((segment) => segment === "")) {
            addUnsupported({ script, scriptLine, ref });
            return;
        }
        let current = owner;
        let currentPath = ownerPath;
        for (const segment of segments) {
            if (current.instance) {
                addUnsupported({ script, scriptLine, ref });
                return;
            }
            const next = childNamed(current, segment);
            if (!next) {
                addMissing({
                    kind: "missing",
                    name: segment,
                    parentPath: currentPath,
                    unique: false,
                    script,
                    scriptLine,
                    ref,
                });
                return;
            }
            if (next.instance) {
                addUnsupported({ script, scriptLine, ref });
                return;
            }
            current = next;
            currentPath = currentPath === "." ? next.name : `${currentPath}/${next.name}`;
        }
    }
    return { missing, unsupported };
}
//# sourceMappingURL=finder.js.map