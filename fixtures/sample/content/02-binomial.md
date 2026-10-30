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
丟十枚公平銅板，每一枚自己決定正反，彼此不看別人。剛好兩枚正面有 $\binom{10}{2}=45$ 種排法；每種排法的機率都是 $(1/2)^{10}$，所以總機率是 $45/1024\approx0.044$。一般情況把十次、兩次正面換成 n 次、k 次成功，每次成功機率 p，就得到下面的公式。
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

其中 $\binom{n}{k}$ 數的是「哪幾次成功」，$p^{k}(1-p)^{n-k}$ 是其中一種排法的機率。以 $n=10$、$k=3$、$p=0.3$ 為例，$\binom{10}{3}\times0.3^3\times0.7^7\approx0.267$。換一組數字：$n=10$、$k=2$、$p=0.5$ 時是 $45/1024\approx0.044$。

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
tag: LAB C
title: 固定 n、p，選不同成功次數 k
hint: n=10、p=0.5 固定；下方長條是 k=0…10 的完整分布，移動 k 看它落在高峰還是尾巴
inputs:
  - { id: k, label: 成功次數, min: 0, max: 10, step: 1, value: 2 }
outputs:
  - { label: "P(X=k)", expr: "binomPmf(10, k, 0.5)" }
bars:
  - { label: "k=0", expr: "binomPmf(10, 0, 0.5)", max: 0.25 }
  - { label: "k=1", expr: "binomPmf(10, 1, 0.5)", max: 0.25 }
  - { label: "k=2", expr: "binomPmf(10, 2, 0.5)", max: 0.25 }
  - { label: "k=3", expr: "binomPmf(10, 3, 0.5)", max: 0.25 }
  - { label: "k=4", expr: "binomPmf(10, 4, 0.5)", max: 0.25 }
  - { label: "k=5", expr: "binomPmf(10, 5, 0.5)", max: 0.25 }
  - { label: "k=6", expr: "binomPmf(10, 6, 0.5)", max: 0.25 }
  - { label: "k=7", expr: "binomPmf(10, 7, 0.5)", max: 0.25 }
  - { label: "k=8", expr: "binomPmf(10, 8, 0.5)", max: 0.25 }
  - { label: "k=9", expr: "binomPmf(10, 9, 0.5)", max: 0.25 }
  - { label: "k=10", expr: "binomPmf(10, 10, 0.5)", max: 0.25 }
```

```quiz 二項分布
- type: num
  q: $n = 10$、$p = 0.5$，$P(X = 2)$ 是多少？（小數 3 位）
  a: 0.044
  tol: 0.002
  calc: "binomPmf(10, 2, 0.5)"
  ex: 每種排法的機率是 $0.5^{10}=1/1024$；共有 $\binom{10}{2}=45$ 種，所以 $P(X=2)=45\times1/1024=45/1024\approx0.044$。
- q: $n = 10$、$p = 0.3$，期望值是多少？
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
  - { tex: "E", say: "E 表示長期重複試驗的平均值。" }
  - { tex: "[X]", say: "X 是成功次數，所以 E[X] 是平均成功次數。" }
  - { tex: "=", say: "X 是 n 個 0/1 記錄的和，期望值可以逐項相加。" }
  - { tex: "n", say: "總共有 n 個記錄，也就是 n 次獨立試驗。" }
  - { tex: "p", say: "每個記錄的期望值是 E[Z] = 1·p + 0·(1-p) = p，n 個加起來是 np。" }
hint: 例如 n=10、p=0.5 時，平均成功次數是 5
```

以一次 0/1 試驗來看，成功（1）和失敗（0）分別離平均 p 有不同距離；把兩種平方偏差按各自機率加權後，單次變異數是 p(1-p)。n 次獨立試驗的變異數相加，就得到 $np(1-p)$。

```formula VARIANCE
tex: "Var(X) = np(1-p)"
parts:
  - { tex: "Var", say: "Var 是變異數的縮寫，表示結果散開的程度。" }
  - { tex: "(X)", say: "X 是 n 次試驗中的成功次數。" }
  - { tex: "=", say: "把各次獨立試驗的變異數加起來。" }
  - { tex: "n", say: "有 n 次獨立的 0/1 記錄，每次的散布都一樣，所以加 n 次。" }
  - { tex: "p(1-p)", say: "單次記錄的變異數：成功離平均 p 有 1-p 遠、失敗離平均 p 有 p 遠，按機率加權後就是 p(1-p)。" }
