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

### 已知 B 發生後，A 還有多可能？

令 $P(B)$ 是桌布 B 佔整張桌子的比例；$P(A \\cap B)$ 是 A 與 B 重疊、也就是落在桌布裡的那一塊佔整張桌子的比例。用重疊比例除以桌布比例，得到桌布內 A 所佔的比例，這就是條件機率：

```formula BAYES
tex: "P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}"
parts:
  - { tex: "P(A \\mid B)", say: "左邊是「已知 B 之後」的機率，也就是只低頭看桌布以內的 A。" }
  - { tex: "=", say: "等號右邊把它換成兩個可以量的面積：重疊的那塊，除以桌布本身。" }
  - frac:
      num: [ { tex: "P(A \\cap B)", say: "分子是 A 與 B 同時發生的機率，也就是桌布上那一塊。" } ]
      den: [ { tex: "P(B)", say: "分母是桌布本身的大小。" } ]
    say: "整個分數：相除就是把世界縮小到桌布以內，剩下的比例就是答案。"
hint: 點式子裡的每一段，看它在做什麼
```

這個定義要求 $P(B) > 0$。若 $P(A \mid B) = P(A)$，就稱 $A$ 與 $B$ 獨立，等價於

```formula INDEPENDENCE
tex: "P(A \\cap B) = P(A)P(B)"
parts:
  - { tex: "P(A \\cap B)", say: "A 和 B 重疊的那塊，佔整張桌子的比例。" }
  - { tex: "=", say: "獨立表示知道 B 發生，不會改變 A 的機會。" }
  - { tex: "P(A)", say: "A 佔整張桌子的比例。" }
  - { tex: "P(B)", say: "B 也佔整張桌子的比例；獨立時，兩者各自的比例相乘就是重疊比例。" }
hint: 獨立時桌布和 A 的重疊比例，等於兩者各自比例相乘
```

換句話說，獨立的意思是「只看桌布裡，A 所佔的比例和整張桌子上相同」。

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
- { expr: "0.3/0.4", expect: 0.75, note: "largest P(A|B) for fixed P(A)=0.3 and P(B)=0.4" }
- { expr: "0.70", expect: 0.70, note: "sum of probabilities distractor" }
- { expr: "0.58", expect: 0.58, note: "union probability distractor" }
- { expr: "0.3", expect: 0.3, note: "P(A) used in the quiz explanation" }
- { expr: "0.9", expect: 0.9, note: "test sensitivity P(+|D)" }
- { expr: "0.01", expect: 0.01, note: "disease prevalence P(D)" }
- { expr: "0.108", expect: 0.108, note: "total positive-test probability" }
```

因為 $P(A) = 0.3$、$P(B) = 0.4$ 固定，聯合機率不能超過 $P(A)$，所以 $P(A \mid B)$ 最大是 $0.3/0.4 = 0.75$。再看聯合機率 $P(A \cap B) = P(A \mid B)P(B)$，可知 $P(B \mid A) = P(A \cap B)/P(A)$ 也不會超過 1。

```lab slider-calc
tag: LAB A
title: 拉動 P(A|B)，看聯合機率怎麼變（P(A)=0.3）
hint: P(A)=0.3、P(B)=0.4 固定；P(A|B) 最大只能到 0.75
inputs:
  - { id: pa, label: "P(A|B)", min: 0, max: 0.75, step: 0.05, value: 0.3 }
outputs:
  - { label: "P(A∩B)", expr: "pa * 0.4" }
  - { label: "P(B|A)", expr: "pa * 0.4 / 0.3" }
  - { label: 判準, expr: "pa == 0.3 ? 1 : pa > 0.3 ? 2 : 0", labels: { "1": "獨立", "2": "正相關", "0": "負相關" } }
bars:
  - { label: "P(A∩B)", expr: "pa * 0.4", max: 0.4 }
  - { label: "P(B|A)", expr: "pa * 0.4 / 0.3", max: 1 }
verdict:
  - { when: "pa == 0.3", text: "P(A|B) = P(A) = 0.3，此時 A 與 B 獨立。" }
  - { when: "pa > 0.3", text: "觀察到 B 時，A 的機率較高（正相關）；這表示一起變動，不代表 B 造成 A。" }
  - { when: "true", text: "觀察到 B 時，A 的機率較低（負相關）；這表示一起變動，不代表 B 造成 A。" }
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
  ex: 獨立時要把兩個機率相乘，得到 0.12；若相加會得到「0.70」，不是聯合機率。另一個選項是聯集機率，也不是交集。
```

## 1.2 貝氏定理 {pages=3}

```analogy 兩張標籤互相調換
檢驗報告給你的是「有病的人驗出陽性」的機率，你真正想知道的是「驗出陽性的人真的有病」的機率。兩者分子相同、分母不同：前者把世界縮小到病人之間，後者縮小到陽性的人之間。
```

在篩檢例子中，令 $A=D$ 表示有病、$B=+$ 表示陽性，因此公式左側就是 $P(D|+)$，右側是 $P(+|D)P(D)/P(+)$. 敏感度是 0.9、特異度也是 0.9，所以偽陽率是 0.1；盛行率是 0.01、所有陽性比例是 0.108。先前的條件機率定義是 $P(A \mid B) = P(A \cap B)/P(B)$；現在把交集改從 $A$ 的方向算：

```formula BAYES
tex: "P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}"
parts:
  - { tex: "P(A \\mid B)", say: "陽性者這一群裡，真的生病的人所佔的比例。" }
  - { tex: "=", say: "條件機率的定義讓我們把分子改寫成同時發生的比例。" }
  - frac:
      num:
        - { tex: "P(B \\mid A)", say: "若 A 已發生時，B 發生的比例；在篩檢例子裡是真陽率。" }
        - { tex: "\\,P(A)", say: "乘上 A 的事前比例，得到真陽性所佔的比例。" }
      den: [ { tex: "P(B)", say: "除以所有 B 發生的比例，也就是所有陽性者的比例。" } ]
    say: "分子是真陽性，分母是所有陽性；相除得到陽性者中 A 所佔的比例。"
hint: 從左邊開始，跟著篩檢例子看分子與分母各代表哪一群人
```

以篩檢為例，敏感度 0.9 乘上盛行率 0.01，得到真陽性比例 0.009；偽陽率 0.1 乘上健康比例 0.99，得到偽陽比例 0.099；兩者相加是陽性總比例 0.108。

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
- { expr: "0.99", expect: 0.99, note: "healthy fraction" }
- { expr: "0.01", expect: 0.01, note: "disease prevalence P(D)" }
- { expr: "0.108", expect: 0.108, note: "total positive-test probability" }
- { expr: "0.9", expect: 0.9, note: "sensitivity P(+|D)" }
- { expr: "0.917", expect: 0.917, note: "fraction of positive tests that are false discoveries" }
- { expr: "0.083", expect: 0.083, note: "posterior probability P(D|+)" }
```

```takeaway
分母換了，答案就換了：貝氏定理唯一的動作，是把「已知病人」的分母換成「已知陽性」的分母。
```

```quiz 條件機率
- q: 承上，檢驗陽性時真的生病的機率最接近哪個值？
  o: [0.083, 0.900, 0.500, 0.917]
  a: 0
  ex: 偽陽者有 0.099，真陽者有 0.009，所以陽性者真的生病的機率只有 0.083。0.900 是敏感度 $P(+|D)$，表示生病者驗出陽性的比例；0.917 是 $P(¬D|+)$，表示陽性者其實沒生病的比例。
```
