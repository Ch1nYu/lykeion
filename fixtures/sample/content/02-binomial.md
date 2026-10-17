---
chapter: 2
title: 二項分布與期望值
short: 二項分布
subtitle: The binomial distribution and expectation
summary: 二項機率、期望值與變異數，以及常態近似的形狀
source: sample.pdf
---

## 2.1 二項分布的機率質量函數 {pages=4}

重複 $n$ 次獨立且成功機率同為 $p$ 的試驗，成功次數 $X$ 的機率是

```formula BINOM
P(X = k) = \binom{n}{k} p^{k} (1-p)^{n-k}
```

其中 $\binom{n}{k}$ 數的是「哪幾次成功」。用專案自己的 `binomPmf` 檢查兩題：

```calc
- { expr: "binomPmf(10, 2, 0.5)", expect: 0.044, note: "fair coin, exactly two heads in ten" }
- { expr: "binomPmf(10, 3, 0.3)", expect: 0.267 }
```

同樣的計算寫成 Python 只要三行，變數與數字都和上面同一題（$n = 10$、$k = 2$、$p = 0.5$）：

```python title="二項 pmf：公平硬幣十次中兩次正面"
from math import comb

n, k, p = 10, 2, 0.5
pmf = comb(n, k) * p ** k * (1 - p) ** (n - k)
print(round(pmf, 3))  # 0.044
```

上面這段印出的結果是：

```text title="輸出"
0.044
```

```lab table
tag: LAB C
title: 改一改格子，看二項機率怎麼重算
hint: 表格記的是 10 次試驗中成功與失敗的次數
names: [[k, nk], [x, y]]
rows: [成功, 失敗]
cols: [次數, 補數]
values: [[2, 8], [0, 0]]
margins: true
outputs:
  - { label: "P(X=k)", expr: "binomPmf(k + nk, k, k/(k+nk))" }
  - { label: 期望值, expr: "(k + nk) * k/(k+nk)" }
  - { label: 變異數, expr: "(k + nk) * (k/(k+nk)) * (1 - k/(k+nk))" }
actions:
  - { label: 成功次數 +1, set: { k: "k + 1", nk: "nk - 1" } }
  - { label: 重設, reset: true }
verdict:
  - { when: "k == nk", text: "成功與失敗各半：變異數最大，分布最扁。" }
  - { when: "true", text: "成功次數偏一邊時，變異數變小，分布變尖。" }
```

```quiz 二項分布
- type: num
  q: $n = 10$、$p = 0.5$，$P(X = 2)$ 是多少？（小數 3 位）
  a: 0.044
  tol: 0.002
  calc: "binomPmf(10, 2, 0.5)"
  ex: $\binom{10}{2} 0.5^{10} = 45/1024 \approx 0.044$。
- q: $n = 10$、$p = 0.3$，期望值是多少？
  o: [3, 0.3, 7, 2.1]
  a: 0
  ex: $E[X] = np = 10 \times 0.3 = 3$。
```

## 2.2 期望值、變異數與圖形 {pages=4}

二項分布有兩個好用的封閉式：$E[X] = np$，$\operatorname{Var}(X) = np(1-p)$。$p$ 越接近 0.5，分布越扁。

```lab curve
tag: LAB D
title: 拉動 n，看二項分布怎麼變寬
x: { label: k, min: 0, max: 20 }
y: { label: "P(X=k)", min: 0, max: 0.3 }
inputs: [{ id: n, label: n, min: 4, max: 20, step: 2, value: 10 }]
curves:
  - { label: "p = 0.5", expr: "x > n ? 0 : binomPmf(n, x, 0.5)" }
  - { label: "p = 0.3", expr: "x > n ? 0 : binomPmf(n, x, 0.3)" }
marker: { label: k, value: 3 }
```

```lab stepper
tag: LAB E
title: 從機率質量函數走到常態近似
hint: n 越大，形狀越像鐘形
legend: { good: 目前這一步的重點, muted: 這一步先不看 }
steps:
  - label: 小 n
    text: $n = 4$ 時只有五根柱子，形狀還很粗糙。
    table: { head: [k, "P(X=k)"], rows: [[0, 0.063], [1, 0.250], [2, 0.375], [3, 0.250], [4, 0.063]], highlight: [2] }
    chips: [{ text: "峰在 k = 2", state: good }, { text: "對稱", state: muted }]
  - label: 大 n
    text: $n = 20$ 時柱子變多、變細，整體接近鐘形。
    chips: [{ text: "峰在 k = 10", state: good }, { text: "兩側對稱", state: good }]
  - label: 近似
    text: 只要 $np$ 與 $n(1-p)$ 都夠大，就可以用常態分布近似。
    chips: [{ text: "np ≥ 5", state: good }, { text: "n(1-p) ≥ 5", state: good }, { text: "小 n 不適用", state: muted }]
```

```lab stepper
tag: LAB F
title: 四種籌碼狀態
hint: 同一份清單裡，哪些保留、哪些剔除、哪些只是分類標籤
legend: { good: 保留, bad: 錯誤, muted: 剔除, info: 中性分類 }
steps:
  - label: 四態
    text: 籌碼的顏色只說明一件事：這一項在目前這一步是什麼角色。
    chips:
      - { text: "保留的項目", state: good, note: "要用的" }
      - { text: "算錯的項目", state: bad, note: "要改的" }
      - { text: "剔除的項目", state: muted, note: "先不看" }
      - { text: "文字", state: info, note: "只是分類" }
  - label: 中性分類
    text: 中性分類不是對錯，也不代表剔除，所以不劃線、不用紅綠。
    chips:
      - { text: "文字", state: info }
      - { text: "向量", state: info }
      - { text: "雜訊", state: muted }
```

```calc
- { expr: "10*0.3", expect: 3, note: "E[X] = np" }
- { expr: "10*0.3*(1-0.3)", expect: 2.1, note: "Var(X) = np(1-p)" }
- { expr: "binomPmf(20, 10, 0.5)", expect: 0.176 }
```

```quiz 二項分布
- q: 什麼時候適合用常態分布近似二項分布？
  o: [np 與 n(1-p) 都夠大時, 只要 p 接近 0.5 時, n 小的時候, 永遠都適合]
  a: 0
  ex: 兩個期望次數都夠大，鐘形才會成形。
```
