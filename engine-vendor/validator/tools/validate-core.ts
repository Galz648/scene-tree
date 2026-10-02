// Walks a declarative scene tree and returns a list of problems with human-written messages.
// Structural rules are plain functions in the RULES array: to add a rule, add a function.
//
// This file is the pure core: no Node APIs, no import.meta, so the editor plugin can bundle it as CommonJS.
// The command line lives in validate-scene.ts.

import { concreteSubclasses, didYouMean, exists, familyOf, isA, isInstantiable } from "./classes";
import type { AnySceneNode as SceneNode } from "./scene-node";

export type Issue = {
  severity: "error" | "warning";
  rule: string; //    e.g. "body-needs-shape"
  path: string; //    "Ball/Sprite", relative to the root ("." is the root itself)
  message: string; // written for a human, says how to fix it
  node: SceneNode; // the exact object from the input tree, so PoC 4 can find its source position
};

// A rule looks at one node (and its parent) and returns zero or more issues.
// Rules leave `path` empty; validate() fills it in, because only the walk knows where a node is.
export type Rule = (node: SceneNode, parent: SceneNode | null) => Issue[];

const ILLEGAL_NAME_CHARS = [".", ":", "@", "/", '"', "%"];

function issue(severity: Issue["severity"], rule: string, node: SceneNode, message: string): Issue[] {
  return [{ severity, rule, path: "", message, node }];
}

// ---- rules ---------------------------------------------------------------------------------------

const uniqueSiblingNames: Rule = (node, parent) => {
  const siblings = parent?.children ?? [];
  const firstWithName = siblings.findIndex((s) => s.name === node.name);
  if (firstWithName === -1 || firstWithName === siblings.indexOf(node)) return [];
  return issue("error", "unique-sibling-names", node,
    `Another child of "${parent!.name}" is already called "${node.name}". Sibling names must be unique; rename one of them.`);
};

const validName: Rule = (node) => {
  if (typeof node.name !== "string" || node.name === "") {
    return issue("error", "valid-name", node, "This node has an empty name. Give it a name.");
  }
  const bad = ILLEGAL_NAME_CHARS.filter((c) => node.name.includes(c));
  if (bad.length === 0) return [];
  return issue("error", "valid-name", node,
    `The name "${node.name}" contains ${bad.map((c) => `"${c}"`).join(" ")}, which Godot does not allow in node names ` +
    `(not allowed: ${ILLEGAL_NAME_CHARS.join(" ")}). Rename it.`);
};

// The class rules use Godot's class hierarchy (data/classes.json, from tools/gen-classes.ts).
// They report at most one issue per node: an unknown class, else a non-node, else an abstract class.

const unknownClass: Rule = (node) => {
  if (exists(node.type)) return [];
  const guess = didYouMean(node.type);
  return issue("error", "unknown-class", node,
    `"${node.type}" is not a Godot class.` + (guess ? ` Did you mean "${guess}"?` : " Check the spelling of the node type."));
};

const notANode: Rule = (node) => {
  if (!exists(node.type) || isA(node.type, "Node")) return [];
  return issue("error", "not-a-node", node,
    `"${node.type}" is a ${familyOf(node.type)}, not a Node, so it cannot be a node in the scene tree. ` +
    `Resources like this are set as a property of a node instead (for example a shape is the "shape" prop of a CollisionShape2D).`);
};

const notInstantiable: Rule = (node) => {
  if (!exists(node.type) || !isA(node.type, "Node") || isInstantiable(node.type)) return [];
  const concrete = concreteSubclasses(node.type);
  return issue("error", "not-instantiable", node,
    `"${node.type}" is abstract: Godot cannot create one directly.` +
    (concrete.length > 0 ? ` Use a concrete type that extends it, such as ${concrete.slice(0, 3).join(", ")}.` : " Use a concrete subclass of it."));
};

