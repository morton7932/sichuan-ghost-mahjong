"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

const START_TIME = 240;
const GAME_VERSION = "1.4.1";
const BOARD_MARGIN = 1;
const GHOST_GAP = 1;

type DifficultyId = "casual" | "beginner" | "standard" | "expert";
type Difficulty = {
  id: DifficultyId;
  label: string;
  rows: number;
  cols: number;
  multiplier: number;
  detail: string;
};

const DIFFICULTIES: Difficulty[] = [
  { id: "casual", label: "輕鬆", rows: 6, cols: 8, multiplier: 0.8, detail: "最初版本的小型牌桌" },
  { id: "beginner", label: "入門", rows: 8, cols: 10, multiplier: 1, detail: "較寬鬆的完整牌桌" },
  { id: "standard", label: "標準", rows: 8, cols: 12, multiplier: 1.35, detail: "牌量增加、路線更密" },
  { id: "expert", label: "挑戰", rows: 10, cols: 14, multiplier: 1.75, detail: "桌機向的大型牌局" },
];
const DEFAULT_DIFFICULTY: DifficultyId = "standard";

function difficultyById(id: DifficultyId): Difficulty {
  return DIFFICULTIES.find((difficulty) => difficulty.id === id) ?? DIFFICULTIES[2];
}

function boardDimensions(rows: number, cols: number) {
  const extraSpace = BOARD_MARGIN * 2 + GHOST_GAP;
  return { rows: rows + extraSpace, cols: cols + extraSpace };
}

function innerBoardSlots(rows: number, cols: number): number[] {
  const slots: number[] = [];
  for (let row = BOARD_MARGIN; row < rows - BOARD_MARGIN; row += 1) {
    for (let col = BOARD_MARGIN; col < cols - BOARD_MARGIN; col += 1) {
      slots.push(row * cols + col);
    }
  }
  return slots;
}

function initialBoardSlots(tileRows: number, tileCols: number): number[] {
  const { cols: boardCols } = boardDimensions(tileRows, tileCols);
  const slots: number[] = [];
  for (let row = 0; row < tileRows; row += 1) {
    for (let col = 0; col < tileCols; col += 1) {
      slots.push((row + BOARD_MARGIN) * boardCols + col + BOARD_MARGIN);
    }
  }
  return slots;
}

function occupiedBoardOffset(board: (Tile | null)[], rows: number, cols: number): PathPoint {
  const positions = board.flatMap((tile, index) => tile ? [index] : []);
  if (positions.length === 0) return { row: 0, col: 0 };
  const occupiedRows = positions.map((index) => Math.floor(index / cols));
  const occupiedCols = positions.map((index) => index % cols);
  const minRow = Math.min(...occupiedRows), maxRow = Math.max(...occupiedRows);
  const minCol = Math.min(...occupiedCols), maxCol = Math.max(...occupiedCols);
  return {
    row: (rows - 1 - minRow - maxRow) / 2,
    col: (cols - 1 - minCol - maxCol) / 2,
  };
}

function isDifficultyId(value: unknown): value is DifficultyId {
  return DIFFICULTIES.some((difficulty) => difficulty.id === value);
}

type TileGroup = "wan" | "tong" | "suo" | "wind" | "dragon" | "ghost";
type Tile = {
  uid: string;
  kind: string;
  face: string;
  corner: string;
  group: TileGroup;
};
type Phase = "playing" | "ghost" | "levelup" | "over";
type Screen = "menu" | "game" | "leaderboard" | "exit";
type GhostEffectId = "smile" | "angry" | "up" | "down" | "left" | "right" | "in" | "out" | "horizontal" | "vertical";
type GhostDraw = {
  sourceBoard: (Tile | null)[];
  selectedIndex: number;
  activeIndex: number;
  stage: "spinning" | "result";
};
type PathPoint = { row: number; col: number };
type MatchEffect = {
  indexes: [number, number];
  path: PathPoint[];
  diagonal: boolean;
};
type MatchReward = {
  seconds: number;
  distanceBonus: number;
  crossedTiles: number;
  crossedBonus: number;
  bonusPoints: number;
};
type SaveData = {
  version: 2;
  playerName: string;
  difficulty: DifficultyId;
  level: number;
  clearedLevels: number;
  time: number;
  score: number;
  savedAt: string;
};
type Ranking = Omit<SaveData, "difficulty"> & { difficulty: DifficultyId | null; finishedAt: string };
type GameRecordFile = {
  format: "sichuan-ghost-mahjong-record";
  version: 1;
  exportedAt: string;
  progress: SaveData | null;
  rankings: Ranking[];
};
type RecordNotice = { tone: "success" | "error"; text: string };
type AudioSettings = { music: boolean; sound: boolean; musicVolume: number; soundVolume: number };
type DisplayMode = "standard" | "fit";
type SoundEffectName = "click" | "select" | "reject" | "match" | "bonus" | "cheat" | "tick" | "ghost" | "reveal" | "level" | "gameover";

const SAVE_KEY = "sichuan-ghost-save-v1";
const RANKING_KEY = "sichuan-ghost-ranking-v1";
const RECORD_FORMAT = "sichuan-ghost-mahjong-record";
const AUDIO_SETTINGS_KEY = "sichuan-ghost-audio-v1";
const DISPLAY_SETTINGS_KEY = "sichuan-ghost-display-v1";
const DEFAULT_MUSIC_VOLUME = 85;
const DEFAULT_SOUND_VOLUME = 100;

// 原創五聲音階短句，以 Web Audio 即時合成；不載入任何第三方音樂或音效檔。
const BGM_NOTES = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
const BGM_BASS = [130.81, 146.83, 164.81, 146.83];
let sharedAudioContext: AudioContext | null = null;
let backgroundMusicTimer: number | null = null;
let backgroundMusicStep = 0;
let musicVolumeLevel = DEFAULT_MUSIC_VOLUME;
let soundVolumeLevel = DEFAULT_SOUND_VOLUME;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  sharedAudioContext ??= new AudioContext({ latencyHint: "interactive" });
  if (sharedAudioContext.state === "suspended") void sharedAudioContext.resume().catch(() => undefined);
  return sharedAudioContext;
}

function scheduleTone(frequency: number, duration: number, volume: number, type: OscillatorType = "sine", delay = 0, channel: "music" | "sound" = "sound") {
  const context = ensureAudioContext();
  if (!context) return;
  const channelVolume = channel === "music" ? musicVolumeLevel : soundVolumeLevel;
  const adjustedVolume = Math.max(0.0001, volume * channelVolume / 100);
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(adjustedVolume, start + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playSoundEffect(name: SoundEffectName) {
  if (name === "click") scheduleTone(440, 0.045, 0.018, "sine");
  if (name === "select") scheduleTone(560, 0.07, 0.025, "sine");
  if (name === "reject") scheduleTone(145, 0.14, 0.03, "sawtooth");
  if (name === "match" || name === "bonus") {
    scheduleTone(659.25, 0.16, 0.035, "sine");
    scheduleTone(name === "bonus" ? 987.77 : 783.99, 0.2, 0.032, "sine", 0.08);
    if (name === "bonus") scheduleTone(1318.51, 0.24, 0.025, "sine", 0.17);
  }
  if (name === "cheat") {
    scheduleTone(196, 0.16, 0.03, "triangle");
    scheduleTone(392, 0.22, 0.028, "triangle", 0.09);
  }
  if (name === "tick") scheduleTone(740, 0.035, 0.012, "square");
  if (name === "ghost") {
    scheduleTone(98, 0.46, 0.035, "sawtooth");
    scheduleTone(147, 0.42, 0.022, "triangle", 0.08);
  }
  if (name === "reveal") {
    scheduleTone(220, 0.25, 0.035, "triangle");
    scheduleTone(440, 0.36, 0.035, "sine", 0.11);
  }
  if (name === "level") [523.25, 659.25, 783.99].forEach((note, index) => scheduleTone(note, 0.28, 0.032, "sine", index * 0.1));
  if (name === "gameover") [293.66, 246.94, 196].forEach((note, index) => scheduleTone(note, 0.34, 0.028, "triangle", index * 0.14));
}

function playBackgroundMusicStep() {
  const noteIndex = backgroundMusicStep % BGM_NOTES.length;
  scheduleTone(BGM_NOTES[noteIndex], 0.38, 0.028, "sine", 0, "music");
  if (noteIndex % 4 === 0) scheduleTone(BGM_BASS[Math.floor(backgroundMusicStep / 4) % BGM_BASS.length], 0.72, 0.018, "triangle", 0, "music");
  backgroundMusicStep += 1;
}

function startBackgroundMusic() {
  if (backgroundMusicTimer !== null || !ensureAudioContext()) return;
  playBackgroundMusicStep();
  backgroundMusicTimer = window.setInterval(playBackgroundMusicStep, 620);
}

function stopBackgroundMusic() {
  if (backgroundMusicTimer === null) return;
  window.clearInterval(backgroundMusicTimer);
  backgroundMusicTimer = null;
}

function readAudioSettings(): AudioSettings {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_KEY) ?? "null") as Partial<AudioSettings> | null;
    return {
      music: parsed?.music !== false,
      sound: parsed?.sound !== false,
      musicVolume: normalizeVolume(parsed?.musicVolume, DEFAULT_MUSIC_VOLUME),
      soundVolume: normalizeVolume(parsed?.soundVolume, DEFAULT_SOUND_VOLUME),
    };
  } catch {
    return { music: true, sound: true, musicVolume: DEFAULT_MUSIC_VOLUME, soundVolume: DEFAULT_SOUND_VOLUME };
  }
}

