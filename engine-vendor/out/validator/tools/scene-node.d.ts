import type { SceneNode as SharedSceneNode } from "../../scene/src/index";
import type { NodeType } from "../src/node-types.gen";
export type SceneNode = SharedSceneNode<{
    type: NodeType;
    script: string;
    texture: string;
}>;
export type AnySceneNode = SharedSceneNode;
