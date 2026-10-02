export interface Vocabulary {
    type: string;
    script: string;
    texture: string;
}
export type SubResource<V extends Vocabulary = Vocabulary> = {
    type: string;
    props?: Record<string, PropValue<V>>;
};
export type PropValue<V extends Vocabulary = Vocabulary> = number | boolean | string | {
    raw: string;
} | {
    ext: V["texture"];
} | {
    sub: SubResource<V>;
};
export type SceneNode<V extends Vocabulary = Vocabulary> = {
    name: string;
    type: V["type"];
    script?: V["script"];
    props?: Record<string, PropValue<V>>;
    scriptProps?: Record<string, PropValue<V>>;
    children?: SceneNode<V>[];
};
