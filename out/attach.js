"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHAPE_CHOICES = void 0;
exports.fileStem = fileStem;
exports.scriptResourceFor = scriptResourceFor;
exports.attachShape = attachShape;
exports.attachScript = attachScript;
exports.appendNode = appendNode;
const map_1 = require("./map");
function attr(header, key) {
    const match = header.match(new RegExp(`(?:^|\\s)${key}="([^"]*)"`));
    return match?.[1];
}
/** Trail -> trail, LeftPaddle -> leftPaddle. Matches ball.gd beside a Ball node. */
function fileStem(nodeName) {
    const cleaned = nodeName.replace(/[^A-Za-z0-9_]/g, "");
    if (cleaned === "" || /^[0-9]/.test(cleaned)) {
        return "node";
    }
    return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}
/**
 * New script sits next to the first scene script tstogd can map.
 * res://scripts/ball.gd -> res://scripts/trail.gd and src/scripts/trail.ts.
 */
function scriptResourceFor(sceneText, nodeName, dirs) {
    let dir = "";
    for (const line of sceneText.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("[ext_resource") || attr(trimmed, "type") !== "Script") {
            continue;
        }
        const listed = attr(trimmed, "path");
        if (!listed || !(0, map_1.gdToTs)(listed, dirs)) {
            continue;
        }
        const relative = listed.startsWith("res://") ? listed.slice("res://".length) : listed;
        const slash = relative.lastIndexOf("/");
        dir = slash >= 0 ? relative.slice(0, slash + 1) : "";
        break;
    }
    const resource = `res://${dir}${fileStem(nodeName)}.gd`;
    const source = (0, map_1.gdToTs)(resource, dirs);
    if (!source) {
        return undefined;
    }
    return { resource, source };
}
function bumpLoadSteps(text) {
    return text.replace(/load_steps=(\d+)/, (_match, count) => `load_steps=${Number(count) + 1}`);
}
function ensureScriptResource(text, resource) {
    const lines = text.split("\n");
    const ids = new Set();
    let existing;
    let lastExt = -1;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed.startsWith("[ext_resource")) {
            continue;
        }
        lastExt = i;
        const id = attr(trimmed, "id");
        if (id) {
            ids.add(id);
        }
        if (attr(trimmed, "type") === "Script" && attr(trimmed, "path") === resource && id) {
            existing = id;
        }
    }
    if (existing) {
        return { text, id: existing };
    }
    const stem = fileStem(resource.split("/").pop()?.replace(/\.gd$/, "") ?? "script");
    let id = stem;
    let n = 2;
    while (ids.has(id)) {
        id = `${stem}_${n}`;
        n += 1;
    }
    const at = lastExt >= 0 ? lastExt + 1 : 1;
    lines.splice(at, 0, `[ext_resource type="Script" path="${resource}" id="${id}"]`);
    return { text: bumpLoadSteps(lines.join("\n")), id };
}
/** Defaults are a visible starting size. Godot is where the size gets dragged. */
exports.SHAPE_CHOICES = {
    CollisionShape2D: [
        { type: "CircleShape2D", body: "radius = 16.0" },
        { type: "RectangleShape2D", body: "size = Vector2(32, 32)" },
        { type: "CapsuleShape2D", body: "radius = 16.0\nheight = 32.0" },
    ],
    CollisionShape3D: [
        { type: "SphereShape3D", body: "radius = 0.5" },
        { type: "BoxShape3D", body: "size = Vector3(1, 1, 1)" },
        { type: "CapsuleShape3D", body: "radius = 0.5\nheight = 1.0" },
    ],
};
/**
 * Give a CollisionShape a shape resource.
 * Inserts a sub_resource and `shape = SubResource("id")` under that node.
 */
function attachShape(text, nodeLine, choice, idStem) {
    const lines = text.split("\n");
    const headerIndex = nodeLine - 1;
    const header = lines[headerIndex] ?? "";
    if (!header.trim().startsWith("[node")) {
        return text;
    }
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith("[")) {
            break;
        }
        if (trimmed.startsWith("shape ") || trimmed.startsWith("shape=")) {
            return text;
        }
    }
    const ids = new Set();
    let insertAt = 0;
    let sawResource = false;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith("[node")) {
            if (!sawResource) {
                insertAt = i;
            }
            break;
        }
        if (trimmed.startsWith("[sub_resource") || trimmed.startsWith("[ext_resource")) {
            sawResource = true;
            insertAt = i + 1;
            const id = attr(trimmed, "id");
            if (id) {
                ids.add(id);
            }
        }
    }
    const stem = fileStem(idStem);
    let id = `${choice.type}_${stem}`;
    let n = 2;
    while (ids.has(id)) {
        id = `${choice.type}_${stem}_${n}`;
        n += 1;
    }
    let at = insertAt;
    if ((lines[at] ?? "").trim() === "" && (lines[at + 1] ?? "").trim().startsWith("[node")) {
        at += 1;
    }
    const block = [`[sub_resource type="${choice.type}" id="${id}"]`, ...choice.body.split("\n")];
    if ((lines[at - 1] ?? "").trim() !== "") {
        block.unshift("");
    }
    if ((lines[at] ?? "").trim() !== "") {
        block.push("");
    }
    lines.splice(at, 0, ...block);
    const shifted = headerIndex + block.length;
    lines.splice(shifted + 1, 0, `shape = SubResource("${id}")`);
    return bumpLoadSteps(lines.join("\n"));
}
/** Point an existing node at a script. Inserts the ext_resource and a script line under that node. */
function attachScript(text, nodeLine, resource) {
    const attached = ensureScriptResource(text, resource);
    const inserted = attached.text !== text;
    const lines = attached.text.split("\n");
    const headerIndex = nodeLine - 1 + (inserted ? 1 : 0);
    const header = lines[headerIndex] ?? "";
    if (!header.trim().startsWith("[node")) {
        return attached.text;
    }
    const next = lines[headerIndex + 1]?.trim() ?? "";
    if (next.startsWith("script ") || next.startsWith("script=")) {
        return attached.text;
    }
    lines.splice(headerIndex + 1, 0, `script = ExtResource("${attached.id}")`);
    return lines.join("\n");
}
function appendNode(text, node) {
    let next = text.endsWith("\n") || text.length === 0 ? text : `${text}\n`;
    let scriptId;
    if (node.script) {
        const attached = ensureScriptResource(next, node.script);
        next = attached.text.endsWith("\n") ? attached.text : `${attached.text}\n`;
        scriptId = attached.id;
    }
    next += `[node name="${node.name}" type="${node.type}" parent="${node.parent}"]\n`;
    if (scriptId) {
        next += `script = ExtResource("${scriptId}")\n`;
    }
    if (node.unique) {
        next += "unique_name_in_owner = true\n";
    }
    return next;
}
//# sourceMappingURL=attach.js.map