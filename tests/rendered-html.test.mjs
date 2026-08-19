import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const cssUrl = new URL("../app/globals.css", import.meta.url);
const releaseUrl = new URL("../release/sichuan-ghost-mahjong/index.html", import.meta.url);

test("builds a self-contained playable release", async () => {
  const html = await readFile(releaseUrl, "utf8");

  assert.match(html, /<title>四川省-蔡小白<\/title>/);
  assert.match(html, /四川省-蔡小白/);
  assert.doesNotMatch(html, /SICHUAN MAHJONG/);
  assert.doesNotMatch(html, /離線版/);
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

test("moves directional ghost effects without reshuffling the tiles", async () => {
  const source = await readFile(pageUrl, "utf8");
  const movement = source.slice(
    source.indexOf("function moveTilesToward"),
    source.indexOf("function splitRemaining"),
  );
  const ghostEffects = source.slice(
    source.indexOf("function applyGhostEffect"),
    source.indexOf("function shuffleOccupied"),
  );

  assert.doesNotMatch(movement, /shuffled\(/);
  assert.match(movement, /pattern === "up" \|\| pattern === "down"/);
  assert.match(movement, /pattern === "left" \|\| pattern === "right"/);
  assert.match(movement, /distanceFromCenter/);
  assert.match(ghostEffects, /moveTilesToward\(board, pattern, boardRows, boardCols\)/);
  assert.match(ghostEffects, /effect === "smile"[\s\S]*arrangeVeryEasy/);
  assert.match(ghostEffects, /effect === "angry"[\s\S]*buildBoard/);
  assert.match(ghostEffects, /effect === "horizontal"[\s\S]*splitRemaining/);
  assert.match(ghostEffects, /effect === "vertical"[\s\S]*splitRemaining/);
});

test("moves inward and outward effects to radial slots without changing the tiles", async () => {
  const source = await readFile(pageUrl, "utf8");
  const slotSource = source.slice(
    source.indexOf("function innerBoardSlots"),
    source.indexOf("function initialBoardSlots"),
  );
  const movementSource = source.slice(
    source.indexOf("function distanceFromCenter"),
    source.indexOf("function splitRemaining"),
  );
  const executable = ts.transpileModule(
    `const BOARD_MARGIN = 1; type Tile = { uid: string }; ${slotSource}\n${movementSource}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const moveTilesToward = Function(`${executable}\nreturn moveTilesToward;`)();
  const rows = 9;
  const cols = 11;
  const board = Array(rows * cols).fill(null);
  const sources = [12, 16, 20, 35, 41, 56, 63, 74, 84, 86];
  sources.forEach((index, uid) => { board[index] = { uid: String(uid) }; });
  const distance = (index) => Math.abs(Math.floor(index / cols) - (rows - 1) / 2) + Math.abs(index % cols - (cols - 1) / 2);
  const innerSlots = Array.from({ length: rows * cols }, (_, index) => index).filter((index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return row >= 1 && row < rows - 1 && col >= 1 && col < cols - 1;
  });
  const occupied = (next) => next.flatMap((tile, index) => tile ? [index] : []);
  const identities = (next) => next.filter(Boolean).map((tile) => tile.uid).sort();
  const expectedIn = [...innerSlots].sort((a, b) => distance(a) - distance(b) || a - b).slice(0, sources.length).sort((a, b) => a - b);
  const expectedOut = [...innerSlots].sort((a, b) => distance(b) - distance(a) || a - b).slice(0, sources.length).sort((a, b) => a - b);

  const inward = moveTilesToward(board, "in", rows, cols);
  const outward = moveTilesToward(board, "out", rows, cols);
  assert.deepEqual(occupied(inward), expectedIn);
  assert.deepEqual(occupied(outward), expectedOut);
  assert.deepEqual(identities(inward), identities(board));
  assert.deepEqual(identities(outward), identities(board));
});

test("includes the cockatoo one-bamboo pair and excludes flower tiles", async () => {
  const [source, css, tileFiles] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(cssUrl, "utf8"),
    readdir(new URL("../public/tiles/", import.meta.url)),
  ]);

  assert.match(source, /guaranteedSouOne/);
  assert.match(source, /normalKinds\.flatMap\(\(base\) => \[base, base\]\)/);
  assert.match(source, /normalPairPool\.splice/);
  assert.match(source, /slice\(0, normalPairCount - 1\)/);
  assert.doesNotMatch(source, /normalKinds\[Math\.floor\(random\(\) \* normalKinds\.length\)\]/);
  assert.match(source, /effect === "angry"[\s\S]*buildBoard\(level, difficultyId\)/);
  assert.doesNotMatch(source, /buildBoard\(level, difficultyId, false\)/);
  assert.match(source, /tile\.kind === "suo-1"/);
  assert.doesNotMatch(source, /tile-fallback/);
  assert.doesNotMatch(css, /tile-fallback/);
  assert.match(css, /\.suo-1 \.tile-art/);
  assert.match(css, /background-color:\s*#0d5543/);
  assert.match(css, /mahjong-tile-base-v2\.png/);
  assert.equal(tileFiles.filter((name) => name.endsWith(".svg")).length, 34);
  assert.equal(tileFiles.some((name) => /^Flower-/i.test(name)), false);
  await access(new URL("../public/art/mahjong-tile-base-v2.png", import.meta.url));
});

test("uses the familiar seven-dot layout and clear segmented bamboo", async () => {
  const [sevenDots, twoBamboo, sevenBamboo, eightBamboo, nineBamboo, oneCharacter] = await Promise.all([
    readFile(new URL("../public/tiles/Pin7.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/tiles/Sou2.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/tiles/Sou7.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/tiles/Sou8.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/tiles/Sou9.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/tiles/Man1.svg", import.meta.url), "utf8"),
  ]);

  assert.equal((sevenDots.match(/<circle r="15"/g) ?? []).length, 7);
  assert.match(sevenDots, /translate\(48 48\)/);
  assert.match(sevenDots, /translate\(80 79\)/);
  assert.match(sevenDots, /translate\(112 110\)/);
  assert.equal((sevenBamboo.match(/M-9-20Q0-24 9-20/g) ?? []).length, 7);
  assert.doesNotMatch(sevenBamboo, /<rect x="-7"/);
  assert.match(twoBamboo, /translate\(80 76\)/);
  assert.match(twoBamboo, /translate\(80 148\)/);
  assert.equal((eightBamboo.match(/M-9-20Q0-24 9-20/g) ?? []).length, 8);
  assert.match(eightBamboo, /rotate\(45\)/);
  assert.match(eightBamboo, /rotate\(-45\)/);
  assert.equal((eightBamboo.match(/fill="#15568a"/g) ?? []).length, 0);
  assert.equal((nineBamboo.match(/fill="#b52227"/g) ?? []).length, 9);
  assert.match(oneCharacter, /font-size="58"[\s\S]*font-size="58"/);
});

test("offers scored board-size difficulties and lightweight match effects", async () => {
  const [source, css] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(source, /id: "casual"[\s\S]*rows: 6, cols: 8[\s\S]*multiplier: 0\.8/);
  assert.match(source, /id: "beginner"[\s\S]*rows: 8, cols: 10[\s\S]*multiplier: 1/);
  assert.match(source, /id: "standard"[\s\S]*rows: 8, cols: 12[\s\S]*multiplier: 1\.35/);
  assert.match(source, /id: "expert"[\s\S]*rows: 10, cols: 14[\s\S]*multiplier: 1\.75/);
  assert.match(source, /difficulty: DifficultyId/);
  assert.match(source, /className="match-path-core"/);
  assert.match(source, /const path = findMatchPath\(board, selected, index, boardRows, boardCols\)/);
  assert.match(source, /const GAME_VERSION = "1\.1\.4"/);
  assert.match(source, /className="menu-version">版本 v\{GAME_VERSION\}/);
  assert.match(source, /className="menu-seal" role="img" aria-label="一索鸚鵡"/);
  assert.match(css, /\.tile\.selected::after/);
  assert.match(css, /@keyframes tile-match/);
  assert.match(css, /@keyframes path-draw/);
  assert.match(css, /prefers-reduced-motion/);
});

test("backs up progress and rankings and supports immediate score settlement", async () => {
  const [source, css] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(cssUrl, "utf8"),
  ]);

  assert.match(source, /format: "sichuan-ghost-mahjong-record"/);
  assert.match(source, /progress: SaveData \| null/);
  assert.match(source, /rankings: Ranking\[\]/);
  assert.match(source, /匯出遊戲紀錄/);
  assert.match(source, /匯入遊戲紀錄/);
  assert.match(source, /本局已結算：剩餘秒數不計入分數/);
  assert.match(source, /className="text-button settle-button"/);
  assert.match(css, /\.record-transfer/);
  assert.match(css, /\.settle-button/);
  assert.match(source, /const START_TIME = 240/);
  assert.match(source, /const BOARD_MARGIN = 1/);
  assert.match(source, /const GHOST_GAP = 1/);
  assert.match(source, /row === centerRow/);
  assert.match(source, /col === centerCol/);
  assert.doesNotMatch(source, /setTimeout\(enterNextLevel/);
  assert.match(source, /準備好再繼續/);
  assert.match(source, /showNewGameSetup/);
  assert.match(source, /選擇新遊戲難度/);
  assert.match(source, /讀取進度會沿用存檔原本的難度/);
  assert.match(css, /\.new-game-card/);
  assert.match(source, /showDataTools/);
  assert.match(source, /資料與下載/);
  assert.match(source, /entry\.difficulty \? difficultyById\(entry\.difficulty\)\.label : "\?"/);
  assert.match(css, /\.data-tools-card/);
  assert.match(source, /occupiedBoardOffset/);
  assert.match(source, /compactBoard/);
  assert.doesNotMatch(source, /compactOrder/);
  assert.match(source, /const compactCols = boardCols - BOARD_MARGIN \* 2/);
  assert.match(source, /row < boardRows - BOARD_MARGIN/);
  assert.match(source, /col < boardCols - BOARD_MARGIN/);
  assert.match(source, /const visualRows = compactBoard \? boardRows - BOARD_MARGIN \* 2 : boardRows/);
  assert.match(source, /compactBoard \? <button type="button" className="tile tile-placeholder" disabled/);
  assert.match(css, /\.tile-placeholder \{[^}]*visibility: hidden/);
  assert.match(source, /remaining >= previousRemainingRef\.current/);
  assert.match(source, /point\.row - BOARD_MARGIN/);
  assert.match(source, /point\.col - BOARD_MARGIN/);
  assert.match(source, /matchMedia\("\(max-width: 620px\)"\)/);
  assert.match(css, /translate: var\(--cell-offset-x,0\) var\(--cell-offset-y,0\)/);
  assert.match(css, /\.tile-suo:not\(\.suo-1\) \.tile-art/);
});
