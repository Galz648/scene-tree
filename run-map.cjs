const fs = require("fs");
const path = require("path");
const { defaultTstogdDirs, dirsFromJson, gdToTs } = require("./out/map");
const { parseTscn } = require("./out/parser");

const rootDir = process.argv[2] ?? path.join(__dirname, "..", "game");
const scenePath = process.argv[3] ?? "scenes/main.tscn";
const configPath = path.join(rootDir, "tstogd.json");
const dirs = fs.existsSync(configPath) ? dirsFromJson(fs.readFileSync(configPath, "utf8")) : defaultTstogdDirs();
const scene = parseTscn(fs.readFileSync(path.join(rootDir, scenePath), "utf8"));

function walk(node, out) {
  if (!node) {
    return;
  }
  if (node.script) {
    out.push(node.script);
  }
  if (node.instance) {
    return;
  }
  for (const child of node.children) {
    walk(child, out);
  }
}

const scripts = [];
walk(scene, scripts);
console.log(`tsDir=${dirs.tsDir || "."} gdDir=${dirs.gdDir || "."}`);
for (const script of scripts) {
  const source = gdToTs(script, dirs);
  const exists = source ? fs.existsSync(path.join(rootDir, source)) : false;
  console.log(`${script} -> ${source ?? "(not under gdDir)"}${source ? (exists ? " exists" : " missing") : ""}`);
}
