// The validator's scene types come from packages/scene. Two views of the same shape:
//  - SceneNode: for AUTHORING a tree. Node classes are the generated NodeType union, so a typo is a TypeScript error.
//  - AnySceneNode: what validate() ACCEPTS. Plain strings, so any tree (from any game) can be passed in; unknown
//    classes are then caught by the validator's own unknown-class rule instead of the compiler.
import type { SceneNode as SharedSceneNode } from "../../scene/src/index";
import type { NodeType } from "../src/node-types.gen";

export type SceneNode = SharedSceneNode<{ type: NodeType; script: string; texture: string }>;
export type AnySceneNode = SharedSceneNode;
