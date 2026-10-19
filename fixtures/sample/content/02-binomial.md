---
chapter: 2
title: 二項分布與期望值
short: 二項分布
subtitle: The binomial distribution and expectation
summary: 二項機率、期望值與變異數，以及常態近似的形狀
source: sample.pdf
---

## 2.1 二項分布的機率質量函數 {pages=4}

```analogy 十枚銅板各自很任性
丟十枚銅板，每一枚自己決定正反，彼此不看別人。要問「剛好兩枚正面」，就是把所有「兩枚正、八枚反」的排法都算一次——這就是 $\binom{n}{k}$ 在做的事。
```

重複 $n$ 次獨立且成功機率同為 $p$ 的試驗，成功次數 $X$ 的機率是

```formula BINOM
tex: "P(X = k) = \\binom{n}{k} p^{k} (1-p)^{n-k}"
parts:
  - { tex: "P(X = k)", say: "剛剛好 k 次成功的機率。" }
  - { tex: "=", say: "右邊把它拆成兩件事：有幾種排法，以及每一種排法有多可能。" }
  - { tex: "\\binom{n}{k}", say: "n 次裡選 k 次成功，有幾種排法。這只是數數，和機率無關。" }
  - { tex: "p^{k} (1-p)^{n-k}", say: "其中任何一種排法發生的機率：k 次成功乘上 n-k 次失敗。" }
hint: 先點「幾種排法」，再點最後一段
```

其中 $\binom{n}{k}$ 數的是「哪幾次成功」，$p^{k}(1-p)^{n-k}$ 是其中一種排法的機率。用專案自己的 `binomPmf` 檢查兩題：

```calc
- { expr: "binomPmf(10, 2, 0.5)", expect: 0.044, note: "fair coin, exactly two heads in ten" }
- { expr: "binomPmf(10, 3, 0.3)", expect: 0.267 }
```

同樣的計算寫成 Python 只要三行，變數與數字都和上面同一題（$n = 10$、$k = 2$、$p = 0.5$）：
```python from="example" title="示範：二項 pmf，公平硬幣十次中兩次正面"
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

```analogy 重心與寬度
期望值是把分布放在指針上，它會平衡的那一點；變異數是重量分散得多開。二項分布的平均永遠是 $np$，因為每一枚銅板各自貢獻 $p$。
```

二項分布有兩個好用的封閉式：$E[X] = np$，$\operatorname{Var}(X) = np(1-p)$。$p$ 越接近 0.5，分布越扁。

### 標準差是 $\sqrt{\operatorname{Var}(X)}$

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

形狀要好用，得先知道什麼時候可以偷懶：兩條期望次數 $np$ 與 $n(1-p)$ 都夠大時，鐘形才會成形。先動手試試什麼時候還不行：

```lab slider-calc
tag: LAB E
title: 拉動 n 與 p，看常態近似什麼時候可以用
hint: 兩條期望次數都要 ≥ 5
inputs:
  - { id: n, label: n, min: 4, max: 40, step: 1, value: 10 }
  - { id: p, label: p, min: 0.05, max: 0.95, step: 0.05, value: 0.3 }
outputs:
  - { label: np, expr: "n * p" }
  - { label: "n(1-p)", expr: "n * (1 - p)" }
  - { label: 判準, expr: "n * p >= 5 && n * (1 - p) >= 5 ? 1 : 0", labels: { "1": "可用常態近似", "0": "還不行" } }
verdict:
  - { when: "n * p < 5", text: "np 太小：分布還偏在一邊，鐘形還沒成形。" }
  - { when: "n * (1 - p) < 5", text: "n(1-p) 太小：尾巴還很重，近似會低估尾端。" }
  - { when: "n * p >= 5 && n * (1 - p) >= 5", text: "兩個期望次數都夠大，可以用常態近似。" }
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

```takeaway
期望值只靠 $np$，形狀才看 $p$：$p = 0.5$ 時變異數最大，分布最扁；$p$ 越偏一邊，分布越尖。
```

```quiz 二項分布
- q: 什麼時候適合用常態分布近似二項分布？
  o: [np 與 n(1-p) 都夠大時, n 大於 30 且 p 任意時, p 接近 0.5 而 n 很小時, np 大於 1 且 p 很小時]
  a: 0
  ex: 兩個期望次數都夠大，鐘形才會成形。只看 n 大於 30 不夠：p 很小時 np 仍然很小，分布仍然偏斜。
```
