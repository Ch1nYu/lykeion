---
chapter: 2
title: 二項分布與期望值
short: 二項分布
subtitle: The binomial distribution and expectation
summary: 二項機率、期望值與變異數，以及常態近似的經驗法則
source: sample.pdf
---

## 2.1 二項分布的機率質量函數 {pages=4}

```analogy 十枚銅板各自很任性
丟十枚公平銅板，每一枚自己決定正反，彼此不看別人。剛好兩枚正面有 $\binom{10}{2}=45$ 種排法（這裡的「排法」指哪幾枚是正面，不看先後）；每種排法的機率都是 $(1/2)^{10}$，所以總機率是 $45/1024\approx0.044$。一般情況把十次、兩次正面換成 n 次、k 次成功，每次成功機率 p，就得到下面的公式。
```

重複 $n$ 次獨立且成功機率同為 $p$ 的試驗，成功次數 $X$ 的機率是

```formula BINOM
tex: "P(X = k) = \\binom{n}{k} p^{k} (1-p)^{n-k}"
parts:
  - { tex: "P(X = k)", say: "剛剛好 k 次成功的機率。" }
  - { tex: "=", say: "它由成功次數的排列方式和每種排列的機率相乘得到。" }
  - { tex: "\\binom{n}{k}", say: "n 次裡選 k 次成功，有幾種排法。" }
  - { tex: "p^{k}(1-p)^{n-k}", say: "每種排法都要把 k 次成功機率 p 與 n-k 次失敗機率 1-p 相乘。" }
hint: 先看有幾種排法，再看每種排法的機率
```

把每個 k 對應到的機率列成一張表、或畫成一排長條，這張表就叫**機率質量函數**；上面的式子是它的公式，後面 LAB E 的長條圖就是這張表。其中 $\binom{n}{k}$ 數的是「哪幾次成功」，$p^{k}(1-p)^{n-k}$ 是其中一種排法的機率。以 $n=10$、$k=3$、$p=0.3$ 為例，$\binom{10}{3}\times0.3^3\times0.7^7\approx0.267$。換一組數字：$n=10$、$k=2$、$p=0.5$ 時是 $45/1024\approx0.044$。

```lab stepper
tag: LAB D
title: 看 C(10,2) 這 45 種情況怎麼來
hint: 每次試驗結果只有成功或失敗；成功算入 k，失敗算入 n-k
legend: { good: 成功，計入 k, info: 失敗（計入 n-k）與計數 }
steps:
  - label: 一次試驗
    text: 以十枚銅板為例：先約定「正面」算成功，每一枚正面朝上的機率是 p。換成別的試驗也一樣，先說好哪一種結果算成功。
    chips:
      - { text: "正面：成功", state: good, note: "計入 k" }
      - { text: "反面：失敗", state: info, note: "計入 n-k" }
  - label: 分兩類
    text: 丟 n=10 枚銅板，結果剛好 k=2 枚正面、n-k=8 枚反面。
    chips:
      - { text: "成功 k = 2", state: good }
      - { text: "失敗 n-k = 8", state: info }
      - { text: "共 n = 10 次", state: info }
  - label: 算機率
    text: 10 個位置先挑第 1 個成功，有 10 種選法；再挑第 2 個，剩 9 種。但先挑第 3 個位置、再挑第 7 個，和先挑第 7 個、再挑第 3 個，挑到的是同一組位置；每一組都被算了兩次，所以要除以 2：$10 \times 9 / 2 = 45$ 種。p=0.5 時每一種排法的機率都是 $0.5^{2} \times 0.5^{8} = 1/1024$，合起來就是 $45/1024\approx0.044$。
    chips:
      - { text: "10 × 9 / 2 = 45", state: info, note: "C(10,2)" }
      - { text: "每種機率 1/1024", state: info }
      - { text: "總機率 0.044", state: good }
```

```calc
- { expr: "binomPmf(10, 2, 0.5)", expect: 0.044, note: "fair coin, exactly two heads in ten" }
- { expr: "binomPmf(10, 3, 0.3)", expect: 0.267 }
- { expr: "10*0.3*(1-0.3)", expect: 2.1, note: "variance distractor in the expectation quiz" }
- { expr: "10*(1-0.3)", expect: 7, note: "expected failures distractor in the expectation quiz" }
```

