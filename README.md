# 四川省-蔡小白

限時四川省麻將配對遊戲，支援長距離 45° 斜角對消、鬼面隨機變局、鍵盤秘技、關卡起點存檔與本機排行榜。

## GitHub Pages 自動部署

專案已包含 `.github/workflows/deploy-pages.yml`。推送到 `main` 分支時會：

1. 安裝相依套件。
2. 產生本地麻將 SVG。
3. 建立純靜態遊戲與離線 ZIP。
4. 自動部署至 GitHub Pages。

第一次建立 repository 後，請在 GitHub 的 **Settings → Pages → Build and deployment** 將 Source 設為 **GitHub Actions**。

## 本地開發

```bash
pnpm install
pnpm dev
```

正式檢查：

```bash
pnpm lint
pnpm build
pnpm package:release
```

遊戲進度與排行榜只使用瀏覽器 `localStorage`，不會上傳到伺服器。主選單可將兩者一起匯出為 JSON 備份檔，並在其他瀏覽器或裝置匯入。
