# Handoff — 範例講堂驗收

## 2026-11-05 PR #1 處理完：搬了 4 項，其餘不搬

PR #1（分支 `claude/pensive-goodall-gm0lsy`）是 10/27 雲端 session 依 `2026-10-27-lykeion-改進建議.md` 開的，之後沒合併，`main` 又走了 40 多個 commit。整個合併會有 6 個檔案、13 處衝突，所以照 field report 的優先順序逐項搬。每項先在 `main` 重現，再拿 13 個真實專案量搬前搬後的差別。PR 關閉，分支保留。

**搬了：**

- 第 6 項，TeX 控制字元：`d453aed`。真實專案 0 誤報。
- 第 5 項，Lab verdict 檢查：`deae855`。碩論網站、資料探勘網站共 8 個 ⚠，抽查 4 個都是真的問題。
- 第 7 項，`§` 引用：`67ceb16`，只搬一半。指到 `###` 小標會讓建置失敗：10/26 的碩論內容 `§4.5` 抓得到，0 誤報。指到不存在的編號這一半不搬：13 個專案 10 個錯誤、0 個真問題，都是群組編號（`§4.3` 涵蓋 `§4.3.1`–`§4.3.4`）或引用別的著作。
- 第 1、2 項，審稿說明：`401a985`，只搬說明文件，改成配合 `main` 的 follow-up round。審稿者寫到 brief 指定的檔案，不開舊報告（follow-up round 指定的第 1 輪結果除外）。完整審查開始前，把舊結果移到 `_work/`。

**不搬：**

- 第 1、2 項的 gate 讀分章檔：會把 `teaching-review-round1.md` 當成同一份審查的失敗分章；資料探勘網站的 source gate 會從通過變成失敗。
- 第 10 項 `## Fixed after review`：`main` 已用另一種方式處理（`4519e32`，到輪數上限且每個 must-fix 都有回應就結案），兩者規則衝突。
- emoji 測試修正：`main` 已由 `2aa273e` 重做。
- skip link 第一個 Tab 停點（`5509d3b`）：`main` 上重現不了；CI 兩個系統、本機 Chromium 都通過。
- 第 3 項 Checked 清單、第 4 項 `lykeion labs`、第 8、9 項截圖、第 11 項 `implementation` 欄位：這次沒有量，也沒有已知的失敗案例。第 4 項是新指令、第 11 項是 `lykeion.json` 新欄位，都算公開介面變更。之後需要時，從 PR 分支取用。

## 2026-11-01 結案：範例講堂審查迴圈已關閉

**狀態：結案，沒有待辦。** 下面每一項都是已完成，或是已經做出的決定。

### 收尾規則（之後照這條做，不再重議）

- 只有「讀者會讀錯」才算 must-fix：事實錯、方向錯、誤導的類比或措辭、結論排在前提之前、缺了做題必要的步驟。
- 多一張卡、換一種 Lab 設計、措辭偏好、延伸內容、算例，一律當 suggestion，不做。
- 審查迴圈的上限：最後一輪審查 → 照上面的界線修完 → 結案，不再為了拿到 `STATUS: pass` 加審。workflow 原本規定最多 2 輪，這次跑了 16 輪，每輪新審稿員都會挑出新東西，加審不會收斂。

### 第 14–16 輪修了什麼