同樣的計算寫成 Python 只要幾行，變數與數字都和上面同一題（$n = 10$、$k = 2$、$p = 0.5$）：其中一種排法的機率是 $(0.5)^2(0.5)^8=1/1024$，再乘上 45 種排法，得到 $\binom{10}{2}(0.5)^2(0.5)^8=45/1024 \approx 0.044$。
```python from="example" title="示範：二項 pmf，公平硬幣十次中兩次正面"
from math import comb

n, k, p = 10, 2, 0.5
pmf = (
    comb(n, k) * p ** k
    * (1 - p) ** (n - k)
)
print(round(pmf, 3))  # 0.044
```

上面這段印出的結果是：

```text title="輸出"
0.044
```

```lab slider-calc
tag: LAB E
title: 固定 n、p，選不同成功次數 k
hint: n=10、p=0.5 固定；下方長條是 k=0…10 的完整分布，移動 k 看標出的那一根落在高峰還是尾巴
inputs:
  - { id: k, label: 成功次數, min: 0, max: 10, step: 1, value: 2 }
outputs:
  - { label: "P(X=k)", expr: "binomPmf(10, k, 0.5)" }
bars:
  - { label: "k=0", expr: "binomPmf(10, 0, 0.5)", max: 0.25, active: "k == 0" }
  - { label: "k=1", expr: "binomPmf(10, 1, 0.5)", max: 0.25, active: "k == 1" }
  - { label: "k=2", expr: "binomPmf(10, 2, 0.5)", max: 0.25, active: "k == 2" }
  - { label: "k=3", expr: "binomPmf(10, 3, 0.5)", max: 0.25, active: "k == 3" }
  - { label: "k=4", expr: "binomPmf(10, 4, 0.5)", max: 0.25, active: "k == 4" }
  - { label: "k=5", expr: "binomPmf(10, 5, 0.5)", max: 0.25, active: "k == 5" }
  - { label: "k=6", expr: "binomPmf(10, 6, 0.5)", max: 0.25, active: "k == 6" }
  - { label: "k=7", expr: "binomPmf(10, 7, 0.5)", max: 0.25, active: "k == 7" }
  - { label: "k=8", expr: "binomPmf(10, 8, 0.5)", max: 0.25, active: "k == 8" }
  - { label: "k=9", expr: "binomPmf(10, 9, 0.5)", max: 0.25, active: "k == 9" }
  - { label: "k=10", expr: "binomPmf(10, 10, 0.5)", max: 0.25, active: "k == 10" }
verdict:
  - { when: "k == 5", text: "k=5 是高峰（0.246）：成功一半最常見。" }
  - { when: "k <= 2 || k >= 8", text: "這一根在尾巴：要連續偏向成功或失敗，排法很少，機率很小。" }
  - { when: "true", text: "這一根在高峰旁邊：離 k=5 越遠，排法越少，長條越短。" }
```

```quiz 二項分布
- type: num
  q: $n = 10$、$p = 0.5$，$P(X = 2)$ 是多少？（小數 3 位）
  a: 0.044
  tol: 0.002
  calc: "binomPmf(10, 2, 0.5)"
  ex: 每種排法的機率是 $0.5^{10}=1/1024$；共有 $\binom{10}{2}=45$ 種，所以 $P(X=2)=45\times1/1024=45/1024\approx0.044$。
- q: $n = 10$、$p = 0.3$，期望值是多少？
  sec: "2.2"
  o: [3, 0.3, 7, 2.1]
  a: 0
  ex: $E[X]=np=10\times0.3=3$，因為每次成功機率是 0.3，做十次後平均成功 3 次；0.3 是單次成功率；2.1 是變異數 $np(1-p)$，衡量結果散布，不是平均；7 是 $n(1-p)$，是平均失敗次數。
```

## 2.2 期望值與變異數 {pages=4}

```analogy 重心與寬度
期望值像一把尺上的平衡點：把每個結果放在它的位置上、按機率配重量，尺會在期望值那一點平衡。變異數則量這些重量離平衡點散得多開。
```

