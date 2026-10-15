---
chapter: 2
title: 關聯分析入門
short: 關聯分析
subtitle: Association analysis basics
summary: 支持度、Apriori 剪枝與 Lift
source: sample.pdf
---

## 2.1 支持度與 Apriori 剪枝 {pages=4}

項目集 $X$ 的支持度 $s(X) = \sigma(X)/N$。Apriori 原理：<mark>不頻繁項目集的超集一定不頻繁</mark>。

```lab stepper
tag: LAB B
title: 一層一層找出頻繁項目集
hint: minsup = 3
steps:
  - label: 1-項
    text: 先數每個單一項目，$\{Coke\}$ 與 $\{Eggs\}$ 未達門檻。
    chips: [{ text: Bread, state: freq, note: "σ=4" }, { text: Milk, state: freq, note: "σ=4" }, { text: Coke, state: infreq, note: "σ=2" }, { text: Eggs, state: infreq, note: "σ=1" }]
  - label: 2-項
    text: 只用頻繁的單項組合，含 Coke 或 Eggs 的組合全部剪掉。
    chips: [{ text: "{Bread, Milk}", state: freq, note: "σ=3" }, { text: "{Coke, Milk}", state: pruned }]
  - label: 結束
    text: 沒有新的候選，演算法停止。
```

```calc
- { expr: "C(6,1) + C(6,2) + C(6,3)", expect: 41, tol: 0, note: "candidates with Apriori pruning, d = 6" }
```

## 2.2 Lift 與空值增加 {pages=4}

```lab table
tag: LAB C
title: 茶與咖啡的列聯表
hint: 按下按鈕加入大量「兩者都沒買」的交易
names: [[f11, f10], [f01, f00]]
rows: [Tea, ¬Tea]
cols: [Coffee, ¬Coffee]
values: [[15, 5], [75, 5]]
margins: true
outputs:
  - { label: Confidence, expr: "f11/(f11+f10)" }
  - { label: Lift, expr: "(f11/(f11+f10)) / ((f11+f01)/(f11+f10+f01+f00))" }
  - { label: Jaccard, expr: "f11/(f11+f10+f01)" }
actions:
  - { label: "+ 10000 筆 f00", set: { f00: "f00 + 10000" } }
  - { label: 重設, reset: true }
verdict:
  - { when: "(f11/(f11+f10)) / ((f11+f01)/(f11+f10+f01+f00)) < 1", text: "Lift < 1：喝茶反而降低喝咖啡的機率。" }
  - { when: "true", text: "Lift > 1：正相關。但 Jaccard 沒變，Lift 被空交易灌大了。" }
```

```lab curve
tag: LAB D
title: 三種不純度曲線
x: { label: p, min: 0, max: 1 }
y: { label: impurity, min: 0, max: 1 }
curves:
  - { label: Entropy, expr: "x<=0||x>=1 ? 0 : -x*log2(x)-(1-x)*log2(1-x)" }
  - { label: Gini, expr: "2*x*(1-x)" }
  - { label: Error, expr: "min(x, 1-x)" }
marker: { label: p, value: 0.3 }
```

```calc
- { expr: "(15/20)/(90/100)", expect: 0.833 }
```

```quiz 關聯分析
- type: num
  q: Tea → Coffee：$f_{11}=15, f_{10}=5, f_{01}=75, f_{00}=5$，Lift 是多少？（小數 3 位）
  a: 0.833
  tol: 0.003
  calc: "(15/20)/(90/100)"
  ex: $\mathrm{conf} = 15/20 = 0.75$，$P(\mathrm{Coffee}) = 0.9$，Lift $= 0.833$。
- q: 加入大量 $f_{00}$ 交易後，哪個指標不變？
  o: [Lift, Jaccard, Odds ratio]
  a: 1
  ex: Jaccard 只用 $f_{11}, f_{10}, f_{01}$，不受 $f_{00}$ 影響。
```
