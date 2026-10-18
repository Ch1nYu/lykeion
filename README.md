# lykeion

Turn lecture slides (PDF) into a single-file, interactive teaching site: chapters that follow the slides, Labs you can move, a levelled quiz, and numbers and claims that are checked against the source before you see them.

lykeion is an agent skill. The agent (Claude Code, or any agent that can run a CLI and read images) writes the content; the `lykeion` CLI extracts the slides, builds the page and verifies it.

> **Status:** a personal project, shared as is. It works and is tested, but updates may be irregular. Issues and pull requests are welcome; responses are not guaranteed.

[繁體中文說明](#繁體中文)

## Install

Requirements: **Node 22.13 or newer** and Google Chrome (or Playwright's Chromium) for page rendering.

```bash
npx skills add Ch1nYu/lykeion -g -a claude-code
```

That is all. On first use the agent installs the CLI's dependencies itself (step 1 of `docs/workflow.md`). To do it by hand instead, inside the installed skill folder (`npx skills list -g` shows where):

```bash
npm ci
npx playwright install chromium   # only if Google Chrome is not installed
node bin/lykeion.mjs --help
```

Update with `npx skills update lykeion -g`; remove with `npx skills remove lykeion -g`.

## Use

In Claude Code, point at your slides:

> 把 `D:\course\ch3.pdf` 做成講堂

The agent follows [`docs/workflow.md`](docs/workflow.md): it asks for the depth, extracts the pages, proposes an outline for you to approve, writes the chapters, then builds and verifies. The result is one HTML file next to your PDFs, in a `lykeion/` project folder, plus a `verify-report.md`.

## What gets verified

`lykeion verify` runs these gates on every build:

| Gate | Checks |
|---|---|
| numeric | every number the page states is recomputed from its formula |
| coverage | every slide page in scope is cited by a section |
| quiz review | no quiz item can be answered from the options alone (length, absolute words, echoing the question) |
| render | the page opens without errors in light and dark themes and at 375 px, every Lab responds, the quiz can be completed |
| source | an agent compared the content with the slides and references (and says whether that review was independent) |

## Repository map

- `SKILL.md` — entry point for the agent.
- `docs/workflow.md` — the procedure; `docs/content-format.md` — the content format; `references/` — writer, outline and source-checker guides.
- `bin/`, `src/` — the CLI; `runtime/`, `labs/` — the page runtime and built-in Lab types; `palettes/` — colour schemes.
- `fixtures/sample` — original sample content used by the tests. Course slides never go in this repository.

Run the tests with `npm test`.

## License

MIT. The slides you convert remain yours and stay outside this repository.

---

## 繁體中文

把講義 PDF 轉成一個單檔、可互動的教學網頁：章節跟著投影片走、有可以拖拉的 Lab、分關的測驗，而且數字和內容在你看到之前都已經對過原始講義。

lykeion 是一個 agent skill：由 agent（Claude Code，或任何能執行 CLI、能讀圖片的 agent）撰寫內容，`lykeion` CLI 負責抽取講義、組出網頁並驗證。

> **狀態**：個人專案，照現狀分享。功能可用、有測試，但不保證持續更新；歡迎開 issue 或 PR，但不保證回覆。

### 安裝（Windows）

需要 **Node 22.13 以上**，以及 Google Chrome（或 Playwright 的 Chromium）。

```powershell
npx skills add Ch1nYu/lykeion -g -a claude-code
```

這樣就裝好了。第一次使用時，agent 會自己安裝 CLI 需要的套件（`docs/workflow.md` 第 1 步）。想手動安裝的話，到 skill 安裝的資料夾（`npx skills list -g` 會列出位置）執行：

```powershell
npm ci
npx playwright install chromium   # 已安裝 Google Chrome 就不需要
node bin\lykeion.mjs --help
```

更新：`npx skills update lykeion -g`；移除：`npx skills remove lykeion -g`。

### 使用

在 Claude Code 裡直接說：「把 `D:\課程\ch3.pdf` 做成講堂」。agent 會照 `docs/workflow.md` 進行：先問你要的深度，抽取頁面，提出大綱等你確認，再寫章節、build、verify。成品是 PDF 旁邊 `lykeion/` 資料夾裡的一個 HTML 檔，以及一份 `verify-report.md`。
