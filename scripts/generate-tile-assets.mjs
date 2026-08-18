import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out = join(process.cwd(), "public", "tiles");
await mkdir(out, { recursive: true });

const numerals = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const base = (content, accent = "#164f3e") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 220">
  <defs>
    <linearGradient id="ivory" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdf1"/><stop offset=".65" stop-color="#eee4c9"/><stop offset="1" stop-color="#c9b481"/></linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d8c797"/><stop offset="1" stop-color="#8e7546"/></linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#24170b" flood-opacity=".42"/></filter>
  </defs>
  <rect x="5" y="6" width="150" height="208" rx="14" fill="url(#edge)" filter="url(#shadow)"/>
  <rect x="6" y="4" width="148" height="198" rx="13" fill="url(#ivory)" stroke="#e9ddba" stroke-width="3"/>
  <rect x="14" y="13" width="132" height="180" rx="8" fill="none" stroke="${accent}" stroke-opacity=".13" stroke-width="2"/>
  ${content}
</svg>`;

const text = (value, color, size = 88, y = 122) => `<text x="80" y="${y}" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="${size}" font-weight="800" fill="${color}" stroke="#fff8e8" stroke-width="1.2" paint-order="stroke">${escape(value)}</text>`;
const pipPositions = {
  1:[[80,102]],2:[[50,65],[110,139]],3:[[45,55],[80,103],[115,151]],4:[[50,58],[110,58],[50,146],[110,146]],5:[[48,54],[112,54],[80,102],[48,150],[112,150]],6:[[48,48],[112,48],[48,102],[112,102],[48,156],[112,156]],7:[[47,45],[113,45],[80,76],[47,111],[113,111],[47,159],[113,159]],8:[[48,42],[112,42],[48,82],[112,82],[48,122],[112,122],[48,162],[112,162]],9:[[45,43],[80,43],[115,43],[45,102],[80,102],[115,102],[45,161],[80,161],[115,161]],
};

for (let n = 1; n <= 9; n += 1) {
  await writeFile(join(out, `Man${n}.svg`), base(`${text(numerals[n - 1], "#b02d2b", 70, 100)}${text("萬", "#164f3e", 52, 165)}`, "#b02d2b"));
  const pips = pipPositions[n].map(([x,y], index) => `<g transform="translate(${x} ${y})"><circle r="20" fill="none" stroke="${index % 3 === 0 ? "#b02d2b" : index % 3 === 1 ? "#155a91" : "#13704d"}" stroke-width="6"/><circle r="9" fill="${index % 2 ? "#13704d" : "#155a91"}"/><circle r="3" fill="#f6e9c5"/></g>`).join("");
  await writeFile(join(out, `Pin${n}.svg`), base(pips, "#155a91"));
  const bamboo = Array.from({ length: n }, (_, index) => {
    const cols = n <= 3 ? n : 3;
    const rows = Math.ceil(n / cols);
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 80 + (col - (cols - 1) / 2) * 42;
    const y = 102 + (row - (rows - 1) / 2) * 57;
    return `<g transform="translate(${x} ${y}) rotate(${index % 2 ? 5 : -5})"><rect x="-6" y="-25" width="12" height="50" rx="5" fill="#16714f"/><path d="M0-14L-18-27M0-7L17-21M0 8L-18 23M0 15L17 29" stroke="${index % 3 === 0 ? "#b22e2c" : "#16714f"}" stroke-width="7" stroke-linecap="round"/><path d="M-5-8H5M-5 9H5" stroke="#f2dda2" stroke-width="3"/></g>`;
  }).join("");
  await writeFile(join(out, `Sou${n}.svg`), base(bamboo, "#16714f"));
}

for (const [file, label] of [["Ton","東"],["Nan","南"],["Shaa","西"],["Pei","北"]]) {
  await writeFile(join(out, `${file}.svg`), base(text(label, "#172d29", 92, 132), "#172d29"));
}
await writeFile(join(out, "Chun.svg"), base(text("中", "#ba2e2b", 96, 135), "#ba2e2b"));
await writeFile(join(out, "Hatsu.svg"), base(text("發", "#13704d", 92, 133), "#13704d"));
await writeFile(join(out, "Haku.svg"), base(`<rect x="39" y="50" width="82" height="104" rx="5" fill="none" stroke="#155a91" stroke-width="7"/><rect x="48" y="59" width="64" height="86" rx="2" fill="none" stroke="#b8aa82" stroke-width="2"/>`, "#155a91"));

console.log(`Generated tile SVGs in ${out}`);
