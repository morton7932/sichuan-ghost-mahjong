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
  7: [[48, 48], [80, 79], [112, 110], [51, 145], [109, 145], [51, 181], [109, 181]],
  8: [[51, 49], [109, 49], [51, 91], [109, 91], [51, 133], [109, 133], [51, 175], [109, 175]],
  9: [[47, 54], [80, 54], [113, 54], [47, 112], [80, 112], [113, 112], [47, 170], [80, 170], [113, 170]],
};

const pip = ([x, y, scale = 1], index, total) => {
  const accent = total === 1
    ? colors.red
    : total === 7
      ? index < 3 ? colors.blue : colors.red
      : index % 3 === 0 ? colors.red : index % 3 === 1 ? colors.blue : colors.green;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><circle r="15" fill="${colors.ivory}" stroke="${colors.blue}" stroke-width="4"/><circle r="9" fill="none" stroke="${accent}" stroke-width="4"/><circle r="3.5" fill="${accent}"/></g>`;
};

const bambooLayouts = {
  1: [[80, 111, 1.45]],
  2: [[57, 111], [103, 111]],
  3: [[52, 67], [80, 112], [108, 157]],
  4: [[56, 77], [104, 77], [56, 149], [104, 149]],
  5: [[54, 68], [106, 68], [80, 112], [54, 160], [106, 160]],
  6: [[55, 58], [105, 58], [55, 112], [105, 112], [55, 166], [105, 166]],
  7: [[49, 49], [80, 79], [111, 109], [55, 145], [105, 145], [55, 181], [105, 181]],
  8: [[55, 47], [105, 47], [55, 91], [105, 91], [55, 135], [105, 135], [55, 179], [105, 179]],
  9: [[46, 55], [80, 55], [114, 55], [46, 112], [80, 112], [114, 112], [46, 169], [80, 169], [114, 169]],
};

const bambooColor = (total, index) => {
  if (total === 3) return [colors.blue, colors.red, colors.green][index];
  if (total === 5 && index === 2) return colors.red;
  if (total === 7 && index === 1) return colors.red;
  if (total === 9) return [colors.blue, colors.green, colors.red][Math.floor(index / 3)];
  return index % 2 === 0 ? colors.green : colors.blue;
};

const bamboo = ([x, y, scale = 1], index, total) => {
  const body = bambooColor(total, index);
  return `<g transform="translate(${x} ${y}) scale(${scale})" stroke="${colors.ink}" stroke-width="1.4" stroke-linejoin="round">
    <path d="M-9-20Q0-24 9-20L7-8Q0-4-7-8Z" fill="${body}"/>
    <path d="M-8-5Q0-9 8-5L8 6Q0 10-8 6Z" fill="${body}"/>
    <path d="M-7 9Q0 5 7 9L9 20Q0 24-9 20Z" fill="${body}"/>
    <path d="M-4-17L4-19M-3-2L4-4M-3 13L4 11" stroke="${colors.ivory}" stroke-width="2" stroke-linecap="round" opacity=".82"/>
  </g>`;
};

for (let n = 1; n <= 9; n += 1) {
  const man = `${label(n, "萬", colors.red)}<text x="80" y="111" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="69" font-weight="900" fill="${colors.ink}">${numerals[n - 1]}</text><text x="80" y="176" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="55" font-weight="900" fill="${colors.red}">萬</text>`;
  await writeFile(join(out, `Man${n}.svg`), svg(man));

  const pips = pipLayouts[n].map((entry, index) => pip(entry, index, n)).join("");
  await writeFile(join(out, `Pin${n}.svg`), svg(`${label(n, "筒", colors.blue)}${pips}`));

  const sticks = bambooLayouts[n].map((entry, index) => bamboo(entry, index, n)).join("");
  await writeFile(join(out, `Sou${n}.svg`), svg(`${label(n, "索", colors.green)}${sticks}`));
}

for (const [file, value] of [["Ton", "東"], ["Nan", "南"], ["Shaa", "西"], ["Pei", "北"]]) {
  await writeFile(join(out, `${file}.svg`), svg(`<text x="80" y="145" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="101" font-weight="900" fill="${colors.ink}">${value}</text>`));
}
await writeFile(join(out, "Chun.svg"), svg(`<text x="80" y="147" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="105" font-weight="900" fill="${colors.red}">中</text>`));
await writeFile(join(out, "Hatsu.svg"), svg(`<text x="80" y="145" text-anchor="middle" font-family="Noto Serif TC,Songti TC,serif" font-size="101" font-weight="900" fill="${colors.green}">發</text>`));
await writeFile(join(out, "Haku.svg"), svg(`<rect x="39" y="49" width="82" height="119" rx="5" fill="none" stroke="${colors.blue}" stroke-width="8"/><rect x="50" y="60" width="60" height="97" rx="2" fill="none" stroke="#bcae87" stroke-width="2"/>`));

console.log(`Generated 34 clear tile-face SVGs in ${out}`);
