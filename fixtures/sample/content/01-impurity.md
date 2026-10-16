---
chapter: 1
title: 節點不純度
short: 不純度
subtitle: Node impurity measures
summary: Gini、Entropy 與分類誤差
source: sample.pdf
---

## 1.1 三種不純度指標 {pages=1-2}

決策樹在每個節點挑選能讓子節點<mark>最純</mark>的分割。節點 $t$ 中第 $j$ 類的比例記為 $p_j$，三種常見指標如下：

```formula GINI
\mathrm{Gini}(t) = 1 - \sum_{j} p_j^{2}
```

$$\mathrm{Entropy}(t) = -\sum_{j} p_j \log_2 p_j$$

| 節點計數 (C1, C2) | Gini | Entropy | Error |
|---|---|---|---|
| (0, 6) | 0.000 | 0.000 | 0.000 |
| (2, 4) | 0.444 | 0.918 | 0.333 |
| (3, 3) | 0.500 | 1.000 | 0.500 |

```calc
- { expr: "gini(2,4)", expect: 0.444, note: "table row (2,4)" }
- { expr: "entropy(2,4)", expect: 0.918 }
- { expr: "error(2,4)", expect: 0.333 }
```

```note
考前提醒：兩類別時三個指標都在 **p = 0.5** 達到最大值。
```

```lab slider-calc
tag: LAB A
title: 拉動 C1，看三種指標怎麼變
hint: 總數固定為 6
inputs:
  - { id: c1, label: C1, min: 0, max: 6, step: 1, value: 2 }
outputs:
  - { label: Gini, expr: "gini(c1, 6 - c1)" }
  - { label: Entropy, expr: "entropy(c1, 6 - c1)" }
  - { label: Error, expr: "error(c1, 6 - c1)" }
bars:
  - { label: Gini, expr: "gini(c1, 6 - c1)", max: 1 }
  - { label: Entropy, expr: "entropy(c1, 6 - c1)", max: 1 }
verdict:
  - { when: "c1 == 3", text: "C1 = C2，三個指標同時到達最大值。" }
  - { when: "c1 == 0 || c1 == 6", text: "節點完全純淨，三個指標都是 0。" }
```

```quiz 不純度
- type: num
  q: 節點內 C1 = 2、C2 = 4，Gini 是多少？（小數 3 位）
  a: 0.444
  tol: 0.002
  calc: "gini(2,4)"
  ex: $1 - (2/6)^2 - (4/6)^2 = 0.444$。
- q: 兩類別節點的 Entropy 何時最大？
  o: [兩類各占一半, 只有一類, 第一類占 90%, 永遠相同]
  a: 0
  ex: $p = 0.5$ 時 $-2 \cdot 0.5 \log_2 0.5 = 1$，為最大值。
```

## 1.2 為什麼不用分類誤差挑分割 {pages=3}

分類誤差只看多數類別，對分割前後的比例變化不敏感。

```erratum
text: 投影片寫「Error 永遠不會改變」；實際上只有在多數類別不變的分割下才不變。
ref: Tan et al., *Introduction to Data Mining*, 2nd ed., §3.3.3
```

```lab tree
tag: LAB A2
title: 自己長一棵樹，再拿它分類一筆紀錄
hint: 先看根節點的候選分割
attributes:
  - { name: Weather, values: [Sunny, Rainy] }
  - { name: Wind, values: [Weak, Strong] }
  - { name: Temp, values: [Hot, Mild, Cool] }
class: { name: Play, values: [Yes, No] }
records:
  - { Weather: Sunny, Wind: Weak,   Temp: Hot,  Play: No }
  - { Weather: Sunny, Wind: Weak,   Temp: Mild, Play: Yes }
  - { Weather: Sunny, Wind: Strong, Temp: Hot,  Play: No }
  - { Weather: Sunny, Wind: Strong, Temp: Cool, Play: Yes }
  - { Weather: Rainy, Wind: Weak,   Temp: Mild, Play: Yes }
  - { Weather: Rainy, Wind: Weak,   Temp: Cool, Play: Yes }
  - { Weather: Rainy, Wind: Strong, Temp: Mild, Play: No }
  - { Weather: Rainy, Wind: Strong, Temp: Cool, Play: Yes }
  - { Weather: Sunny, Wind: Weak,   Temp: Cool, Play: No }
  - { Weather: Rainy, Wind: Weak,   Temp: Hot,  Play: Yes }
measure: gini
split: multiway
verdict:
  - { when: "trainingError == 0", text: "樹長滿了：訓練資料全部落在正確的類別，訓練錯誤率是 0。" }
  - { when: "depth >= 2", text: "還有節點不純，挑一個屬性繼續分割。" }
```

把 `measure` 切到<mark>錯誤率</mark>，再點根節點 Rainy 那條子節點：Wind 的增益會顯示 0，而 Gini 給它 0.120。

```quiz 不純度
- q: 下列哪一個指標對節點比例變化最不敏感？
  o: [Gini, Entropy, Classification error]
  a: 2
  ex: 分類誤差只取決於多數類別的比例。
```
