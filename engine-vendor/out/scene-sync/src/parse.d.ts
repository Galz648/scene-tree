import type { SceneNode } from "../../scene/src/index";
export type Parsed = {
    root: SceneNode;
    unsupported: string[];
    ignored: string[];
};
export declare function parseTscn(text: string): Parsed;
