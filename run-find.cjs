const fs = require("fs");
const path = require("path");
const { parseTscn } = require("./out/parser");
const { findMissing } = require("./out/finder");
const { gdToTs, dirsFromJson, defaultTstogdDirs } = require("./out/map");
const { workspacePath } = require("./out/path");

function projectRoot(start) {
  let dir = path.resolve(start);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    dir = path.dirname(dir);
  }
  for (;;) {
    if (fs.existsSync(path.join(dir, "tstogd.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.dirname(path.resolve(start));
    }
    dir = parent;
  }
}

const scenePath = process.argv[2] ?? path.join(__dirname, "..", "game", "scenes", "main.tscn");
const workspace = projectRoot(scenePath);
const configPath = path.join(workspace, "tstogd.json");
const dirs = fs.existsSync(configPath) ? dirsFromJson(fs.readFileSync(configPath, "utf8")) : defaultTstogdDirs();
const root = parseTscn(fs.readFileSync(scenePath, "utf8"));

function readScript(script) {
  const source = gdToTs(script, dirs);
  if (source) {
    const ts = path.join(workspace, source);
    if (fs.existsSync(ts)) {
      return fs.readFileSync(ts, "utf8");
    }
  }
  const gd = path.join(workspace, workspacePath(script));
  return fs.existsSync(gd) ? fs.readFileSync(gd, "utf8") : undefined;
}

const result = findMissing(root, readScript);
console.log(JSON.stringify(result, null, 2));