- 第 14 輪：CONDITIONAL／BAYES 拿掉 frac 自己的 say，併入分母 say。點選順序改成 分子→分母→結論。
- 第 15 輪：EXPECTATION 的 `n` 類比改成「n 把尺的平衡點 p 相加是 np」，原本的「疊在同一把尺上」重心推不出 np。§2.2 常態近似補上代入方式：中心 $np$、寬度 $\sqrt{np(1-p)}$、$z$ 查表。
- 第 16 輪 teaching：LAB D verdict 拿掉「連續」，原本會讓讀者以為只算連續的成功，改成「離平均的 5 次很遠，組合很少」。常態近似補一句「查到的是 $P(X \le k)$ 的近似值，不是 $P(X = k)$」。審稿員另外建議做 NORMAL 公式卡和 $P(X \le 6)$ 算例，屬延伸內容，決定不做。
- 第 16 輪 visual：EXPECTATION／VARIANCE 的零件間距太大，`E [X]`、`n p` 看起來像分開的符號。在 `runtime/base.css` 讓第一層 `.piece` 用 `margin-inline:-3px` 收回左右 padding，高亮框和點擊範圍不變。截圖確認 `E[X] = np` 已經排在一起，分數公式不受影響。
- 第 15 輪 visual 剩的「手機第三格讀數半寬」實測是撐滿的，判定為誤判，不改。
- 第 14–16 輪全部 suggestion（第 16 輪 teaching 11 項、visual 9 項）決定不做。清單在兩份報告裡，只供參考，不是待辦。

### 最終驗證（同一個 build）

- `lykeion verify`：numeric 36/36、coverage、quiz review、teaching 13、render 39 全 ✓；source 不適用（sample.pdf 是 placeholder）。
- teaching review／visual review 顯示 ✗，因為 `fixtures/sample/teaching-review.md`、`visual-review.md` 是第 16 輪對「修正前」build 的評語。照收尾規則不再加審。STATUS 不要手改。
- `npm test` 292/292。原本那 3 個「已知失敗」修好了：`test/visual-review.test.mjs` 的 `sampleCopy()` 會把本機未追蹤的審查檔一起複製過去，現在複製後會先刪掉 `source-check.md`、`teaching-review.md`、`visual-review.md`。fixture 裡有兩份 fail 報告的情況下驗證過。
- 舊審查報告在 `.worker/old-reviews/`（r16 是第 15 輪的報告）。

### 雷

- 在 Bash 工具裡用 python／sed／perl 寫 `\\f`，反斜線會被吃掉一層，`\frac` 會變成 form feed（`0x0c`）加 `rac`，結果 build 失敗、npm test 一次掛掉 64 個。改用 Edit 工具或 perl 的 `chr(92)`。
- 啟動 Pi 審稿員時，不要用 pi-worker 的 `launch.sh`（那是 implement 用的）。改用 `hc run --bg --name <n> --cwd <repo> pi --no-extensions --no-skills "Read the file .worker/brief-teaching.txt and do exactly what it says."`，一輪大約 25 分鐘。

## 2026-11-01 更新：10 輪獨立審查，暫停待決

- 使用者要求「照正確流程全過」。之後共跑了 10 輪 teaching + visual 獨立審查（Pi，全新 session，只給 brief；每輪開審前舊報告移到 `.worker/old-reviews/roundN/`）。
- teaching must-fix 依序 7→11→4→5→6→2→1→2→3；visual 4→3→3→1→3→2→1→1→3。每輪新審查者都找到新問題，**沒有收斂**；第 10 輪 visual 的 stepper 要求（手機上讓高度跟著步驟變）和第 8 輪的置中修法、render gate「Lab 不可變高」互相矛盾。
- 已 commit、**未 push** 14 個 commit（`git log origin/main..HEAD`）：runtime 讀數格、單一閱讀欄、bar `active`、手機浮動按鈕、滑桿拉寬、prose card 寬度、stepper 置中；sample 8 個 Lab 重新設計與各輪內容修正。
- 第 10 輪未修：visual 3 項（LAB H 的 bars 需要 runtime 支援 `k=0..n` 動態範圍；行內數學後的「。」會單獨換行；stepper 手機空白帶）。teaching 第 10 輪 3 項已修，但未再審。
- 機器 gate：numeric 36/36、coverage、quiz review、teaching 13、render 42 全 ✓；`npm test` 262/265，3 個失敗是 fixture 內未追蹤的 `visual-review.md` 造成（已知）。

## 2026-10-31 更新（Claude 接手）

