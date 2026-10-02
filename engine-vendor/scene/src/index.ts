// The one scene-tree type shared by every package. Types only: no runtime code, nothing to import at runtime.
//
// A scene node is plain data. The only thing that varies between users is the "vocabulary": which node classes,
// script paths and texture paths a tree is allowed to name. By default they are plain strings. A game narrows them
// with its own generated types, for example:
//
//   type GameNode = SceneNode<{ type: NodeType; script: ScriptPath; texture: TexturePath }>;
//
// A narrower tree can always be passed where the plain-string version is expected, so the validator and the
// emitter both take `SceneNode` (plain strings) and accept every game's narrower trees.

export interface Vocabulary {
  type: string; //    Godot class name, e.g. "CharacterBody2D"
  script: string; //  res:// path of a .gd file
  texture: string; // res:// path of an image
}

export type SubResource<V extends Vocabulary = Vocabulary> = {
  type: string; // Resource class, e.g. "RectangleShape2D"
  props?: Record<string, PropValue<V>>;
};

export type PropValue<V extends Vocabulary = Vocabulary> =
  | number
  | boolean
  | string //                    written quoted:  "Hello"
  | { raw: string } //           written as is:   Vector2(10, 20)
  | { ext: V["texture"] } //     written as:      ExtResource("2_ball")
  | { sub: SubResource<V> }; //  written as:      SubResource("RectangleShape2D_1")

export type SceneNode<V extends Vocabulary = Vocabulary> = {
  name: string;
  type: V["type"];
  script?: V["script"];
  props?: Record<string, PropValue<V>>; //        properties of the Godot node itself: position, offset_left, text ...
  scriptProps?: Record<string, PropValue<V>>; //  values for variables the node's SCRIPT declares (@exports): is_player, speed ...
  children?: SceneNode<V>[];
};

// Why two property bags: Godot only accepts a script's own variables once the script is attached, so the emitter writes
// `scriptProps` after the `script` line. Written before it, Godot drops them silently (no error). The emitter cannot tell
// the two kinds apart by name, so the tree says which is which.