先看一次試驗。令成功時記 $Z=1$、失敗時記 $Z=0$，它的期望值是兩個結果按機率加權：$E[Z] = 1 \cdot p + 0 \cdot (1-p) = p$。

n 次試驗的成功次數就是 n 個記錄相加：$X = Z_1 + Z_2 + \dots + Z_n$。期望值可以逐項相加，每一項都是 p，所以 $E[X] = p + p + \dots + p = np$。例如 $n=10$、$p=0.5$ 時，平均成功 $10 \times 0.5 = 5$ 次。

```formula EXPECTATION
tex: "E[X] = np"
parts:
  - { tex: "E", say: "把尺放平、讓它自己找到平衡點：所有結果按機率配重後求重心。" }
  - { tex: "[X]", say: "放上尺的是成功次數 X，所以平衡點就是平均成功次數。" }
  - { tex: "=", say: "X 是 n 枚銅板的 0/1 記錄相加，平衡點也可以一枚一枚相加。" }
  - { tex: "n", say: "n 枚銅板疊在同一把尺上，每枚的平衡點都一樣，合起來就放大 n 倍。" }
  - { tex: "p", say: "單枚銅板的平衡點：1 和 0 按 p 與 1-p 配重，E[Z] = 1·p + 0·(1-p) = p。" }
hint: 例如 n=10、p=0.5 時，平均成功次數是 5
```

以一次 0/1 試驗來看，成功（1）和失敗（0）分別離平均 p 有不同距離；把兩種平方偏差按各自機率加權後，單次變異數是 p(1-p)。n 次獨立試驗的變異數相加，就得到 $np(1-p)$。

```formula VARIANCE
tex: "Var(X) = np(1-p)"
parts:
  - { tex: "Var", say: "量重量離平衡點擺得多開：離得越遠、配重越多，數字越大。" }
  - { tex: "(X)", say: "量的是成功次數 X 在尺上的擺幅，單位是「次數的平方」。" }
  - { tex: "=", say: "銅板互不影響，各自的擺幅可以直接相加。" }
  - { tex: "n", say: "n 枚互不影響的銅板，每枚擺得一樣開，相加就是 n 倍。" }
  - { tex: "p(1-p)", say: "單次記錄的變異數：成功離平均 p 有 1-p 遠、失敗離平均 p 有 p 遠；把這兩個距離各自平方、再按機率加權，就是 p(1-p)。" }
hint: 變異數越大，結果越分散；對變異數開平方得到標準差，單位就回到成功次數
```

在同一個 n 下，$p(1-p)$ 在 $p=0.5$ 時最大（$0.5 \times 0.5 = 0.25$），所以這時二項分布的變異數最大。以 $n=10$ 比較：$p=0.5$ 時變異數是 2.5、標準差約 1.58；$p=0.3$ 時變異數是 2.1、標準差約 1.45。標準差和成功次數同單位，可以讀成「結果通常離平均約幾次」。

```lab slider-calc
tag: LAB F
title: 拉動 p，看變異數什麼時候最大
hint: n=10 固定；拉動 p，看 p(1-p) 和變異數怎麼跟著變
inputs: [{ id: p, label: p, min: 0.05, max: 0.95, step: 0.05, value: 0.3 }]
outputs:
  - { label: "p(1-p)", expr: "p * (1 - p)" }
  - { label: "Var(X)", expr: "10 * p * (1 - p)" }
  - { label: 標準差, expr: "sqrt(10 * p * (1 - p))" }
bars:
  - { label: "Var(X)", expr: "10 * p * (1 - p)", max: 2.5 }
verdict:
  - { when: "p == 0.5", text: "p(1-p) 在這裡最大（0.25），所以 n 相同時，p=0.5 的結果最散。" }
  - { when: "p <= 0.2", text: "p 很小：幾乎每次都失敗，成功次數擠在 0 附近，所以變異數小。" }
  - { when: "p >= 0.8", text: "p 很大：幾乎每次都成功，成功次數擠在 n 附近，所以變異數也小。" }
  - { when: "p < 0.5", text: "p 往 0.5 靠近時，成功和失敗都常出現，成功次數散得更開；往右拉，變異數越來越大。" }
  - { when: "true", text: "p 超過 0.5 以後，成功越來越常發生，結果擠向 n；往右拉，變異數反而變小。" }
```