function writeAudioSettings(settings: AudioSettings) {
  try { window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 儲存停用時仍可調整本次音訊 */ }
}

function normalizeVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : fallback;
}

function readDisplayMode(): DisplayMode {
  try { return window.localStorage.getItem(DISPLAY_SETTINGS_KEY) === "fit" ? "fit" : "standard"; }
  catch { return "standard"; }
}

function writeDisplayMode(mode: DisplayMode) {
  try { window.localStorage.setItem(DISPLAY_SETTINGS_KEY, mode); } catch { /* 顯示設定無法儲存時仍套用本次選擇 */ }
}

const numerals = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const normalKinds: Omit<Tile, "uid">[] = [
  ...numerals.map((n, i) => ({ kind: `wan-${i + 1}`, face: n, corner: "萬", group: "wan" as const })),
  ...numerals.map((n, i) => ({ kind: `tong-${i + 1}`, face: `${i + 1}`, corner: "筒", group: "tong" as const })),
  ...numerals.map((n, i) => ({ kind: `suo-${i + 1}`, face: `${i + 1}`, corner: "索", group: "suo" as const })),
  ...["東", "南", "西", "北"].map((n) => ({ kind: `wind-${n}`, face: n, corner: "風", group: "wind" as const })),
  { kind: "dragon-red", face: "中", corner: "紅", group: "dragon" },
  { kind: "dragon-green", face: "發", corner: "青", group: "dragon" },
  { kind: "dragon-white", face: "白", corner: "板", group: "dragon" },
];

const ghostKind: Omit<Tile, "uid"> = { kind: "ghost-mask", face: "鬼", corner: "鬼", group: "ghost" };
const TILE_ASSET_ROOT = "./tiles";

function tileAsset(tile: Tile): string | null {
  const [, value] = tile.kind.split("-");
  if (tile.group === "wan") return `${TILE_ASSET_ROOT}/Man${value}.svg`;
  if (tile.group === "tong") return `${TILE_ASSET_ROOT}/Pin${value}.svg`;
  if (tile.kind === "suo-1") return "./art/cockatoo-sou1.png";
  if (tile.group === "suo") return `${TILE_ASSET_ROOT}/Sou${value}.svg`;
  if (tile.kind === "wind-東") return `${TILE_ASSET_ROOT}/Ton.svg`;
  if (tile.kind === "wind-南") return `${TILE_ASSET_ROOT}/Nan.svg`;
  if (tile.kind === "wind-西") return `${TILE_ASSET_ROOT}/Shaa.svg`;
  if (tile.kind === "wind-北") return `${TILE_ASSET_ROOT}/Pei.svg`;
  if (tile.kind === "dragon-red") return `${TILE_ASSET_ROOT}/Chun.svg`;
  if (tile.kind === "dragon-green") return `${TILE_ASSET_ROOT}/Hatsu.svg`;
  if (tile.kind === "dragon-white") return `${TILE_ASSET_ROOT}/Haku.svg`;
  return null;
}
const GHOST_EFFECTS: { id: GhostEffectId; label: string; detail: string; symbol: string }[] = [
  { id: "smile", label: "笑臉", detail: "牌局變容易", symbol: "◡" },
  { id: "angry", label: "生氣", detail: "滿盤重生", symbol: "︿" },
  { id: "up", label: "向上", detail: "向上集中", symbol: "↑" },
  { id: "down", label: "向下", detail: "向下集中", symbol: "↓" },
  { id: "left", label: "向左", detail: "向左集中", symbol: "←" },
  { id: "right", label: "向右", detail: "向右集中", symbol: "→" },
  { id: "in", label: "向內", detail: "中央集中", symbol: "◎" },
  { id: "out", label: "向外", detail: "四周擴散", symbol: "◇" },
  { id: "horizontal", label: "上下", detail: "上下分邊", symbol: "↕" },
  { id: "vertical", label: "左右", detail: "左右分邊", symbol: "↔" },
];

function drawGhostEffectIndex(): number {
  return Math.floor(Math.random() * GHOST_EFFECTS.length);
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffled<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeTile(base: Omit<Tile, "uid">, suffix: string, random = Math.random): Tile {
  return { ...base, uid: `${base.kind}-${suffix}-${random().toString(36).slice(2, 8)}` };
}

function buildBoard(level: number, difficultyId: DifficultyId, random = Math.random): (Tile | null)[] {
  const { rows, cols } = difficultyById(difficultyId);
  const pairCount = rows * cols / 2;
  const bases: Omit<Tile, "uid">[] = [];
  const normalPairCount = pairCount - 2;
  const guaranteedSouOne = normalKinds.find((tile) => tile.kind === "suo-1")!;
  const normalPairPool = normalKinds.flatMap((base) => [base, base]);
  normalPairPool.splice(normalPairPool.findIndex((base) => base.kind === guaranteedSouOne.kind), 1);
  bases.push(guaranteedSouOne, ...shuffled(normalPairPool, random).slice(0, normalPairCount - 1));
  bases.push(ghostKind, ghostKind);
  const ordered = shuffled(bases, random);
  const anchor = ordered[0];
  const remaining = shuffled(ordered.slice(1).flatMap((base, pairIndex) => [
    makeTile(base, `${level}-a-${pairIndex + 1}`, random),
    makeTile(base, `${level}-b-${pairIndex + 1}`, random),
  ]), random);
  const tiles = [
    makeTile(anchor, `${level}-anchor-a`, random),
    makeTile(anchor, `${level}-anchor-b`, random),
    ...remaining,
  ];
  const { rows: boardRows, cols: boardCols } = boardDimensions(rows, cols);
  const result: (Tile | null)[] = Array(boardRows * boardCols).fill(null);
  initialBoardSlots(rows, cols).forEach((slot, index) => { result[slot] = tiles[index]; });
  return result;
}

function isDiagonalMatch(a: number, b: number, cols: number): boolean {
  const ar = Math.floor(a / cols);
  const ac = a % cols;
  const br = Math.floor(b / cols);
  const bc = b % cols;
  const dr = br - ar;
  const dc = bc - ac;
  // 本作的特色規則：只要兩張相同牌位於同一條 45° 斜線，
  // 即使斜線中間還有其他牌，也可以直接遠距對消。
  return Math.abs(dr) === Math.abs(dc) && dr !== 0;
}

function calculateMatchReward(board: (Tile | null)[], a: number, b: number, cols: number): MatchReward {
  const ar = Math.floor(a / cols);
  const ac = a % cols;
  const br = Math.floor(b / cols);
  const bc = b % cols;
  const rowDistance = Math.abs(br - ar);
  const colDistance = Math.abs(bc - ac);
  const distance = Math.max(rowDistance, colDistance);
  const distanceBonus = distance >= 7 ? 3 : distance >= 5 ? 2 : distance >= 3 ? 1 : 0;
  let crossedTiles = 0;

  if (isDiagonalMatch(a, b, cols)) {
    const rowStep = Math.sign(br - ar);
    const colStep = Math.sign(bc - ac);
    for (let step = 1; step < distance; step += 1) {
      const between = (ar + rowStep * step) * cols + ac + colStep * step;
      if (board[between]) crossedTiles += 1;
    }
  }

  const crossedBonus = Math.min(crossedTiles, 3);
  const bonusSeconds = distanceBonus + crossedBonus;
  return {
    seconds: 4 + bonusSeconds,
    distanceBonus,
    crossedTiles,
    crossedBonus,
    bonusPoints: bonusSeconds * 25,
  };
}

function compressPath(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;
  const result = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const firstDirection = [current[0] - previous[0], current[1] - previous[1]];
    const secondDirection = [next[0] - current[0], next[1] - current[1]];
    if (firstDirection[0] !== secondDirection[0] || firstDirection[1] !== secondDirection[1]) result.push(current);
  }
  result.push(points[points.length - 1]);
  return result;
}

function findTwoTurnPath(board: (Tile | null)[], a: number, b: number, rows: number, cols: number): PathPoint[] | null {
  const height = rows + 2;
  const width = cols + 2;
  const start: [number, number] = [Math.floor(a / cols) + 1, a % cols + 1];
  const end: [number, number] = [Math.floor(b / cols) + 1, b % cols + 1];
  const blocked = (r: number, c: number) => {
    if (r === 0 || c === 0 || r === height - 1 || c === width - 1) return false;
    const index = (r - 1) * cols + (c - 1);
    return index !== a && index !== b && board[index] !== null;
  };
  const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  const seen = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => [3, 3, 3, 3]),
  );
  const queue: { r: number; c: number; dir: number; turns: number; previous: number }[] = [];

  directions.forEach(([dr, dc], dir) => {
    const nr = start[0] + dr;
    const nc = start[1] + dc;
    if (nr >= 0 && nr < height && nc >= 0 && nc < width && !blocked(nr, nc)) {
      seen[nr][nc][dir] = 0;
      queue.push({ r: nr, c: nc, dir, turns: 0, previous: -1 });
    }
  });

  for (let head = 0; head < queue.length; head += 1) {
    const { r, c, dir, turns } = queue[head];
    if (r === end[0] && c === end[1]) {
      const cells: [number, number][] = [];
      let cursor = head;
      while (cursor >= 0) {
        const item = queue[cursor];
        cells.push([item.r, item.c]);
        cursor = item.previous;
      }
      cells.push(start);
      return compressPath(cells.reverse()).map(([pathRow, pathCol]) => ({ row: pathRow - 0.5, col: pathCol - 0.5 }));
    }
    directions.forEach(([dr, dc], nextDir) => {
      const nextTurns = turns + (nextDir === dir ? 0 : 1);
      const nr = r + dr;
      const nc = c + dc;
      if (
        nextTurns <= 2 && nr >= 0 && nr < height && nc >= 0 && nc < width &&
        !blocked(nr, nc) && seen[nr][nc][nextDir] > nextTurns
      ) {
        seen[nr][nc][nextDir] = nextTurns;
        queue.push({ r: nr, c: nc, dir: nextDir, turns: nextTurns, previous: head });
      }
    });
  }
  return null;
}

