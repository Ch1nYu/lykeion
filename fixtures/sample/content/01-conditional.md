---
chapter: 1
title: 條件機率與貝氏定理
short: 條件機率
subtitle: Conditional probability and Bayes' theorem
summary: 條件機率、獨立性與貝氏定理的三種寫法
source: sample.pdf
---

## 1.1 條件機率與獨立性 {pages=1-2}

```analogy 把世界縮小到桌布以內
把樣本空間想成一張桌子，$B$ 是桌上鋪的一塊桌布。問「已知 $B$ 發生，$A$ 的機率是多少」，就是**只低頭看桌布以內**：原本的 $A$ 有多大不重要，重要的是 $A$ 落在桌布上的那一塊佔了桌布多少。
```

### 定義

已知事件 $B$ 發生時，事件 $A$ 的<mark>條件機率</mark>定義為

```formula BAYES
tex: "P(A \\mid B) = P(A \\cap B) / P(B)"
parts:
  - { tex: "P(A \\mid B)", say: "左邊是「已經知道 B 之後」的機率。" }
  - { tex: "=", say: "等號右邊把它拆成兩個可以分別量測的量。" }
  - { tex: "P(A \\cap B)", say: "分子是 A 與 B 同時發生的機率，也就是桌布上那一塊。" }
  - { tex: "/" }
  - { tex: "P(B)", say: "分母是桌布本身的大小。相除就是把世界縮小到桌布以內。" }
hint: 點式子裡的每一段，看它在做什麼
```

這個定義要求 $P(B) > 0$。若 $P(A \mid B) = P(A)$，就稱 $A$ 與 $B$ 獨立，等價於

$$P(A \cap B) = P(A)\,P(B)$$

換句話說，獨立的意思是「桌布沒有改變 $A$ 的形狀」。

### 三種情況並排比較

| 情況 | $P(A \cap B)$ | $P(A \mid B)$ | 是否獨立 |
|---|---|---|---|
| 獨立 | 0.12 | 0.30 | 是 |
| 正相關 | 0.20 | 0.50 | 否 |
| 互斥 | 0.00 | 0.00 | 否 |

```calc
- { expr: "0.3*0.4", expect: 0.12, note: "independent case: P(A)P(B)" }
- { expr: "0.20/0.40", expect: 0.5 }
- { expr: "entropy(1, 1)", expect: 1, note: "two equally likely outcomes carry one bit" }
```

```note
考前提醒：條件機率**不是**對稱的，$P(A \mid B)$ 與 $P(B \mid A)$ 通常不相等，貝氏定理就是在換算這兩者。
```

```lab slider-calc
tag: LAB A
title: 拉動 P(A|B)，看聯合機率怎麼變
hint: P(B) 固定為 0.4
inputs:
  - { id: pa, label: "P(A|B)", min: 0, max: 1, step: 0.05, value: 0.3 }
outputs:
  - { label: "P(A∩B)", expr: "pa * 0.4" }
  - { label: "P(B|A)", expr: "pa * 0.4 / 0.3" }
  - { label: 判準, expr: "pa > 0.3 ? 1 : 0", labels: { "1": "正相關", "0": "不獨立或負相關" } }
bars:
  - { label: "P(A∩B)", expr: "pa * 0.4", max: 0.4 }
  - { label: "P(B|A)", expr: "pa * 0.4 / 0.3", max: 1 }
verdict:
  - { when: "pa == 0.3", text: "P(A|B) = P(A) = 0.3，此時 A 與 B 獨立。" }
  - { when: "pa > 0.3", text: "P(A|B) > P(A)：B 發生讓 A 更可能，P(B|A) 也跟著被拉高。" }
```

```quiz 條件機率
- type: num
  q: 若 $P(A \cap B) = 0.2$、$P(B) = 0.4$，$P(A \mid B)$ 是多少？（小數 3 位）
  a: 0.5
  tol: 0.002
  calc: "0.20/0.40"
  ex: $P(A \mid B) = 0.2 / 0.4 = 0.5$。
- q: $A$ 與 $B$ 獨立且 $P(A) = 0.3$、$P(B) = 0.4$，$P(A \cap B)$ 為何？
  o: [0.12, 0.70, 0.58, 無法判斷]
  a: 0
  ex: 獨立時 $P(A \cap B) = P(A)P(B) = 0.3 \times 0.4 = 0.12$。
```

## 1.2 貝氏定理 {pages=3}

```analogy 兩張標籤互相調換
檢驗報告給你的是「有病的人驗出陽性」的機率，你真正想知道的是「驗出陽性的人真的有病」的機率。兩者分子相同、分母不同：前者把世界縮小到病人之間，後者縮小到陽性的人之間。
```

把對稱的定義式整理一下，就得到貝氏定理：

$$P(A \mid B) = \frac{P(B \mid A)\,P(A)}{P(B)}$$

右邊的 $P(A)$ 是<mark>事前機率</mark>，$P(A \mid B)$ 是看過 $B$ 之後的<mark>事後機率</mark>。分母常用全機率公式展開。

```erratum
text: 講義寫「事前機率與事後機率永遠不會相同」；只有當 $B$ 與 $A$ 獨立時兩者才會相等，一般情況不會。
ref: Ross, *A First Course in Probability*, 10th ed., §3.4
```

```lab stepper
tag: LAB B
title: 一步一步算出一個事後機率
hint: 想知道檢驗陽性時真的生病的機率
legend: { good: 想算的那一項, muted: 已算過的部分 }
steps:
  - label: 1-給定
    text: 盛行率 $P(D) = 0.01$，檢驗敏感度 $P(+ \mid D) = 0.9$。
    chips: [{ text: "P(D) = 0.01", state: good }, { text: "P(+|D) = 0.90", state: good }]
  - label: 2-展開分母
    text: 全機率公式把 $P(+)$ 拆成生病與健康兩條路。
    chips: [{ text: "P(+|D)P(D) = 0.009", state: good, note: "真陽" }, { text: "P(+|¬D)P(¬D) = 0.099", state: good, note: "偽陽" }]
  - label: 3-相除
    text: 分子只佔分母的一小塊，所以事後機率遠小於敏感度。
    chips: [{ text: "P(D|+) = 0.009/0.108", state: good, note: "≈ 0.083" }, { text: "P(¬D|+) = 0.099/0.108", state: muted, note: "≈ 0.917" }]
```

```calc
- { expr: "0.9*0.01", expect: 0.009, note: "true positive mass" }
- { expr: "0.1*0.99", expect: 0.099, note: "false positive mass" }
- { expr: "0.009/(0.009+0.099)", expect: 0.083 }
```

```takeaway
分母換了，答案就換了：貝氏定理唯一的動作，是把「已知病人」的分母換成「已知陽性」的分母。
```

```quiz 條件機率
- q: 承上，檢驗陽性時真的生病的機率最接近哪個值？
  o: [0.083, 0.900, 0.500, 0.917]
  a: 0
  ex: 偽陽的數量遠多於真陽，事後機率只有約 8.3%。
```