- 10/24 的 4 項 must-fix 已修（期望值推導、方差限定同一 n、LAB F 改抽檢例子、LAB E 標籤改「符合／未達經驗法則」），PLAN 的 LAB C TODO 已更新。
- 之後又跑了 2 輪獨立 teaching review（Pi），must-fix 從 7 項變 11 項，標準一直上升；依 workflow「最多 2 輪」停止。第 2 輪 7 項全修；第 3 輪只修了措辭與正確性（表格前置 P(A)/P(B)、0.75 開頭問句、erratum、重複的 0.267、quiz 解析、VARIANCE 切成 n 與 p(1-p)）。
- **第 3 輪未修（需要決定）**：LAB C 長條無法標出目前的 k（runtime 沒有 bar 高亮功能）、LAB D 加 verdict、LAB E 加分布形狀、LAB F 移到 §2.1、§2.2 加一個看變異數的 Lab。完整報告：`fixtures/sample/teaching-review.md`。
- **Visual review fail**：3 項 runtime must-fix（LAB D 六格在桌機排 5 欄、手機一欄一格；正文欄寬只到 1019px 而 Lab 到 1262px）屬於 skill runtime，跟 10/24 在資料探勘講堂改過、但已遺失的 runtime 修正是同一類；1 項 content（§1.2 畫出 0.009／0.099 分割長條）。報告：`fixtures/sample/visual-review.md`（審的是第 3 輪措辭修改前的截圖，版面無差異）。
- 機器 gate：numeric 36/36、coverage、quiz review、teaching 13、render 40 全 ✓；source 仍因缺來源 disputed。內容修改尚未 commit。舊審查報告在 `.worker/old-reviews/`（未追蹤）。

---

日期：2026-10-24  
Repo：`C:\active\proj\lykeion`  
目前 HEAD：`efa9595 chore(fixtures): refresh the sample verify report`

## 狀態

範例內容仍在迭代，**尚未驗收完成**。最新獨立 teaching review 是 `STATUS: fail`，列出 3 項 must-fix；`source-check.md` 也因 sample fixture 缺原始頁與 References 而有 1 項 disputed。最近一次 `verify` 是更早的內容版本：numeric、coverage、quiz、teaching、render 通過，但 source 與 teaching review 失敗。最新內容修改後尚未重新 build、verify 或跑全套測試，因此不能引用舊報告宣稱目前通過。

## 最新待修問題

1. **補完整期望值推導**（`fixtures/sample/content/02-binomial.md`，§2.2）：從單次 0/1 結果 `Z` 寫出 `E[Z] = 1·p + 0·(1-p) = p`，再說 `X = Z₁ + … + Zₙ`、期望值可加，因此 `E[X] = np`。以 `n=10, p=0.5` 算出平均 5 次。
2. **精確表述方差與寬度**（同檔 §2.2）：限定固定 `n`，說明 `p(1-p)` 在 `p=0.5` 最大，因此二項分布方差在此最大。不要直接把方差最大稱作分布最寬，除非用圖或標準差比較支持。
3. **LAB F 使用一般試驗語境**（同檔 §2.2）：移除「正面／反面」的銅板限定，改用一般成功／失敗例子，並呈現 `n` 次如何分成 `k` 次成功與 `n-k` 次失敗。
4. **更新 LAB E 的輸出標籤**（同檔 §2.2）：目前輸出標籤仍是「可用常態近似／還不行」，容易被理解成保證。建議改為「符合經驗法則／未符合經驗法則」；提示與 verdict 已說明 `np`、`n(1-p) ≥ 5` 只是經驗法則，不直接測量誤差。

最新審查報告：`fixtures/sample/teaching-review.md`。其中也有建議事項（非 must-fix）：§1.1 條件機率 formula parts 的解說順序可先桌布分母再交集；獨立性表格可先交代固定邊際機率；LAB C 目前每次只顯示單一 `P(X=k)`，若要展示整體分布可增加離散長條圖；§2.1 例子可先完整算公平銅板例再切換參數；§2.2 LAB D 可補上兩組平均位置；§2.2 標題含「圖形」但 Labs 沒有完整分布圖，可考慮調整標題或新增圖。