function findMatchPath(board: (Tile | null)[], a: number, b: number, rows: number, cols: number): PathPoint[] | null {
  const first = board[a];
  const second = board[b];
  if (!first || !second || first.kind !== second.kind || a === b) return null;
  if (isDiagonalMatch(a, b, cols)) {
    return [
      { row: Math.floor(a / cols) + 0.5, col: a % cols + 0.5 },
      { row: Math.floor(b / cols) + 0.5, col: b % cols + 0.5 },
    ];
  }
  return findTwoTurnPath(board, a, b, rows, cols);
}

function canMatch(board: (Tile | null)[], a: number, b: number, rows: number, cols: number): boolean {
  return findMatchPath(board, a, b, rows, cols) !== null;
}

function groupPairIndexes(board: (Tile | null)[], excludeGhosts = false): number[][] {
  const groups = new Map<string, number[]>();
  board.forEach((tile, index) => {
    if (!tile || (excludeGhosts && tile.group === "ghost")) return;
    const list = groups.get(tile.kind) ?? [];
    list.push(index);
    groups.set(tile.kind, list);
  });
  const pairs: number[][] = [];
  groups.forEach((indexes) => {
    for (let i = 0; i + 1 < indexes.length; i += 2) pairs.push([indexes[i], indexes[i + 1]]);
  });
  return pairs;
}

function hasMove(board: (Tile | null)[], rows: number, cols: number): boolean {
  const groups = new Map<string, number[]>();
  board.forEach((tile, index) => {
    if (!tile) return;
    groups.set(tile.kind, [...(groups.get(tile.kind) ?? []), index]);
  });
  for (const indexes of groups.values()) {
    for (let i = 0; i < indexes.length; i += 1) {
      for (let j = i + 1; j < indexes.length; j += 1) {
        if (canMatch(board, indexes[i], indexes[j], rows, cols)) return true;
      }
    }
  }
  return false;
}

function arrangeEasy(board: (Tile | null)[], rows: number, cols: number): (Tile | null)[] {
  const pairs = groupPairIndexes(board);
  const result: (Tile | null)[] = Array(rows * cols).fill(null);
  const slots = innerBoardSlots(rows, cols);
  let cursor = 0;
  pairs.forEach(([a, b]) => {
    while (slots[cursor] % cols === cols - BOARD_MARGIN - 1) cursor += 1;
    result[slots[cursor]] = board[a];
    result[slots[cursor + 1]] = board[b];
    cursor += 2;
  });
  return result;
}

function arrangeVeryEasy(board: (Tile | null)[], rows: number, cols: number): (Tile | null)[] {
  const pairs = shuffled(groupPairIndexes(board));
  const result: (Tile | null)[] = Array(rows * cols).fill(null);
  const obviousPairCount = Math.ceil(pairs.length * 0.62);
  const used = new Set<number>();
  const slots = innerBoardSlots(rows, cols);
  let cursor = 0;

  pairs.slice(0, obviousPairCount).forEach(([a, b]) => {
    while (slots[cursor] % cols === cols - BOARD_MARGIN - 1 || used.has(slots[cursor]) || used.has(slots[cursor + 1])) cursor += 1;
    result[slots[cursor]] = board[a];
    result[slots[cursor + 1]] = board[b];
    used.add(slots[cursor]);
    used.add(slots[cursor + 1]);
    cursor += 2;
  });

  const remainingTiles = shuffled(
    pairs.slice(obviousPairCount).flatMap(([a, b]) => [board[a]!, board[b]!]),
  );
  const remainingSlots = shuffled(
    slots.filter((index) => !used.has(index)),
  );
  remainingTiles.forEach((tile, index) => { result[remainingSlots[index]] = tile; });
  return hasMove(result, rows, cols) ? result : arrangeEasy(result, rows, cols);
}

function distanceFromCenter(index: number, rows: number, cols: number): number {
  const row = Math.floor(index / cols);
  const col = index % cols;
  return Math.abs(row - (rows - 1) / 2) + Math.abs(col - (cols - 1) / 2);
}

function moveTilesToward(board: (Tile | null)[], pattern: "up" | "down" | "left" | "right" | "in" | "out", rows: number, cols: number): (Tile | null)[] {
  const result: (Tile | null)[] = Array(rows * cols).fill(null);

  if (pattern === "up" || pattern === "down") {
    for (let col = BOARD_MARGIN; col < cols - BOARD_MARGIN; col += 1) {
      const sources: number[] = [];
      for (let row = BOARD_MARGIN; row < rows - BOARD_MARGIN; row += 1) {
        const index = row * cols + col;
        if (board[index]) sources.push(index);
      }
      const firstTargetRow = pattern === "up" ? BOARD_MARGIN : rows - BOARD_MARGIN - sources.length;
      sources.forEach((source, offset) => { result[(firstTargetRow + offset) * cols + col] = board[source]; });
    }
    return result;
  }

  if (pattern === "left" || pattern === "right") {
    for (let row = BOARD_MARGIN; row < rows - BOARD_MARGIN; row += 1) {
      const sources: number[] = [];
      for (let col = BOARD_MARGIN; col < cols - BOARD_MARGIN; col += 1) {
        const index = row * cols + col;
        if (board[index]) sources.push(index);
      }
      const firstTargetCol = pattern === "left" ? BOARD_MARGIN : cols - BOARD_MARGIN - sources.length;
      sources.forEach((source, offset) => { result[row * cols + firstTargetCol + offset] = board[source]; });
    }
    return result;
  }

  const towardCenter = pattern === "in";
  const compareByDistance = (a: number, b: number) => {
    const distanceDelta = distanceFromCenter(a, rows, cols) - distanceFromCenter(b, rows, cols);
    return (towardCenter ? distanceDelta : -distanceDelta) || a - b;
  };
  const sources = innerBoardSlots(rows, cols).filter((index) => board[index]).sort(compareByDistance);
  const targets = innerBoardSlots(rows, cols).sort(compareByDistance).slice(0, sources.length);
  sources.forEach((source, index) => { result[targets[index]] = board[source]; });
  return result;
}

function splitRemaining(board: (Tile | null)[], split: "horizontal" | "vertical", rows: number, cols: number): (Tile | null)[] {
  const pairs = shuffled(groupPairIndexes(board));
  const first: number[] = [];
  const second: number[] = [];
  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);
  for (let row = BOARD_MARGIN; row < rows - BOARD_MARGIN; row += 1) {
    for (let col = BOARD_MARGIN; col < cols - BOARD_MARGIN; col += 1) {
      if (split === "horizontal" && row === centerRow) continue;
      if (split === "vertical" && col === centerCol) continue;
      const index = row * cols + col;
      const belongsFirst = split === "horizontal" ? row < centerRow : col < centerCol;
      (belongsFirst ? first : second).push(index);
    }
  }
  const fixedFirst = split === "horizontal"
    ? (centerRow - 1) * cols + BOARD_MARGIN
    : BOARD_MARGIN * cols + centerCol - 1;
  const fixedSecond = split === "horizontal"
    ? (centerRow + 1) * cols + BOARD_MARGIN
    : BOARD_MARGIN * cols + centerCol + 1;
  const firstSlots = [fixedFirst, ...shuffled(first.filter((index) => index !== fixedFirst))];
  const secondSlots = [fixedSecond, ...shuffled(second.filter((index) => index !== fixedSecond))];
  const result: (Tile | null)[] = Array(rows * cols).fill(null);
  pairs.forEach(([a, b], pairIndex) => {
    result[firstSlots[pairIndex]] = board[a];
    result[secondSlots[pairIndex]] = board[b];
  });
  return result;
}

function applyGhostEffect(effect: GhostEffectId, board: (Tile | null)[], level: number, difficultyId: DifficultyId) {
  const { rows, cols } = difficultyById(difficultyId);
  const { rows: boardRows, cols: boardCols } = boardDimensions(rows, cols);
  if (effect === "smile") return { board: arrangeVeryEasy(board, boardRows, boardCols), bonus: 0, name: "笑臉：牌局變得容易" };
  if (effect === "angry") return { board: buildBoard(level, difficultyId), bonus: 32, name: "生氣：重新塞滿牌桌" };
  if (effect === "horizontal") return { board: splitRemaining(board, "horizontal", boardRows, boardCols), bonus: 0, name: "上下分邊" };
  if (effect === "vertical") return { board: splitRemaining(board, "vertical", boardRows, boardCols), bonus: 0, name: "左右分邊" };
  const pattern = effect as "up" | "down" | "left" | "right" | "in" | "out";
  const names = { up: "向上集中", down: "向下集中", left: "向左集中", right: "向右集中", in: "向內集中", out: "向外擴散" };
  return { board: moveTilesToward(board, pattern, boardRows, boardCols), bonus: 0, name: names[pattern] };
}