hint: 變異數越大，結果越分散；對變異數開平方得到標準差，單位就回到成功次數
```

在同一個 n 下，$p(1-p)$ 在 $p=0.5$ 時最大（$0.5 \times 0.5 = 0.25$），所以這時二項分布的變異數最大。以 $n=10$ 比較：$p=0.5$ 時變異數是 2.5、標準差約 1.58；$p=0.3$ 時變異數是 2.1、標準差約 1.45。標準差和成功次數同單位，可以讀成「結果通常離平均約幾次」。

```lab slider-calc
tag: LAB D
title: 拉動 n，比較幾個成功次數的機率
hint: 拉動 n，比較 k=3、5、7 在 p=0.5 和 p=0.3 時的機率；這六個讀值不代表完整分布
inputs: [{ id: n, label: n, min: 4, max: 20, step: 2, value: 10 }]
outputs:
  - { label: "k=3, p=0.5", expr: "binomPmf(n, 3, 0.5)" }
  - { label: "k=5, p=0.5", expr: "binomPmf(n, 5, 0.5)" }
  - { label: "k=7, p=0.5", expr: "binomPmf(n, 7, 0.5)" }
  - { label: "k=3, p=0.3", expr: "binomPmf(n, 3, 0.3)" }
  - { label: "k=5, p=0.3", expr: "binomPmf(n, 5, 0.3)" }
  - { label: "k=7, p=0.3", expr: "binomPmf(n, 7, 0.3)" }
```

要用常態分布近似二項分布，先看成功和失敗兩種結果的期望次數是否都夠大：

```lab slider-calc
tag: LAB E
title: 拉動 n 與 p，看常態近似什麼時候可以用
hint: 兩個期望次數都要 ≥ 5 是常用經驗法則；本 Lab 只檢查這個判準，不顯示分布或近似誤差
inputs:
  - { id: n, label: n, min: 4, max: 40, step: 1, value: 10 }
  - { id: p, label: p, min: 0.05, max: 0.95, step: 0.05, value: 0.3 }
outputs:
  - { label: np, expr: "n * p" }
  - { label: "n(1-p)", expr: "n * (1 - p)" }
  - { label: 判準, expr: "n * p >= 5 && n * (1 - p) >= 5 ? 1 : 0", labels: { "1": "符合經驗法則", "0": "未達經驗法則" } }
verdict:
  - { when: "n * p < 5", text: "np 小於 5，未符合常用經驗法則；本 Lab 只顯示判準，不代表實際分布形狀。" }
  - { when: "n * (1 - p) < 5", text: "n(1-p) 小於 5，未符合常用經驗法則；本 Lab 只顯示判準，不代表實際分布形狀。" }
  - { when: "n * p >= 5 && n * (1 - p) >= 5", text: "兩個期望次數都達到常用經驗門檻；這是篩選條件，不代表近似一定準確，也不是近似誤差的直接測量。" }
```

```lab stepper
tag: LAB F
title: 看 C(10,2) 這 45 種排法怎麼來
hint: 每次試驗結果只有成功或失敗；成功算入 k，失敗算入 n-k
legend: { good: 成功，計入 k, muted: 失敗，計入 n-k, info: 計數 }
steps:
  - label: 一次試驗
    text: 以抽檢零件為例：先約定「合格」算成功，每個零件合格的機率是 p。每次試驗只有成功或失敗兩種結果。
    chips:
      - { text: "合格：成功", state: good, note: "計入 k" }
      - { text: "不合格：失敗", state: muted, note: "計入 n-k" }
  - label: n 次試驗分兩類
    text: 抽檢 n=10 個零件，結果剛好 k=2 個合格、n-k=8 個不合格。
    chips:
      - { text: "成功 k = 2", state: good }
      - { text: "失敗 n-k = 8", state: muted }
      - { text: "共 n = 10 次", state: info }
  - label: 數排列、算機率
    text: 2 個成功可以落在 10 次中的任何位置，有 C(10,2)=45 種排列。p=0.5 時每一種排列的機率都是 $0.5^{2} \times 0.5^{8} = 1/1024$，合起來就是 $45/1024\approx0.044$。
    chips:
      - { text: "45 種排列", state: info, note: "C(10,2)" }
      - { text: "每種機率 1/1024", state: info }
      - { text: "總機率 0.044", state: good }
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