變異數說的是散布；分布的高峰則落在期望值 $np$ 附近。下面固定看 k=3、5、7 三個位置，拉動 n 讓 np 移動：

```lab slider-calc
tag: LAB G
title: 拉動 n，看哪一格的機率最大
hint: 拉動 n，看兩組長條裡被標出的最大那一根，和上方的 np 比一比
inputs: [{ id: n, label: n, min: 4, max: 20, step: 2, value: 10 }]
outputs:
  - { label: "np, p=0.5", expr: "n * 0.5" }
  - { label: "np, p=0.3", expr: "n * 0.3" }
bars:
  - { label: "p=0.5, k=3", expr: "binomPmf(n, 3, 0.5)", max: 0.35, active: "binomPmf(n, 3, 0.5) >= binomPmf(n, 5, 0.5) && binomPmf(n, 3, 0.5) >= binomPmf(n, 7, 0.5)" }
  - { label: "p=0.5, k=5", expr: "binomPmf(n, 5, 0.5)", max: 0.35, active: "binomPmf(n, 5, 0.5) >= binomPmf(n, 3, 0.5) && binomPmf(n, 5, 0.5) >= binomPmf(n, 7, 0.5)" }
  - { label: "p=0.5, k=7", expr: "binomPmf(n, 7, 0.5)", max: 0.35, active: "binomPmf(n, 7, 0.5) >= binomPmf(n, 3, 0.5) && binomPmf(n, 7, 0.5) >= binomPmf(n, 5, 0.5)" }
  - { label: "p=0.3, k=3", expr: "binomPmf(n, 3, 0.3)", max: 0.35, active: "binomPmf(n, 3, 0.3) >= binomPmf(n, 5, 0.3) && binomPmf(n, 3, 0.3) >= binomPmf(n, 7, 0.3)" }
  - { label: "p=0.3, k=5", expr: "binomPmf(n, 5, 0.3)", max: 0.35, active: "binomPmf(n, 5, 0.3) >= binomPmf(n, 3, 0.3) && binomPmf(n, 5, 0.3) >= binomPmf(n, 7, 0.3)" }
  - { label: "p=0.3, k=7", expr: "binomPmf(n, 7, 0.3)", max: 0.35, active: "binomPmf(n, 7, 0.3) >= binomPmf(n, 3, 0.3) && binomPmf(n, 7, 0.3) >= binomPmf(n, 5, 0.3)" }
verdict:
  - { when: "n == 10", text: "n=10：p=0.5 那組標出 k=5（np=5），p=0.3 那組標出 k=3（np=3）。被標出的那根，就是三格裡最靠近 np 的 k。" }
  - { when: "true", text: "每組被標出的那根，都是三格裡最靠近 np 的 k；np 往右移，標記也跟著換到右邊。這裡只抽三格，真正的高峰在最接近 np 的整數附近。" }
```

要用常態分布近似二項分布，先看成功和失敗兩種結果的期望次數是否都夠大。兩個期望次數都 ≥ 5 時，分布的兩端才不會被 0 或 n 擋住，長條圖才會接近左右對稱的鐘形。上一節 n=10、p=0.5 的長條圖，兩個期望次數都是 5，左右已經對稱。

