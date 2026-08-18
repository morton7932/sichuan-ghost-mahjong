import ts from "typescript";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { createRequire } from "node:module";

const project = process.cwd();
const releaseRoot = join(project, "release", "sichuan-ghost-mahjong");

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });

const nodeRequire = createRequire(import.meta.url);
const virtualEntry = join(project, "app", "offline-entry.js");
const virtualPage = join(project, "app", "page.js");
const transpile = (source, fileName) => ts.transpileModule(source, {
  fileName,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;

const virtualModules = new Map([
  [virtualEntry, transpile(await readFile(join(project, "app", "offline-entry.tsx"), "utf8"), "offline-entry.tsx")],
  [virtualPage, transpile(await readFile(join(project, "app", "page.tsx"), "utf8"), "page.tsx")],
]);
const modules = new Map();

function resolveModule(specifier, importer) {
  if (importer === virtualEntry && specifier === "./page") return virtualPage;
  return nodeRequire.resolve(specifier, { paths: [dirname(importer), project] });
}

async function collect(id) {
  if (modules.has(id)) return;
  let code = virtualModules.get(id);
  if (code === undefined) {
    const raw = await readFile(id, "utf8");
    code = extname(id) === ".json" ? `module.exports=${raw};` : raw;
  }
  const dependencies = {};
  modules.set(id, { code, dependencies });
  const matches = [...code.matchAll(/require\((['"])([^'"]+)\1\)/g)];
  for (const match of matches) {
    const specifier = match[2];
    const dependency = resolveModule(specifier, id);
    dependencies[specifier] = dependency;
    await collect(dependency);
  }
}

await collect(virtualEntry);
const moduleDefinitions = [...modules].map(([id, value]) => {
  const safeCode = value.code.replaceAll("</script", "<\\/script");
  return `${JSON.stringify(id)}:[function(module,exports,require){\n${safeCode}\n},${JSON.stringify(value.dependencies)}]`;
}).join(",\n");
const js = `(function(){"use strict";var process={env:{NODE_ENV:"production"}};var D={${moduleDefinitions}},C={};function R(id){if(C[id])return C[id].exports;var row=D[id];if(!row)throw new Error("Missing module: "+id);var module=C[id]={exports:{}};function local(spec){return R(row[1][spec])}row[0](module,module.exports,local);return module.exports}R(${JSON.stringify(virtualEntry)});})();`;

const css = (await readFile(join(project, "app", "globals.css"), "utf8"))
  .replace(/^@import\s+"tailwindcss";\s*/m, "")
  .replaceAll('url("/art/', 'url("./art/');
const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#074536"><title>四川・鬼面局（離線版）</title><style>${css}</style></head>
<body><div id="root"></div><script>${js}</script></body></html>`;

await writeFile(join(releaseRoot, "index.html"), html);
await writeFile(join(releaseRoot, ".nojekyll"), "");
await cp(join(project, "public", "tiles"), join(releaseRoot, "tiles"), { recursive: true });
await cp(join(project, "public", "art"), join(releaseRoot, "art"), { recursive: true });
await writeFile(join(releaseRoot, "使用說明.txt"), "四川・鬼面局 離線版\r\n\r\n1. 解壓縮整個資料夾。\r\n2. 雙擊 index.html 即可遊玩。\r\n3. 存檔與排行榜只保存在開啟遊戲的瀏覽器 localStorage。\r\n4. 請保留 tiles 與 art 資料夾在 index.html 旁邊。\r\n", "utf8");
console.log(`Offline release created at ${releaseRoot}`);