function shuffleOccupied(board: (Tile | null)[]): (Tile | null)[] {
  const positions = board.map((tile, i) => tile ? i : -1).filter((i) => i >= 0);
  const tiles = shuffled(board.filter(Boolean) as Tile[]);
  const next: (Tile | null)[] = Array(board.length).fill(null);
  positions.forEach((position, i) => { next[position] = tiles[i]; });
  return next;
}

function normalizeSave(data: unknown): SaveData | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as Record<string, unknown>;
  if (
    typeof candidate.playerName !== "string" ||
    typeof candidate.level !== "number" || !Number.isFinite(candidate.level) || candidate.level < 1 ||
    typeof candidate.clearedLevels !== "number" || !Number.isFinite(candidate.clearedLevels) || candidate.clearedLevels < 0 ||
    typeof candidate.time !== "number" || !Number.isFinite(candidate.time) || candidate.time < 0 ||
    typeof candidate.score !== "number" || !Number.isFinite(candidate.score) || candidate.score < 0
  ) return null;
  return {
    version: 2,
    playerName: candidate.playerName.trim().slice(0, 12) || "玩家",
    difficulty: isDifficultyId(candidate.difficulty) ? candidate.difficulty : "expert",
    level: Math.floor(candidate.level),
    clearedLevels: Math.floor(candidate.clearedLevels),
    time: Math.floor(candidate.time),
    score: Math.floor(candidate.score),
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : new Date(0).toISOString(),
  };
}

function normalizeRanking(data: unknown): Ranking | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as Record<string, unknown>;
  const finishedAt = candidate.finishedAt;
  if (typeof finishedAt !== "string") return null;
  const save = normalizeSave({
    ...candidate,
    level: typeof candidate.level === "number" ? candidate.level : Number(candidate.clearedLevels) + 1,
    time: typeof candidate.time === "number" ? candidate.time : 0,
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : finishedAt,
  });
  if (!save) return null;
  return { ...save, difficulty: isDifficultyId(candidate.difficulty) ? candidate.difficulty : null, finishedAt };
}

function sortRankings(rankings: Ranking[]): Ranking[] {
  return [...rankings]
    .sort((a, b) => b.score - a.score || b.clearedLevels - a.clearedLevels || a.finishedAt.localeCompare(b.finishedAt))
    .slice(0, 30);
}

