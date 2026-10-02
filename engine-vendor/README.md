Vendored from https://github.com/Galz648/godot-ts-engine commit `96af677a1a5f5bb1af6b740b5e0a225e7b3f566c`.

Copied, not modified except import specifiers so CommonJS `tsc` can emit them:

- `packages/scene/src/index.ts`
- `packages/scene-sync/src/parse.ts`
- `packages/validator/tools/validate-core.ts`
- `packages/validator/tools/classes.ts`
- `packages/validator/tools/scene-node.ts`
- `packages/validator/src/node-types.gen.ts`
- `packages/validator/data/classes.json`

Import edits: `.ts` suffixes removed. `classes.ts` imports `classes.json` without `with { type: "json" }`.
