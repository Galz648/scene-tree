const fs = require("fs");
const path = require("path");
const { parseTscn } = require("./engine-vendor/out/scene-sync/src/parse");
const { validate } = require("./engine-vendor/out/validator/tools/validate-core");

const file = process.argv[2] ?? path.join(__dirname, "sample-workspace", "arena.tscn");
const text = fs.readFileSync(file, "utf8");
const { root } = parseTscn(text);
const issues = validate(root).map((issue) => ({
  severity: issue.severity,
  rule: issue.rule,
  path: issue.path,
  type: issue.node && issue.node.type,
  message: issue.message,
}));
console.log(JSON.stringify(issues, null, 2));