// The three shape rules and the sprite rule use Godot's own configuration-warning wording where Godot has one.
// Godot applies the two body/shape warnings to every CollisionObject2D (AnimatableBody2D, PhysicalBone2D, ...), so we do too.

const isShapeNode = (type: string) => isA(type, "CollisionShape2D") || isA(type, "CollisionPolygon2D");

const bodyNeedsShape: Rule = (node) => {
  if (!isA(node.type, "CollisionObject2D")) return [];
  if ((node.children ?? []).some((c) => isShapeNode(c.type))) return [];
  return issue("warning", "body-needs-shape", node,
    "This node has no shape, so it can't collide or interact with other objects. " +
    "Consider adding a CollisionShape2D or CollisionPolygon2D as a child to define its shape.");
};

const shapeNeedsBody: Rule = (node, parent) => {
  if (!isA(node.type, "CollisionShape2D")) return [];
  if (parent && isA(parent.type, "CollisionObject2D")) return [];
  return issue("warning", "shape-needs-body", node,
    "CollisionShape2D only serves to provide a collision shape to a CollisionObject2D derived node. " +
    "Please only use it as a child of Area2D, StaticBody2D, RigidBody2D, CharacterBody2D, etc. to give them a shape.");
};

const shapeNeedsShapeProp: Rule = (node) => {
  if (!isA(node.type, "CollisionShape2D") || node.props?.shape != null) return [];
  return issue("warning", "shape-needs-shape-prop", node,
    'A shape must be provided for CollisionShape2D to function. Please create a shape resource for it! (Set the "shape" prop.)');
};

// Godot itself shows no configuration warning for this one: it is our rule. It is a warning, not an error, because a script
// can set the texture at runtime (an atlas, a generated image), and that is legitimate.
const spriteNeedsTexture: Rule = (node) => {
  if (node.type !== "Sprite2D" || node.props?.texture != null) return [];
  return issue("warning", "sprite-needs-texture", node,
    'This Sprite2D has no texture, so nothing will be drawn unless a script sets one. Set the "texture" prop if it should show an image.');
};

// Godot ignores script variables on a node that has no script, and says nothing about it.
const scriptPropsNeedScript: Rule = (node) => {
  if (node.script != null || node.scriptProps == null || Object.keys(node.scriptProps).length === 0) return [];
  return issue("warning", "script-props-need-script", node,
    "These script variables are ignored because this node has no script. Set the \"script\" field, or move them to \"props\" if they belong to the node itself.");
};

export const RULES: Rule[] = [
  uniqueSiblingNames, validName, unknownClass, notANode, notInstantiable,
  bodyNeedsShape, shapeNeedsBody, shapeNeedsShapeProp, spriteNeedsTexture, scriptPropsNeedScript,
];

// ---- the walk ------------------------------------------------------------------------------------

// Never throws: a broken tree or a crashing rule becomes an "internal-error" issue instead.
export function validate(root: SceneNode): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<SceneNode>(); // guards against a node that contains itself

  const walk = (node: SceneNode, parent: SceneNode | null, segments: string[]) => {
    if (seen.has(node)) return;
    seen.add(node);
    const path = segments.length === 0 ? "." : segments.join("/");

    for (const rule of RULES) {
      try {
        for (const found of rule(node, parent)) issues.push({ ...found, path });
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        issues.push({ severity: "error", rule: "internal-error", path, node, message: `A validation rule crashed on this node: ${why}` });
      }
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      if (child === null || typeof child !== "object") {
        issues.push({ severity: "error", rule: "internal-error", path, node, message: "children contains something that is not a node." });
        continue;
      }
      const name = typeof child.name === "string" && child.name !== "" ? child.name : "<unnamed>";
      walk(child, node, [...segments, name]);
    }
  };

  if (root === null || typeof root !== "object") {
    return [{ severity: "error", rule: "internal-error", path: ".", node: root, message: "The scene root is not a node object." }];
  }
  walk(root, null, []);
  return issues;
}
