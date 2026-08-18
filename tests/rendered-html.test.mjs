import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const cssUrl = new URL("../app/globals.css", import.meta.url);
const releaseUrl = new URL("../release/sichuan-ghost-mahjong/index.html", import.meta.url);

test("builds a self-contained playable release", async () => {
  const html = await readFile(releaseUrl, "utf8");

  assert.match(html, /<title>四川・鬼面局（離線版）<\/title>/);
  assert.match(html, /四川・鬼面局/);
  assert.match(html, /offline-download/);
  assert.match(html, /sichuan-ghost-mahjong-offline\.zip/);
  assert.match(html, /cockatoo-sou1\.png/);
  assert.match(html, /mahjong-tile-base-v2\.png/);
  assert.match(html, /ghost-mask\.png/);
  assert.match(html, /\.suo-1 \.tile-art/);

  await access(new URL("../release/sichuan-ghost-mahjong/.nojekyll", import.meta.url));
});

test("keeps the ghost trigger and roulette timing rules", async () => {
  const source = await readFile(pageUrl, "utf8");
  const activateA = source.slice(
    source.indexOf("const activateA"),
    source.indexOf("const activateS"),
  );

  assert.match(source, /window\.setTimeout\(resolve, 3000\)/);
  assert.match(activateA, /kind === "ghost-mask"/);
  assert.equal((activateA.match(/triggerGhostEffect\(next\)/g) ?? []).length, 1);
});

test("includes the cockatoo one-bamboo pair and excludes flower tiles", async () => {
  const [source, css, tileFiles] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readdir(new URL("../public/tiles/", import.meta.url)),
  ]);

  assert.match(source, /guaranteedSouOne/);
  assert.match(source, /tile\.kind === "suo-1"/);
  assert.match(css, /\.suo-1 \.tile-art/);
  assert.match(css, /background-color:\s*#0d5543/);
  assert.match(css, /mahjong-tile-base-v2\.png/);
  assert.equal(tileFiles.filter((name) => name.endsWith(".svg")).length, 34);
  assert.equal(tileFiles.some((name) => /^Flower-/i.test(name)), false);
  await access(new URL("../public/art/mahjong-tile-base-v2.png", import.meta.url));
});