```lab slider-calc
tag: LAB H
title: 檢查常態近似的經驗法則
hint: 拉動 n 與 p，看下方 k=0…n 的長條什麼時候像鐘形；np 與 n(1-p) 都 ≥ 5 是常用經驗法則
inputs:
  - { id: n, label: n, min: 4, max: 20, step: 1, value: 10 }
  - { id: p, label: p, min: 0.05, max: 0.95, step: 0.05, value: 0.3 }
outputs:
  - { label: np, expr: "n * p" }
  - { label: "n(1-p)", expr: "n * (1 - p)" }
  - { label: 判準, expr: "n * p >= 5 && n * (1 - p) >= 5 ? 1 : 0", labels: { "1": "符合經驗法則", "0": "未達經驗法則" } }
bars:
  - { label: "k=0", expr: "binomPmf(n, 0, p)" }
  - { label: "k=1", expr: "binomPmf(n, 1, p)" }
  - { label: "k=2", expr: "binomPmf(n, 2, p)" }
  - { label: "k=3", expr: "binomPmf(n, 3, p)" }
  - { label: "k=4", expr: "binomPmf(n, 4, p)" }
  - { label: "k=5", expr: "binomPmf(n, 5, p)" }
  - { label: "k=6", expr: "binomPmf(n, 6, p)" }
  - { label: "k=7", expr: "binomPmf(n, 7, p)" }
  - { label: "k=8", expr: "binomPmf(n, 8, p)" }
  - { label: "k=9", expr: "binomPmf(n, 9, p)" }
  - { label: "k=10", expr: "binomPmf(n, 10, p)" }
  - { label: "k=11", expr: "binomPmf(n, 11, p)" }
  - { label: "k=12", expr: "binomPmf(n, 12, p)" }
  - { label: "k=13", expr: "binomPmf(n, 13, p)" }
  - { label: "k=14", expr: "binomPmf(n, 14, p)" }
  - { label: "k=15", expr: "binomPmf(n, 15, p)" }
  - { label: "k=16", expr: "binomPmf(n, 16, p)" }
  - { label: "k=17", expr: "binomPmf(n, 17, p)" }
  - { label: "k=18", expr: "binomPmf(n, 18, p)" }
  - { label: "k=19", expr: "binomPmf(n, 19, p)" }
  - { label: "k=20", expr: "binomPmf(n, 20, p)" }
verdict:
  - { when: "p <= 0.2 && n * p < 5", text: "p 很小、np 又不到 5：成功真的很罕見，分布擠向 0，右邊拖一條長尾。" }
  - { when: "p >= 0.8 && n * (1 - p) < 5", text: "p 很大、n(1-p) 又不到 5：失敗真的很罕見，分布擠向 n，左邊拖一條長尾。" }
  - { when: "n * p < 5 || n * (1 - p) < 5", text: "有一個期望次數不到 5，不符合經驗法則：鐘形的一邊可能被 0 或 n 削掉，但不代表分布一定歪，例如 n=10、p=0.4 只是剛好落在邊界。" }
  - { when: "true", text: "兩個期望次數都 ≥ 5：兩端都有空間，形狀接近鐘形。這是篩選條件，不保證近似一定準確。" }
```

```calc
- { expr: "10*0.3", expect: 3, note: "E[X] = np" }
- { expr: "10*0.3*(1-0.3)", expect: 2.1, note: "Var(X) = np(1-p)" }
- { expr: "binomPmf(20, 10, 0.5)", expect: 0.176 }
- { expr: "2.1", expect: 2.1, note: "variance distractor in the expectation quiz" }
- { expr: "sqrt(2.1)", expect: 1.45 }
- { expr: "5/10", expect: 0.5, note: "expected successes and failures when n=10, p=0.5" }
- { expr: "45/1024", expect: 0.044, note: "probability of exactly two successes in ten trials with p=0.5" }
- { expr: "1*0.5 + 0*(1-0.5)", expect: 0.5, note: "E[Z] for one 0/1 trial" }
- { expr: "10*0.5", expect: 5, note: "E[X] when n=10, p=0.5" }
- { expr: "0.5*(1-0.5)", expect: 0.25, note: "p(1-p) is largest at p=0.5" }
- { expr: "10*0.5*(1-0.5)", expect: 2.5, note: "Var(X) when n=10, p=0.5" }
- { expr: "sqrt(2.5)", expect: 1.58 }
```

```takeaway
期望值 np 是長期平均成功次數；p 是單次成功率，變異數 np(1-p) 則描述成功次數散得多開。
```

```quiz 二項分布
- q: 什麼時候適合用常態分布近似二項分布？
  o: [np 與 n(1-p) 都夠大時, n 大於 30 且 p 任意時, p 接近 0.5 而 n 很小時, np 大於 1 且 p 很小時]
  a: 0
  ex: 兩個期望次數都夠大，鐘形才會成形；例如 $n=30$、$p=0.01$ 時，$np=0.3$，所以只看 n 大於 30 並不足夠。
```
