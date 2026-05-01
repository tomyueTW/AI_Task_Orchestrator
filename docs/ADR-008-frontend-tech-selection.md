# ADR-008: 前端技術選型（React + Vite + Tailwind v4）

```
狀態：    Accepted
日期：    2026-05-01
決策者：  Lead Architect
受影響範圍：apps/web/, package.json scripts, build pipeline
```

---

## 情境 (Context)

第四階段（視覺化）需要前端應用實現：
- 即時佇列狀態（SSE 串流推送）
- DAG 圖形渲染與互動編輯（菱形、扇出扇入）
- 任務流轉動畫
- 成本即時面板（讀 Prometheus）
- Chaos 控制台

**約束：**
1. 與現有 NestJS monorepo 共存，不另開倉庫
2. 部署採 Vite static build → 由 NestJS 透過 `serveStatic` 提供（或獨立 nginx）
3. 主要使用者是作者本人 + 招募者 demo，不需 SEO / SSR
4. 與現有 TypeScript 設定相容

---

## 決策 (Decision)

採用 **React 18 + Vite 5 + Tailwind v4 + react-router-dom 6**，置於 `apps/web/`。

### 1. UI 框架：React 18

- 生態最成熟（**ReactFlow** 作為 DAG 視覺化首選）
- Hooks 模型對 SSE/WebSocket 訂閱友善（`useEffect` + `EventSource`）
- 招募市場可見度最高，作品集適配性最佳

### 2. Build Tool：Vite 5（搭配 `.mts` ESM 設定）

- 開發啟動 < 500ms，HMR 即時
- `defineConfig` 內建 proxy（API 反向代理至 `localhost:3000`）
- 與 Tailwind v4 官方 plugin 無痛整合

> **注意：** Tailwind v4 plugin (`@tailwindcss/vite`) 為純 ESM 套件，必須使用 `.mts` 配置檔避免 esbuild 嘗試以 CommonJS 載入。已紀錄於 `apps/web/vite.config.mts`。

### 3. 樣式：Tailwind v4

- 無需 PostCSS / config 檔，僅 `@import "tailwindcss"` 即可
- atomic class 適合快速 prototype
- 不引入 shadcn/ui — 主動拒絕，原因見下

### 4. 路由：react-router-dom 6

- `<Routes>` 巢狀路由 + `<Outlet>` 共享 Layout
- 對 lazy loading 與 nested route 支援足夠

### 5. 即時通訊：SSE 優先（9月 W2 落地）

- 後端僅需 push（佇列狀態），不需雙向通訊
- 原生 `EventSource` 自帶斷線重連
- WebSocket 留作 chaos panel 雙向控制 fallback

### 6. DAG 視覺化：ReactFlow（10月 W1 落地）

- 主動式佈局（dagre / elkjs auto-layout）
- 節點/邊客製化彈性高
- 與 React 生態整合（不像 D3 需手寫大量 imperative 代碼）

### 7. 動畫：Framer Motion（9月 W3 落地）

- declarative 動畫 API，與 React 風格一致
- spring physics 適合「任務流動」的擬物效果

---

## 拒絕方案

### Option A：Vue + Vite ❌
團隊熟悉度與招募市場可見度不及 React；ReactFlow 等 DAG 視覺化生態優勢明顯。

### Option B：Next.js ❌
作品集不需 SSR / SSG / RSC；Next 的 file-based routing 對單頁儀表板過重。

### Option C：shadcn/ui ❌
shadcn 採 CLI 複製代碼到專案的模式，會讓 `apps/web/src/components/ui/` 充斥 30+ 自動生成檔案，與「最小代碼、可被測試」的整體原則衝突。改採 Tailwind 直接寫元件，需要時再手抄個別 shadcn 元件。

### Option D：Svelte ❌
ReactFlow / 大部分視覺化生態仍以 React 為核心；招募 leverage 低。

### Option E：純 D3 ❌
DAG 編輯器需要 drag/drop + 節點編輯；D3 對此較笨重，不如 ReactFlow 直接。

---

## 影響 (Consequences)

### 正面
- 前端與 API 共用 `tsconfig.json` paths（之後 lib 重構可共享 type）
- Vite 開發體驗極佳，week-by-week iteration 成本低
- 全棧 TypeScript，型別可從 NestJS DTO → React 元件一路傳遞

### 負面 / 風險
- **多了一個構建系統**：`nest build` 與 `vite build` 並存，需在 README 明確說明
- **ESM 配置坑**：`.mts` 限定 Tailwind v4 plugin（已記錄）
- **bundle 大小**：初始 React + Router ≈ 170 kB；後續加 ReactFlow + Framer 預估 350 kB（仍可接受）

---

## 部署與整合（規劃）

| 階段 | 動作 |
|---|---|
| 開發 | `npm run web:dev`（Vite :5173 + proxy → API :3000） |
| Production | `npm run web:build` 產出 `dist/apps/web/`；由 NestJS `serveStaticAssets` 或 nginx 提供 |
| Bull Board 整合 | `/admin/queues` 由 NestJS 處理，前端 layout header 提供連結（不嵌入 iframe） |

---

## 相關
- 9月 W1：本 ADR + 前端骨架
- 9月 W2：SSE 串流接入
- 10月 W1：ReactFlow DAG 視覺化
- 10月 W4：架構互動地圖 + 影片 #2
