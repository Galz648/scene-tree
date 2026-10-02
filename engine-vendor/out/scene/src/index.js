"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
// Why two property bags: Godot only accepts a script's own variables once the script is attached, so the emitter writes
// `scriptProps` after the `script` line. Written before it, Godot drops them silently (no error). The emitter cannot tell
// the two kinds apart by name, so the tree says which is which.