## Source review 限制

`fixtures/sample/source-check.md` 的獨立 reviewer 無法核對來源：`fixtures/sample/lykeion.json` 引用 placeholder `sample.pdf`，但 fixture 沒有 `pages/` 原始頁，也沒有 `references` 欄位。報告目前列 1 項 disputed，不能標成 source pass。後續要補可公開授權且可引用的來源材料，或設計原創 sample 的明確 not-applicable gate 結果；不可在缺少來源時假稱已完成查核。

這項限制已記在 `docs/PLAN.md` 的 M6 Sample verification TODO。

## 已做的修改

- `fixtures/sample/content/01-conditional.md`：修正條件機率與獨立性的說明、限制 Lab A 的合法範圍並修正判準、補 Bayes 數值推導和選項解說。
- `fixtures/sample/content/02-binomial.md`：拆解 PMF、補 worked examples 與變異數/標準差說明；LAB C 已改成固定 `n,p`、整數成功次數的 slider-calc；LAB D 已改成六個指定離散機率讀值；LAB E 加入經驗法則限制；LAB F 已改成排列數例子，但 reviewer 指出仍用「正面／反面」措辭，待修。
- `fixtures/sample/verify-report.md`、`source-check.md`、`teaching-review.md`、`visual-review.md` 與 `shots/` 是驗收產物，需在最終 build 後重生/重審。

## 驗證紀錄與限制

- 曾在較早迭代跑過 `npm test`：235 pass / 0 fail；不是最新內容版本的結果，最終修改後尚未重跑。
- 曾在較早迭代跑過 build/verify：機器 gate 一度全過（numeric 29/29、teaching 13、render 40），但報告已因後續內容修改而過時。
- 最近一次 full review 檢查過 8 張最新截圖、公式互動與 6 個 Lab；reviewer 回報互動均有反應且沒有 page error。之後又有內容修改，截圖/審查應再次刷新。
- 外層 `fixtures/sample/shots/` 有 8 張圖；某次 reviewer 另產生巢狀目錄 `fixtures/sample/fixtures/sample/shots-current/`（8 張圖）。這是額外產物，不是 CLI 預期輸出路徑；完成驗收時檢查並清理/忽略它。
- Herdr 啟動的 Codex agent 曾立即退出，initial prompt 部分文字留在 pane；後續透過獨立 reviewer session 完成審查。不要把舊 pane 的文字當成已送達任務。

## 接手步驟

1. 先讀本檔、最新 `fixtures/sample/teaching-review.md`、`source-check.md` 和目前兩份 chapter Markdown；不要依賴舊 `verify-report.md`。
2. 修完 4 項 must-fix，並更新 `docs/PLAN.md` 中已過時的 LAB C「connected curve」TODO，使它反映目前是離散 slider/readout、仍欠完整分布可視化的狀態。
3. 執行 `node bin/lykeion.mjs build fixtures/sample`；修正任何 build error。
4. 執行 `node bin/lykeion.mjs shots fixtures/sample`，再做獨立 teaching 與 visual review，確認 reviewer 看的是最新 build 和 shots；修正所有 must-fix，迭代至兩份 review 均為 `STATUS: pass`。
5. 執行 `node bin/lykeion.mjs verify fixtures/sample`。機器 gates 全綠；若 source 因缺料仍 disputed，保留並在結果中明確說明，直到 source 材料或 not-applicable 設計完成。
6. 執行 `npm test`、`git diff --check`，檢查差異和產生物，更新 `verify-report.md`；確認結果與報告均對應同一個最終 build。
7. 最後報告剩餘的非阻斷 suggestions、source 限制，以及所有未執行或失敗的檢查。未完成前不要宣稱「完全沒問題」。