function readSave(): SaveData | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function readRankings(): Ranking[] {
  try {
    const raw = window.localStorage.getItem(RANKING_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return sortRankings(data.flatMap((entry): Ranking[] => {
      const normalized = normalizeRanking(entry);
      return normalized ? [normalized] : [];
    }));
  } catch {
    return [];
  }
}

function writeSave(save: SaveData): boolean {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

function writeImportedRecord(progress: SaveData | null, rankings: Ranking[]): boolean {
  let previousSave: string | null = null;
  let previousRankings: string | null = null;
  try {
    previousSave = window.localStorage.getItem(SAVE_KEY);
    previousRankings = window.localStorage.getItem(RANKING_KEY);
    if (progress) window.localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
    else window.localStorage.removeItem(SAVE_KEY);
    window.localStorage.setItem(RANKING_KEY, JSON.stringify(rankings));
    return true;
  } catch {
    try {
      if (previousSave === null) window.localStorage.removeItem(SAVE_KEY);
      else window.localStorage.setItem(SAVE_KEY, previousSave);
      if (previousRankings === null) window.localStorage.removeItem(RANKING_KEY);
      else window.localStorage.setItem(RANKING_KEY, previousRankings);
    } catch { /* 儲存空間完全不可用時維持遊戲可操作 */ }
    return false;
  }
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [playerName, setPlayerName] = useState("玩家");
  const [savedProgress, setSavedProgress] = useState<SaveData | null>(null);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [recordNotice, setRecordNotice] = useState<RecordNotice | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(DEFAULT_MUSIC_VOLUME);
  const [soundVolume, setSoundVolume] = useState(DEFAULT_SOUND_VOLUME);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("standard");
  const [difficulty, setDifficulty] = useState<DifficultyId>(DEFAULT_DIFFICULTY);
  const [level, setLevel] = useState(1);
  const [time, setTime] = useState(START_TIME);
  const [score, setScore] = useState(0);
  const [board, setBoard] = useState<(Tile | null)[]>(() => buildBoard(1, DEFAULT_DIFFICULTY, seededRandom(314159)));
  const [selected, setSelected] = useState<number | null>(null);
  const [rejectedIndex, setRejectedIndex] = useState<number | null>(null);
  const [matchEffect, setMatchEffect] = useState<MatchEffect | null>(null);
  const [clearingIndexes, setClearingIndexes] = useState<number[]>([]);
  const [timeGainPulse, setTimeGainPulse] = useState(0);
  const [lastTimeGain, setLastTimeGain] = useState(4);
  const [phase, setPhase] = useState<Phase>("playing");
  const [message, setMessage] = useState("牌局開始：找出第一對牌吧");
  const [showRules, setShowRules] = useState(false);
  const [showNewGameSetup, setShowNewGameSetup] = useState(false);
  const [showDataTools, setShowDataTools] = useState(false);
  const [compactBoard, setCompactBoard] = useState(false);
  const [boardOffset, setBoardOffset] = useState<PathPoint>({ row: 0.5, col: 0.5 });
  const [levelBonus, setLevelBonus] = useState(0);
  const [ghostDraw, setGhostDraw] = useState<GhostDraw | null>(null);
  const ghostTokenRef = useRef(0);
  const animationTokenRef = useRef(0);
  const rankingRecordedRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const musicEnabledRef = useRef(true);
  const soundEnabledRef = useRef(true);
  const musicVolumeRef = useRef(DEFAULT_MUSIC_VOLUME);
  const soundVolumeRef = useRef(DEFAULT_SOUND_VOLUME);

  const difficultyConfig = useMemo(() => difficultyById(difficulty), [difficulty]);
  const { rows, cols, multiplier } = difficultyConfig;
  const { rows: boardRows, cols: boardCols } = useMemo(() => boardDimensions(rows, cols), [rows, cols]);
  const remaining = useMemo(() => board.filter(Boolean).length, [board]);
  const visualEntries = useMemo(() => {
    const entries = board.map((tile, index) => ({ tile, index, visualIndex: index }));
    if (!compactBoard) return entries;
    const compactEntries: { tile: Tile | null; index: number; visualIndex: number }[] = [];
    const compactCols = boardCols - BOARD_MARGIN * 2;
    for (let row = BOARD_MARGIN; row < boardRows - BOARD_MARGIN; row += 1) {
      for (let col = BOARD_MARGIN; col < boardCols - BOARD_MARGIN; col += 1) {
        const index = row * boardCols + col;
        const visualIndex = (row - BOARD_MARGIN) * compactCols + col - BOARD_MARGIN;
        compactEntries.push({ tile: board[index], index, visualIndex });
      }
    }
    return compactEntries;
  }, [board, boardCols, boardRows, compactBoard]);
  const visualCols = compactBoard ? boardCols - BOARD_MARGIN * 2 : boardCols;
  const visualRows = compactBoard ? boardRows - BOARD_MARGIN * 2 : boardRows;
  const boardAspect = (visualCols * 0.76) / visualRows;
  const displayedMatchPath = useMemo(() => {
    if (!matchEffect) return [];
    return matchEffect.path.map((point) => compactBoard
      ? { row: point.row - BOARD_MARGIN + boardOffset.row, col: point.col - BOARD_MARGIN + boardOffset.col }
      : { row: point.row + boardOffset.row, col: point.col + boardOffset.col });
  }, [boardOffset, compactBoard, matchEffect]);
  const progress = ((rows * cols - remaining) / (rows * cols)) * 100;
  const inputLocked = phase !== "playing" || matchEffect !== null || clearingIndexes.length > 0;
  const awardPoints = useCallback((base: number) => Math.round(base * multiplier), [multiplier]);

  useEffect(() => {
    let unlocked = false;
    const unlockAudio = () => {
      if (unlocked) return;
      unlocked = true;
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      if (musicEnabledRef.current) startBackgroundMusic();
      else if (soundEnabledRef.current) ensureAudioContext();
    };
    const playButtonSound = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest("button");
      if (soundEnabledRef.current && button && !button.classList.contains("tile") && !button.closest(".cheats")) playSoundEffect("click");
    };
    const syncVisibility = () => {
      if (document.hidden) stopBackgroundMusic();
      else if (musicEnabledRef.current && sharedAudioContext) startBackgroundMusic();
    };
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("click", playButtonSound);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("click", playButtonSound);
      document.removeEventListener("visibilitychange", syncVisibility);
      stopBackgroundMusic();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 620px)");
    const syncBoardMode = () => setCompactBoard(media.matches);
    syncBoardMode();
    media.addEventListener("change", syncBoardMode);
    return () => media.removeEventListener("change", syncBoardMode);
  }, []);

  const previousRemainingRef = useRef(remaining);
  const previousBoardLengthRef = useRef(board.length);
  useEffect(() => {
    const layoutChanged = remaining >= previousRemainingRef.current || board.length !== previousBoardLengthRef.current;
    if (layoutChanged) {
      setBoardOffset(occupiedBoardOffset(board, boardRows, boardCols));
    }
    previousRemainingRef.current = remaining;
    previousBoardLengthRef.current = board.length;
  }, [board, boardCols, boardRows, remaining]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const save = readSave();
      const storedRankings = readRankings();
      const audioSettings = readAudioSettings();
      const storedDisplayMode = readDisplayMode();
      setSavedProgress(save);
      setRankings(storedRankings);
      setMusicEnabled(audioSettings.music);
      setSoundEnabled(audioSettings.sound);
      setMusicVolume(audioSettings.musicVolume);
      setSoundVolume(audioSettings.soundVolume);
      setDisplayMode(storedDisplayMode);
      musicEnabledRef.current = audioSettings.music;
      soundEnabledRef.current = audioSettings.sound;
      musicVolumeRef.current = audioSettings.musicVolume;
      soundVolumeRef.current = audioSettings.soundVolume;
      musicVolumeLevel = audioSettings.musicVolume;
      soundVolumeLevel = audioSettings.soundVolume;
      if (!audioSettings.music) stopBackgroundMusic();
      else if (sharedAudioContext) startBackgroundMusic();
      if (save?.playerName) setPlayerName(save.playerName);
      if (save?.difficulty) setDifficulty(save.difficulty);
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  const createCheckpoint = useCallback((data: Omit<SaveData, "version" | "savedAt">) => {
    const save: SaveData = { ...data, version: 2, savedAt: new Date().toISOString() };
    if (writeSave(save)) setSavedProgress(save);
    return save;
  }, []);

  const toggleMusic = useCallback(() => {
    const next = !musicEnabledRef.current;
    musicEnabledRef.current = next;
    setMusicEnabled(next);
    writeAudioSettings({ music: next, sound: soundEnabledRef.current, musicVolume: musicVolumeRef.current, soundVolume: soundVolumeRef.current });
    if (next) startBackgroundMusic();
    else stopBackgroundMusic();
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    writeAudioSettings({ music: musicEnabledRef.current, sound: next, musicVolume: musicVolumeRef.current, soundVolume: soundVolumeRef.current });
    if (next) playSoundEffect("click");
  }, []);

  const updateMusicVolume = useCallback((value: number) => {
    const next = normalizeVolume(value, DEFAULT_MUSIC_VOLUME);
    musicVolumeRef.current = next;
    musicVolumeLevel = next;
    setMusicVolume(next);
    writeAudioSettings({ music: musicEnabledRef.current, sound: soundEnabledRef.current, musicVolume: next, soundVolume: soundVolumeRef.current });
  }, []);

  const updateSoundVolume = useCallback((value: number) => {
    const next = normalizeVolume(value, DEFAULT_SOUND_VOLUME);
    soundVolumeRef.current = next;
    soundVolumeLevel = next;
    setSoundVolume(next);
    writeAudioSettings({ music: musicEnabledRef.current, sound: soundEnabledRef.current, musicVolume: musicVolumeRef.current, soundVolume: next });
  }, []);

  const updateDisplayMode = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode);
    writeDisplayMode(mode);
  }, []);

  const charge = useCallback((cost: number) => {
    setTime((current) => {
      const next = Math.max(0, current - cost);
      if (next === 0) setPhase("over");
      return next;
    });
  }, []);

  const startNewGame = useCallback(() => {
    const name = playerName.trim().slice(0, 12) || "玩家";
    ghostTokenRef.current += 1;
    animationTokenRef.current += 1;
    rankingRecordedRef.current = false;
    setPlayerName(name);
    setLevel(1);
    setTime(START_TIME);
    setScore(0);
    setBoard(buildBoard(1, difficulty));
    setSelected(null);
    setRejectedIndex(null);
    setMatchEffect(null);
    setClearingIndexes([]);
    setGhostDraw(null);
    setPhase("playing");
    setMessage("牌局開始：找出第一對牌吧");
    setShowNewGameSetup(false);
    createCheckpoint({ playerName: name, difficulty, level: 1, clearedLevels: 0, time: START_TIME, score: 0 });
    setScreen("game");
  }, [createCheckpoint, difficulty, playerName]);

  const loadGame = useCallback(() => {
    const save = readSave();
    if (!save) {
      setSavedProgress(null);
      return;
    }
    ghostTokenRef.current += 1;
    animationTokenRef.current += 1;
    rankingRecordedRef.current = false;
    setPlayerName(save.playerName);
    setDifficulty(save.difficulty);
    setLevel(save.level);
    setTime(Math.max(1, Math.floor(save.time)));
    setScore(Math.max(0, Math.floor(save.score)));
    setBoard(buildBoard(save.level, save.difficulty));
    setSelected(null);
    setRejectedIndex(null);
    setMatchEffect(null);
    setClearingIndexes([]);
    setGhostDraw(null);
    setPhase("playing");
    setMessage(`已讀取進度：從第 ${save.level} 關開局重新開始`);
    setScreen("game");
  }, []);

  const returnToMenu = useCallback(() => {
    ghostTokenRef.current += 1;
    animationTokenRef.current += 1;
    setGhostDraw(null);
    setMatchEffect(null);
    setClearingIndexes([]);
    setShowRules(false);
    setShowNewGameSetup(false);
    setShowDataTools(false);
    setSavedProgress(readSave());
    setRankings(readRankings());
    setScreen("menu");
  }, []);

  const exportGameRecord = useCallback(() => {
    const progress = readSave();
    const storedRankings = readRankings();
    const record: GameRecordFile = {
      format: RECORD_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      progress,
      rankings: storedRankings,
    };
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `四川省-蔡小白-遊戲紀錄-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setRecordNotice({
      tone: "success",
      text: `已匯出${progress ? "進度" : "無進度"}與 ${storedRankings.length} 筆排行榜紀錄`,
    });
  }, []);

  const importGameRecord = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("檔案超過 1 MB，並非有效的遊戲紀錄");
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (parsed.format !== RECORD_FORMAT || parsed.version !== 1 || !Array.isArray(parsed.rankings)) {
        throw new Error("檔案格式不符，請選擇本遊戲匯出的 JSON 紀錄");
      }
      const progress = parsed.progress === null ? null : normalizeSave(parsed.progress);
      if (parsed.progress !== null && !progress) throw new Error("進度資料不完整或已損壞");
      const normalizedRankings = parsed.rankings.map(normalizeRanking);
      if (normalizedRankings.some((entry) => entry === null)) throw new Error("排行榜資料不完整或已損壞");
      const importedRankings = sortRankings(normalizedRankings as Ranking[]);
      if (!writeImportedRecord(progress, importedRankings)) throw new Error("瀏覽器無法寫入本機儲存空間");

      setSavedProgress(progress);
      setRankings(importedRankings);
      if (progress) {
        setPlayerName(progress.playerName);
        setDifficulty(progress.difficulty);
      }
      setRecordNotice({
        tone: "success",
        text: `匯入完成：${progress ? `第 ${progress.level} 關進度` : "無進度"}、${importedRankings.length} 筆排行榜紀錄`,
      });
    } catch (error) {
      setRecordNotice({ tone: "error", text: error instanceof Error ? error.message : "無法讀取這份遊戲紀錄" });
    }
  }, []);

  const finishCurrentGame = useCallback(() => {
    if (screen !== "game" || phase === "over") return;
    ghostTokenRef.current += 1;
    animationTokenRef.current += 1;
    setGhostDraw(null);
    setMatchEffect(null);
    setClearingIndexes([]);
    setSelected(null);
    setMessage("本局已結算：剩餘秒數不計入分數");
    try { window.localStorage.removeItem(SAVE_KEY); } catch { /* 儲存停用時仍可正常結算 */ }
    setSavedProgress(null);
    setPhase("over");
    if (soundEnabledRef.current) playSoundEffect("gameover");
  }, [phase, screen]);

  useEffect(() => {
    if (screen !== "game" || phase !== "playing") return;
    const timer = window.setInterval(() => {
      setTime((current) => {
        if (current <= 1) {
          setPhase("over");
          setMessage("時辰已到，再來一局吧");
          if (soundEnabledRef.current) playSoundEffect("gameover");
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, screen]);

  useEffect(() => {
    if (screen !== "game" || phase !== "playing" || remaining !== 0) return;
    const bonus = 18 + Math.floor(Math.random() * 23);
    const resultTimer = window.setTimeout(() => {
      setLevelBonus(bonus);
      setPhase("levelup");
      setMessage(`清盤！下一關獎勵 ${bonus} 秒`);
      if (soundEnabledRef.current) playSoundEffect("level");
      createCheckpoint({
        playerName,
        difficulty,
        level: level + 1,
        clearedLevels: level,
        time: time + bonus,
        score,
      });
    }, 0);
    return () => window.clearTimeout(resultTimer);
  }, [createCheckpoint, difficulty, level, phase, playerName, remaining, score, screen, time]);

  const enterNextLevel = useCallback(() => {
    if (phase !== "levelup") return;
    const nextLevel = level + 1;
    const nextTime = time + levelBonus;
    setLevel(nextLevel);
    setTime(nextTime);
    setBoard(buildBoard(nextLevel, difficulty));
    setSelected(null);
    setRejectedIndex(null);
    setPhase("playing");
    setMessage(`第 ${nextLevel} 關開始，剩餘時間已承接`);
    createCheckpoint({
      playerName,
      difficulty,
      level: nextLevel,
      clearedLevels: nextLevel - 1,
      time: nextTime,
      score,
    });
  }, [createCheckpoint, difficulty, level, levelBonus, phase, playerName, score, time]);

  useEffect(() => {
    if (screen !== "game" || phase !== "playing" || remaining === 0 || hasMove(board, boardRows, boardCols)) return;
    const rescue = window.setTimeout(() => {
      setBoard((current) => arrangeEasy(current, boardRows, boardCols));
      setSelected(null);
      setMessage("盤面暫無解，已免費整牌一次");
    }, 450);
    return () => window.clearTimeout(rescue);
  }, [board, boardCols, boardRows, phase, remaining, screen]);

  const triggerGhostEffect = useCallback((sourceBoard: (Tile | null)[]) => {
    const selectedEffectIndex = drawGhostEffectIndex();
    const token = ghostTokenRef.current + 1;
    ghostTokenRef.current = token;
    setBoard(sourceBoard);
    setPhase("ghost");
    setGhostDraw({ sourceBoard, selectedIndex: selectedEffectIndex, activeIndex: 0, stage: "spinning" });
    setMessage("鬼面輪盤轉動中…");
    if (soundEnabledRef.current) playSoundEffect("ghost");

    void (async () => {
      const totalSteps = 28;
      for (let step = 0; step < totalSteps; step += 1) {
        const delay = 65 + Math.max(0, step - 17) * 22;
        await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (ghostTokenRef.current !== token) return;
        const activeIndex = step === totalSteps - 1
          ? selectedEffectIndex
          : (step * 3 + Math.floor(Math.random() * GHOST_EFFECTS.length)) % GHOST_EFFECTS.length;
        setGhostDraw((current) => current ? { ...current, activeIndex } : current);
        if (soundEnabledRef.current) playSoundEffect("tick");
      }
      if (ghostTokenRef.current !== token) return;
      setGhostDraw((current) => current ? { ...current, activeIndex: selectedEffectIndex, stage: "result" } : current);
      if (soundEnabledRef.current) playSoundEffect("reveal");
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      if (ghostTokenRef.current !== token) return;

      const chosen = GHOST_EFFECTS[selectedEffectIndex];
      const effect = applyGhostEffect(chosen.id, sourceBoard, level, difficulty);
      setBoard(effect.board);
      if (effect.bonus) setTime((current) => current + effect.bonus);
      setMessage(`鬼臉效果｜${effect.name}${effect.bonus ? `，補償 ${effect.bonus} 秒` : ""}！`);
      setGhostDraw(null);
      setPhase("playing");
    })();
  }, [difficulty, level]);

  const selectTile = useCallback((index: number) => {
    if (inputLocked || !board[index]) return;
    if (selected === null) {
      setSelected(index);
      setMessage("再選一張相同的牌");
      if (soundEnabledRef.current) playSoundEffect("select");
      return;
    }
    if (selected === index) {
      setSelected(null);
      setMessage("已取消選牌");
      if (soundEnabledRef.current) playSoundEffect("select");
      return;
    }
    const path = findMatchPath(board, selected, index, boardRows, boardCols);
    if (!path) {
      const rejected = selected;
      setRejectedIndex(rejected);
      window.setTimeout(() => setRejectedIndex((current) => current === rejected ? null : current), 320);
      setSelected(index);
      setMessage(board[selected]?.kind === board[index]?.kind ? "路線被擋住了，換一組試試" : "花色不同，已改選這張牌");
      if (soundEnabledRef.current) playSoundEffect("reject");
      return;
    }

    const matched = board[index]!;
    const next = [...board];
    next[selected] = null;
    next[index] = null;
    const diagonal = isDiagonalMatch(selected, index, boardCols);
    const reward = calculateMatchReward(board, selected, index, boardCols);
    const skillPoints = awardPoints(reward.bonusPoints);
    const token = animationTokenRef.current + 1;
    animationTokenRef.current = token;
    setSelected(null);
    setRejectedIndex(null);
    setMatchEffect({ indexes: [selected, index], path, diagonal });
    setScore((current) => current + awardPoints(matched.group === "ghost" ? 500 : 100) + skillPoints);
    setTime((current) => current + reward.seconds);
    setLastTimeGain(reward.seconds);
    setTimeGainPulse((current) => current + 1);
    const reasons = [
      reward.distanceBonus ? `遠距 +${reward.distanceBonus} 秒` : "",
      reward.crossedBonus ? `穿越 ${reward.crossedTiles} 張牌 +${reward.crossedBonus} 秒` : "",
    ].filter(Boolean);
    const rewardDetail = reasons.length ? `（${reasons.join("、")}）` : "";
    setMessage(`${diagonal ? "長斜線" : "路徑"}連線成立！ +${reward.seconds} 秒${rewardDetail}${skillPoints ? `・技巧獎勵 +${skillPoints} 分` : ""}`);
    if (soundEnabledRef.current) playSoundEffect(reward.seconds > 4 ? "bonus" : "match");

    window.setTimeout(() => {
      if (animationTokenRef.current !== token) return;
      setMatchEffect(null);
      if (matched.kind === "ghost-mask") triggerGhostEffect(next);
      else setBoard(next);
    }, 430);
  }, [awardPoints, board, boardCols, boardRows, inputLocked, selected, triggerGhostEffect]);

  const activateW = useCallback(() => {
    if (inputLocked) return;
    const pairs = groupPairIndexes(board, true).slice(0, 2);
    if (pairs.length === 0) {
      setMessage("已沒有可供神機拿牌的普通牌");
      return;
    }
    const indexes = pairs.flat();
    const next = [...board];
    indexes.forEach((index) => { next[index] = null; });
    const token = animationTokenRef.current + 1;
    animationTokenRef.current = token;
    setClearingIndexes(indexes);
    charge(40);
    setScore((current) => current + awardPoints(pairs.length * 60));
    setSelected(null);
    setMessage(`神機拿牌：消去 ${pairs.length} 組，未獲得加時`);
    if (soundEnabledRef.current) playSoundEffect("cheat");
    window.setTimeout(() => {
      if (animationTokenRef.current !== token) return;
      setBoard(next);
      setClearingIndexes([]);
    }, 350);
  }, [awardPoints, board, charge, inputLocked]);

  const activateA = useCallback(() => {
    if (inputLocked) return;
    if (selected === null || !board[selected]) {
      setMessage("先選一張牌，再使用同花消牌");
      return;
    }
    const kind = board[selected]!.kind;
    const matches = board.filter((tile) => tile?.kind === kind).length;
    const indexes = board.map((tile, index) => tile?.kind === kind ? index : -1).filter((index) => index >= 0);
    const next = board.map((tile) => tile?.kind === kind ? null : tile);
    const token = animationTokenRef.current + 1;
    animationTokenRef.current = token;
    setClearingIndexes(indexes);
    charge(30);
    setScore((current) => current + awardPoints(matches * 25));
    setSelected(null);
    setMessage(`同花消牌：消去 ${matches} 張，未獲得加時`);
    if (soundEnabledRef.current) playSoundEffect("cheat");
    window.setTimeout(() => {
      if (animationTokenRef.current !== token) return;
      setClearingIndexes([]);
      if (kind === "ghost-mask") triggerGhostEffect(next);
      else setBoard(next);
    }, 350);
  }, [awardPoints, board, charge, inputLocked, selected, triggerGhostEffect]);

  const activateS = useCallback(() => {
    if (inputLocked) return;
    charge(70);
    let next = shuffleOccupied(board);
    for (let i = 0; i < 12 && !hasMove(next, boardRows, boardCols); i += 1) next = shuffleOccupied(board);
    setBoard(hasMove(next, boardRows, boardCols) ? next : arrangeEasy(next, boardRows, boardCols));
    setSelected(null);
    setMessage("移位大法：所有麻將已重新落位");
    if (soundEnabledRef.current) playSoundEffect("cheat");
  }, [board, boardCols, boardRows, charge, inputLocked]);

  const activateD = useCallback(() => {
    if (inputLocked) return;
    const occupied = shuffled(board.map((tile, i) => tile ? i : -1).filter((i) => i >= 0));
    let count = Math.max(4, Math.floor(occupied.length * 0.46));
    if (count % 2) count -= 1;
    const targets = occupied.slice(0, count);
    const values = shuffled(targets.map((i) => board[i]!));
    const next = [...board];
    targets.forEach((position, i) => { next[position] = values[i]; });
    charge(50);
    setBoard(next);
    setSelected(null);
    setMessage(`乾坤挪移：暗中調換了 ${count} 張牌`);
    if (soundEnabledRef.current) playSoundEffect("cheat");
  }, [board, charge, inputLocked]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (screen !== "game" || event.repeat || showRules) return;
      const key = event.key.toLowerCase();
      if (key === "insert") {
        event.preventDefault();
        if (phase !== "over") {
          setTime((current) => current + 10);
          if (soundEnabledRef.current) playSoundEffect("bonus");
        }
        return;
      }
      if (!["w", "a", "s", "d"].includes(key)) return;
      event.preventDefault();
      if (key === "w") activateW();
      if (key === "a") activateA();
      if (key === "s") activateS();
      if (key === "d") activateD();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRules, phase, screen, activateA, activateD, activateS, activateW]);

  useEffect(() => {
    if (screen !== "game" || phase !== "over" || rankingRecordedRef.current) return;
    rankingRecordedRef.current = true;
    const now = new Date().toISOString();
    const entry: Ranking = {
      version: 2,
      playerName,
      difficulty,
      level,
      clearedLevels: Math.max(0, level - 1),
      time,
      score,
      savedAt: now,
      finishedAt: now,
    };
    const next = sortRankings([entry, ...readRankings()]);
    try { window.localStorage.setItem(RANKING_KEY, JSON.stringify(next)); } catch { /* 瀏覽器停用儲存時仍可遊玩 */ }
    setRankings(next);
  }, [difficulty, level, phase, playerName, score, screen, time]);

  const timeUrgency = time <= 30 ? "danger" : time <= 60 ? "warning" : "safe";

  if (screen !== "game") {
    return (
      <main className="menu-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <section className={`menu-card ${screen}`} aria-labelledby="menu-title">
          <div className="menu-brand">
            <span className="menu-seal" role="img" aria-label="一索鸚鵡" />
            <span className="menu-version">版本 v{GAME_VERSION}</span>
            <h1 id="menu-title">四川省-蔡小白</h1>
            <p>遠斜對消 × 鬼牌變局</p>
          </div>

          {screen === "menu" && (
            <>
              <label className="player-name">
                <span>玩家名稱</span>
                <input
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  maxLength={12}
                  autoComplete="nickname"
                  aria-label="玩家名稱"
                />
              </label>
              <nav className="menu-actions" aria-label="主選單">
                <button onClick={() => { setShowDataTools(false); setShowNewGameSetup(true); }}><b>開始遊玩</b><small>選擇難度後，從第 1 關開始</small></button>
                <button onClick={loadGame} disabled={!storageReady || !savedProgress}>
                  <b>讀取進度</b>
                  <small>{savedProgress
                    ? `${difficultyById(savedProgress.difficulty).label} ${difficultyById(savedProgress.difficulty).rows}×${difficultyById(savedProgress.difficulty).cols}・第 ${savedProgress.level} 關・${savedProgress.score.toLocaleString("zh-TW")} 分`
                    : storageReady ? "此瀏覽器尚無存檔" : "正在讀取…"}</small>
                </button>
                <button onClick={() => setScreen("leaderboard")}><b>排行榜</b><small>查看此瀏覽器的最佳牌局</small></button>
                <button onClick={() => { setShowNewGameSetup(false); setShowDataTools(true); }}><b>設定與資料</b><small>顯示、音訊、紀錄備份與下載</small></button>
                <button onClick={() => setScreen("exit")}><b>結束遊戲</b><small>離開牌桌</small></button>
              </nav>
              <p className="storage-note">進度只保存在這台裝置的瀏覽器。中途離開時，會回到本關開始前的存檔。</p>
            </>
          )}

          {screen === "leaderboard" && (
            <div className="ranking-panel">
              <div className="panel-heading"><div><span>LOCAL RANKING</span><h2>本機排行榜</h2></div><button onClick={() => setScreen("menu")}>返回</button></div>
              {rankings.length === 0 ? (
                <div className="empty-ranking">尚無完賽紀錄<br /><small>完成一局後，成績會留在這台裝置。</small></div>
              ) : (
                <ol className="ranking-list">
                  {rankings.slice(0, 10).map((entry, index) => (
                    <li key={`${entry.finishedAt}-${index}`}>
                      <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
                      <strong>{entry.playerName}</strong>
                      <span>{entry.difficulty ? difficultyById(entry.difficulty).label : "?"}・{entry.score.toLocaleString("zh-TW")} 分・過 {entry.clearedLevels} 關</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {screen === "exit" && (
            <div className="exit-panel">
              <span className="result-seal">休</span>
              <h2>牌局已結束</h2>
              <p>進度已保留在本關開始前，可直接關閉這個網頁。</p>
              <button className="primary-button" onClick={() => setScreen("menu")}>返回主選單</button>
            </div>
          )}
        </section>
        {screen === "menu" && showNewGameSetup && (
          <div className="overlay" role="presentation">
            <div className="new-game-card" role="dialog" aria-modal="true" aria-labelledby="new-game-title">
              <span className="eyebrow">NEW GAME</span>
              <h2 id="new-game-title">選擇新遊戲難度</h2>
              <p>難度只套用到這次新牌局；讀取進度會沿用存檔原本的難度。</p>
              <fieldset className="difficulty-picker">
                <legend>盤面大小・計分倍率</legend>
                <div>
                  {DIFFICULTIES.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      className={difficulty === option.id ? "active" : ""}
                      aria-pressed={difficulty === option.id}
                      onClick={() => setDifficulty(option.id)}
                    >
                      <strong>{option.label}</strong>
                      <b>{option.rows} × {option.cols}</b>
                      <small>{option.detail}</small>
                      <em>分數 ×{option.multiplier}</em>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="new-game-actions">
                <button type="button" className="secondary-result-button" onClick={() => setShowNewGameSetup(false)}>取消</button>
                <button type="button" onClick={startNewGame}>以{difficultyConfig.label}難度開始</button>
              </div>
            </div>
          </div>
        )}
        {screen === "menu" && showDataTools && (
          <div className="overlay" role="presentation">
            <div className="data-tools-card" role="dialog" aria-modal="true" aria-labelledby="data-tools-title">
              <span className="eyebrow">SETTINGS & DATA</span>
              <h2 id="data-tools-title">設定與資料</h2>
              <p>音訊由程式即時合成，不載入外部音樂檔；設定會保存在這台瀏覽器。</p>
              <section className="audio-settings" aria-label="音訊設定">
                <div><strong>音訊設定</strong><small>可分別開關與調整音量</small></div>
                <div className="audio-toggle-grid">
                  <button type="button" className={musicEnabled ? "active" : ""} aria-pressed={musicEnabled} onClick={toggleMusic}>
                    <span aria-hidden="true">♫</span><b>背景音樂</b><small>{musicEnabled ? "開啟" : "關閉"}</small>
                  </button>
                  <button type="button" className={soundEnabled ? "active" : ""} aria-pressed={soundEnabled} onClick={toggleSound}>
                    <span aria-hidden="true">◖))</span><b>遊戲音效</b><small>{soundEnabled ? "開啟" : "關閉"}</small>
                  </button>
                </div>
                <div className="volume-controls">
                  <label>
                    <span>音樂音量 <output>{musicVolume}%</output></span>
                    <input type="range" min="0" max="100" step="5" value={musicVolume} onChange={(event) => updateMusicVolume(Number(event.target.value))} aria-label="音樂音量" />
                  </label>
                  <label>
                    <span>音效音量 <output>{soundVolume}%</output></span>
                    <input type="range" min="0" max="100" step="5" value={soundVolume} onChange={(event) => updateSoundVolume(Number(event.target.value))} aria-label="音效音量" />
                  </label>
                </div>
              </section>
              <section className="display-settings" aria-label="桌面顯示設定">
                <div><strong>桌面顯示</strong><small>手機版維持目前顯示方式</small></div>
                <div className="display-mode-grid" role="group" aria-label="桌面牌面顯示方式">
                  <button type="button" className={displayMode === "standard" ? "active" : ""} aria-pressed={displayMode === "standard"} onClick={() => updateDisplayMode("standard")}>
                    <b>標準顯示</b><small>牌面較大，捲軸只在牌桌內</small>
                  </button>
                  <button type="button" className={displayMode === "fit" ? "active" : ""} aria-pressed={displayMode === "fit"} onClick={() => updateDisplayMode("fit")}>
                    <b>一頁顯示</b><small>縮小牌面，不需上下捲動</small>
                  </button>
                </div>
              </section>
              <section className="record-transfer" aria-label="遊戲紀錄備份">
                <h3>遊戲紀錄與下載</h3>
                <p className="record-description">備份檔會同時保存進度與排行榜；匯入時會取代這台瀏覽器的現有紀錄。</p>
                <div>
                  <button
                    type="button"
                    onClick={exportGameRecord}
                    disabled={!storageReady || (!savedProgress && rankings.length === 0)}
                  >匯出遊戲紀錄</button>
                  <button type="button" onClick={() => importInputRef.current?.click()}>匯入遊戲紀錄</button>
                  <input
                    ref={importInputRef}
                    className="record-file-input"
                    type="file"
                    accept=".json,application/json"
                    aria-label="選擇要匯入的遊戲紀錄"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      void importGameRecord(file);
                    }}
                  />
                </div>
                <p className={recordNotice ? recordNotice.tone : ""} aria-live="polite">
                  {recordNotice?.text ?? "可將 JSON 備份檔帶到另一台裝置繼續遊玩。"}
                </p>
              </section>
              <a className="offline-download" href="./downloads/sichuan-ghost-mahjong-offline.zip" download>
                <span>↓</span><b>下載遊戲檔案</b><small>解壓縮後雙擊 index.html</small>
              </a>
              <button type="button" className="data-tools-close" onClick={() => setShowDataTools(false)}>返回主選單</button>
            </div>
          </div>
        )}
        <footer className="menu-footer">牌面、鬼面與程式合成音訊皆為本站原創・不使用商業遊戲素材</footer>
      </main>
    );
  }

  return (
    <main className={`game-shell display-${displayMode}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="brand">
          <span className="brand-seal">川</span>
          <div><h1>四川省-蔡小白</h1><p>遠斜對消 × 鬼牌變局</p></div>
        </div>
        <div className="header-actions">
          <button className="text-button" onClick={() => setShowRules(true)}>玩法說明</button>
          <button className="text-button settle-button" onClick={finishCurrentGame}>結算本局</button>
          <button className="text-button" onClick={returnToMenu}>主選單</button>
        </div>
      </header>

      <section className="hud" aria-label="遊戲狀態">
        <div className="hud-block"><span>關卡</span><strong>{String(level).padStart(2, "0")}</strong><em>{difficultyConfig.label} {rows}×{cols}・分數 ×{multiplier}</em></div>
        <div className={`timer ${timeUrgency}`} aria-live="polite">
          <span className="timer-mark">時</span>
          <div><span>剩餘時間</span><strong>{Math.floor(time / 60)}:{String(time % 60).padStart(2, "0")}</strong></div>
          {timeGainPulse > 0 && <b className="time-gain" key={timeGainPulse}>+{lastTimeGain} 秒</b>}
        </div>
        <div className="hud-block hud-score"><span>得分</span><strong className="score-value" key={score}>{score.toLocaleString("zh-TW")}</strong><em>剩 {remaining / 2} 組</em></div>
      </section>

      <div className="play-layout">
        <section className="table-wrap">
          <div className="progress-track" aria-label={`本關完成 ${Math.round(progress)}%`}><span style={{ width: `${progress}%` }} /></div>
          <div className="table-label"><span>同一條 45° 斜線即可遠距對消</span></div>
          <div className="mahjong-table">
            <div
              className={`board ${compactBoard ? "compact-board" : ""}`}
              role="grid"
              aria-label={`${difficultyConfig.label} ${rows} 乘 ${cols} 四川省麻將牌盤`}
              style={{
                "--board-cols": visualCols,
                "--board-rows": visualRows,
                "--board-aspect": boardAspect,
                "--board-fit-width": `${boardAspect * 100}cqh`,
                "--board-standard-width": `calc(${boardAspect * 120}dvh - ${boardAspect * 240}px)`,
                "--board-max-width": `${Math.min(1280, visualCols * 88)}px`,
                "--cell-offset-x": `calc(${boardOffset.col * 100}% + ${boardOffset.col} * var(--board-gap))`,
                "--cell-offset-y": `calc(${boardOffset.row * 100}% + ${boardOffset.row} * var(--board-gap))`,
              } as CSSProperties}
            >
              {visualEntries.map(({ tile, index, visualIndex }) => (
                <div className="cell" role="gridcell" key={index}>
                  {tile ? (
                    <button
                      type="button"
                      className={`tile tile-${tile.group} ${selected === index ? "selected" : ""} ${rejectedIndex === index ? "rejected" : ""} ${matchEffect?.indexes.includes(index) ? "matching" : ""} ${clearingIndexes.includes(index) ? "clearing" : ""} ${tile.kind}`}
                      onClick={() => selectTile(index)}
                      aria-label={`${tile.face}${tile.corner}，第 ${Math.floor(visualIndex / visualCols) + 1} 列第 ${visualIndex % visualCols + 1} 欄`}
                      aria-pressed={selected === index}
                    >
                      {tile.group === "ghost" ? (
                        <span className="ghost-mask-art" aria-hidden="true"><small>鬼面</small></span>
                      ) : tileAsset(tile) ? (
                        <span
                          className="tile-art"
                          aria-hidden="true"
                          style={{ backgroundImage: `url("${tileAsset(tile)}")` }}
                        />
                      ) : (
                        <><span className="tile-corner">{tile.corner}</span><span className="tile-face">{tile.face}</span><span className="tile-suit">{tile.corner}</span></>
                      )}
                    </button>
                  ) : compactBoard ? <button type="button" className="tile tile-placeholder" disabled aria-hidden="true" tabIndex={-1} /> : null}
                </div>
              ))}
              {matchEffect && (
                <svg className={`match-path ${matchEffect.diagonal ? "diagonal" : "orthogonal"}`} viewBox={`0 0 ${visualCols} ${visualRows}`} preserveAspectRatio="none" aria-hidden="true">
                  <polyline className="match-path-glow" pathLength="1" points={displayedMatchPath.map((point) => `${point.col},${point.row}`).join(" ")} />
                  <polyline className="match-path-core" pathLength="1" points={displayedMatchPath.map((point) => `${point.col},${point.row}`).join(" ")} />
                  {displayedMatchPath.map((point, index) => <circle key={`${point.row}-${point.col}-${index}`} cx={point.col} cy={point.row} r=".09" />)}
                </svg>
              )}
            </div>
            <div className="felt-mark felt-mark-left">福</div><div className="felt-mark felt-mark-right">勝</div>
          </div>
          <div className="message-bar" aria-live="polite"><span className="message-dot" />{message}</div>
        </section>

        <aside className="cheats" aria-label="秘技">
          <div className="cheat-heading"><span>秘技</span><p>點擊或按鍵盤</p></div>
          <button onClick={activateW} disabled={inputLocked}><kbd>W</kbd><span><strong>神機拿牌</strong><small>自動消去 2 組</small></span><em>−40秒</em></button>
          <button onClick={activateA} disabled={inputLocked}><kbd>A</kbd><span><strong>同花消牌</strong><small>先選牌，再消同牌</small></span><em>−30秒</em></button>
          <button onClick={activateS} disabled={inputLocked}><kbd>S</kbd><span><strong>移位大法</strong><small>重排所有麻將</small></span><em>−70秒</em></button>
          <button onClick={activateD} disabled={inputLocked}><kbd>D</kbd><span><strong>乾坤挪移</strong><small>暗換部分位置</small></span><em>−50秒</em></button>
          <div className="cheat-note">秘技消牌不會增加時間</div>
        </aside>
      </div>

      {phase === "ghost" && ghostDraw && (
        <div className="overlay ghost-wheel-overlay" role="dialog" aria-modal="true" aria-labelledby="ghost-wheel-title">
          <div className={`ghost-wheel-card ${ghostDraw.stage}`}>
            <span className="eyebrow">GHOST JACKPOT</span>
            <h2 id="ghost-wheel-title">鬼面輪盤</h2>
            <p>{ghostDraw.stage === "spinning" ? "十種變局，命運選一種" : "鬼面已作出選擇"}</p>
            <div className="ghost-wheel-grid" aria-live="polite">
              {GHOST_EFFECTS.map((effect, index) => {
                const active = ghostDraw.activeIndex === index;
                const winner = ghostDraw.stage === "result" && ghostDraw.selectedIndex === index;
                return (
                  <div className={`ghost-option ${active ? "active" : ""} ${winner ? "winner" : ""}`} key={effect.id}>
                    <span>{effect.symbol}</span>
                    <strong>{effect.label}</strong>
                    <small>{effect.detail}</small>
                  </div>
                );
              })}
            </div>
            <div className="ghost-wheel-status">
              <i />
              {ghostDraw.stage === "spinning"
                ? "輪盤轉動中…"
                : `抽中｜${GHOST_EFFECTS[ghostDraw.selectedIndex].label}・${GHOST_EFFECTS[ghostDraw.selectedIndex].detail}`}
              <i />
            </div>
          </div>
        </div>
      )}

      {phase === "levelup" && <div className="overlay" role="status"><div className="result-card level-card"><span className="result-seal">過</span><p>第 {level} 關清盤</p><h2>獎勵 +{levelBonus} 秒</h2><small>剩餘時間將完整帶往下一關，準備好再繼續</small><button onClick={enterNextLevel}>進入第 {level + 1} 關</button></div></div>}

      {phase === "over" && <div className="overlay"><div className="result-card"><span className="result-seal">終</span><p>牌局結束</p><h2>{score.toLocaleString("zh-TW")} 分</h2><small>{difficultyConfig.label} {rows}×{cols}・抵達第 {level} 關，成績已存入本機排行榜</small><button onClick={startNewGame}>再開一局</button><button className="secondary-result-button" onClick={returnToMenu}>回主選單</button></div></div>}

      {showRules && (
        <div className="overlay rules-overlay">
          <div className="rules-card" role="dialog" aria-modal="true" aria-labelledby="rules-title">
            <button className="close-button" onClick={() => setShowRules(false)} aria-label="關閉玩法說明">×</button>
            <span className="eyebrow">HOW TO PLAY</span><h2 id="rules-title">四川省-蔡小白</h2>
            <div className="rules-grid">
              <div><b>01</b><p><strong>基本對消</strong>相同牌以不超過兩次轉彎的空路相連，即可消除；盤外也算空路。</p></div>
              <div><b>02</b><p><strong>遠距斜線</strong>同一條 45° 斜線上的相同牌不受中間牌阻擋，無論多遠都能對消。</p></div>
              <div><b>03</b><p><strong>限時連戰</strong>消牌至少 +4 秒；距離越遠、斜線穿越的牌越多，時間與分數獎勵越高。過關再隨機加時。</p></div>
              <div><b>04</b><p><strong>鬼面分邊</strong>只有鬼面輪盤抽中上下或左右時，才會把每一對牌分到兩側。</p></div>
            </div>
            <div className="ghost-rules">
              <div><span className="mini-ghost smile-mini">鬼</span><p><strong>每關兩組鬼臉牌</strong>每次觸發，鬼面輪盤會從笑臉、生氣與各種集中／分邊效果中隨機選一個。</p></div>
              <div><span className="mini-ghost angry-mini">變</span><p><strong>隨機變局</strong>生氣會補滿牌並補時間；笑臉會排成好消的隊形，其餘效果移動現有牌。</p></div>
            </div>
            <button className="primary-button" onClick={() => setShowRules(false)}>知道了，繼續牌局</button>
          </div>
        </div>
      )}
    </main>
  );
}
