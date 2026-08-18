import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out = join(process.cwd(), "public", "tiles");
await mkdir(out, { recursive: true });

const numerals = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const colors = { red: "#b52227", blue: "#15568a", green: "#08704f", ink: "#172d29", ivory: "#f7edcf" };
const svg = (content) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 220">
  <defs><filter id="soft"><feDropShadow dx="0" dy="1.5" stdDeviation=".8" flood-color="#5b3b1c" flood-opacity=".28"/></filter></defs>
  <g filter="url(#soft)">${content}</g>
</svg>`;
const label = (n, suit, color) => `<g font-family="Arial,Noto Sans TC,sans-serif" font-weight="800" fill="${color}"><text x="17" y="28" font-size="19">${n}</text><text x="17" y="45" font-size="13">${suit}</text></g>`;

const pipLayouts = {
  1: [[80, 112, 1.55]],
  2: [[51, 69], [109, 155]],
  3: [[50, 64], [80, 112], [110, 160]],
  4: [[51, 67], [109, 67], [51, 157], [109, 157]],
  5: [[51, 61], [109, 61], [80, 112], [51, 163], [109, 163]],
  6: [[51, 57], [109, 57], [51, 112], [109, 112], [51, 167], [109, 167]],
  7: [[51, 54], [109, 54], [80, 86], [51, 120], [109, 120], [51, 168], [109, 168]],
  8: [[51, 49], [109, 49], [51, 91], [109, 91], [51, 133], [109, 133], [51, 175], [109, 175]],
  9: [[47, 54], [80, 54], [113, 54], [47, 112], [80, 112], [113, 112], [47, 170], [80, 170], [113, 170]],
};

const pip = ([x, y, scale = 1], index, total) => {
  const accent = total === 1 ? colors.red : index % 3 === 0 ? colors.red : index % 3 === 1 ? colors.blue : colors.green;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><circle r="15" fill="${colors.ivory}" stroke="${colors.blue}" stroke-width="4"/><circle r="9" fill="none" stroke="${accent}" stroke-width="4"/><circle r="3.5" fill="${accent}"/></g>`;
};

const bambooLayouts = {
  1: [[80, 111, 1.45]],
  2: [[57, 82], [103, 142]],
  3: [[53, 73], [80, 114], [107, 155]],
  4: [[57, 76], [103, 76], [57, 151], [103, 151]],
  5: [[56, 69], [104, 69], [80, 112], [56, 158], [104, 158]],
  6: [[56, 61], [104, 61], [56, 113], [104, 113], [56, 165], [104, 165]],
  7: [[55, 55], [105, 55], [80, 86], [55, 121], [105, 121], [55, 169], [105, 169]],
  8: [[56, 49], [104, 49], [56, 91], [104, 91], [56, 133], [104, 133], [56, 175], [104, 175]],
  9: [[48, 54], [80, 54], [112, 54], [48, 112], [80, 112], [112, 112], [48, 170], [80, 170], [112, 170]],
};

const bamboo = ([x, y, scale = 1], index) => {
  const body = index % 4 === 0 ? colors.red : index % 4 === 2 ? colors.blue : colors.green;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><rect x="-7" y="-21" width="14" height="42" rx="7" fill="${body}"/><path d="M-5-7H5M-5 7H5" stroke="${colors.ivory}" stroke-width="3"/><circle r="3" fill="#e9bf55"/></g>`;
};

for (let n = 1; n <= 9; n += 1) {
  const man = `${label(n, "萬", colors.red)}<text x="80" y="111" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="69" font-weight="900" fill="${colors.ink}">${numerals[n - 1]}</text><text x="80" y="176" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="55" font-weight="900" fill="${colors.red}">萬</text>`;
  await writeFile(join(out, `Man${n}.svg`), svg(man));

  const pips = pipLayouts[n].map((entry, index) => pip(entry, index, n)).join("");
  await writeFile(join(out, `Pin${n}.svg`), svg(`${label(n, "筒", colors.blue)}${pips}`));

  const sticks = bambooLayouts[n].map((entry, index) => bamboo(entry, index)).join("");
  await writeFile(join(out, `Sou${n}.svg`), svg(`${label(n, "索", colors.green)}${sticks}`));
}

for (const [file, value] of [["Ton", "東"], ["Nan", "南"], ["Shaa", "西"], ["Pei", "北"]]) {
  await writeFile(join(out, `${file}.svg`), svg(`<text x="80" y="145" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="101" font-weight="900" fill="${colors.ink}">${value}</text>`));
}
await writeFile(join(out, "Chun.svg"), svg(`<text x="80" y="147" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="105" font-weight="900" fill="${colors.red}">中</text>`));
await writeFile(join(out, "Hatsu.svg"), svg(`<text x="80" y="145" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="101" font-weight="900" fill="${colors.green}">發</text>`));
await writeFile(join(out, "Haku.svg"), svg(`<rect x="39" y="49" width="82" height="119" rx="5" fill="none" stroke="${colors.blue}" stroke-width="8"/><rect x="50" y="60" width="60" height="97" rx="2" fill="none" stroke="#bcae87" stroke-width="2"/>`));

console.log(`Generated 34 clear tile-face SVGs in ${out}`);
