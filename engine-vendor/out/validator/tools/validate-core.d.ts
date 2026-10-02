import type { AnySceneNode as SceneNode } from "./scene-node";
export type Issue = {
    severity: "error" | "warning";
    rule: string;
    path: string;
    message: string;
    node: SceneNode;
};
export type Rule = (node: SceneNode, parent: SceneNode | null) => Issue[];
export declare const RULES: Rule[];
export declare function validate(root: SceneNode): Issue[];
