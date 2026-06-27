---
title: Agent 的交互就是流式事件处理——用数据库的思想重新设计 Agent 技术栈
published: 2026-06-28
description: Agent 需要的实时交互、持久记忆和经验复用，本质上都是流式事件处理问题；文章沿 Bojie Li 六篇论文梳理 changelog + checkpoint 如何重塑 Agent 技术栈。
tags: ["AI Agent", "KV Cache", "RoPE", "流处理", "记忆系统", "changelog+checkpoint"]
category: AI 工程
draft: false
comment: true
---
# Agent 的交互就是流式事件处理——用数据库的思想重新设计 Agent 技术栈

**TL;DR**：Agent 需要的实时交互、持久记忆和经验复用，在传统 Request/Response 架构下全做不出来。因为它们本质上都是**流式事件处理问题**。Bojie Li 的六篇论文沿着同一条哲学——changelog + checkpoint——把它们一层层拆开解决。每一步都不是凭空设计，而是从一个失败尝试出发，发现底层机制，再推出方案。

**假定读者**：理解 Transformer 的基础架构（Attention、FFN、KV Cache）。如果你需要从 GPT-2 级别复习，文末有完整的架构拆解参考。

---

## 引子：Agent 需要 ChatGPT 做不到的三件事

想象你要做一个真正的个人助理 Agent——它会陪你一个月，帮你订机票、处理邮件、管理日程。它需要 ChatGPT 做不到的三件事：

**第一，实时交互。** 你跟它说话时它能被打断，它觉得有事要告诉你时会主动开口。你不可能每次交互都像跟 ChatGPT 聊天那样，把完整问题打好了发过去等回复。

**第二，长期记忆。** 你月初告诉它你对花生过敏，月底点菜时它得记住。你飞了 100 趟航班，问它"去年飞了几次去东京"，它应该一秒算出来，而不是把你 100 条飞行记录全塞进上下文让 LLM 一条条数。

**第三，越用越快。** 你让它帮忙新建一个联系人——第一次慢点可以接受。但第十次新建联系人时，它还跟第一次一样从头推理每一步该点哪里，这就不对了。

这三件事看起来风马牛不相及——实时交互是推理速度问题，长期记忆是存储和检索问题，经验复用是学习问题。但 Bojie Li 这条线的核心发现是：**它们都是同一个问题——Agent 的交互本质是流式事件处理，不是 Request/Response。**

一旦你接受这个判断，整个设计空间就变了。ChatGPT 那种"用户说一句 → 模型想一会儿 → 回一句"的模式，对应的是数据库的**微批处理**。Agent 需要的是**真正的流处理**——事件驱动、有状态、可增量更新。而数据库和 Flink 花了三十年打磨出来的那套方法论，就是答案。

这套方法论浓缩成两条设计原则，贯穿了全部六个方案：

- **快慢分离**：流处理求低延迟，批处理求深度。不要用一个模型做两件事。
- **Changelog + Checkpoint**：增量写入保证实时性，定期全量压缩回收复杂度。和数据库的 WAL + compaction 完全同构。

下面我们从最表层的问题出发，一层层往下走。每一步都不是"我们来设计一个方案"——而是"我们先试最 naive 的做法，看它怎么失败的，然后从失败里找到真正该怎么做"。

---

## 一、最表层：Agent 为什么每次都从零开始？

先看第三个需求"越用越快"。当前的 Computer Use Agent 是这样工作的：

```
第1次新建联系人:
  截图 → VLM 推理"这是联系人页面" → 点"新建" →
  截图 → VLM 推理"输入框出现了" → 输入名字 → 截图 → ...

第10次新建联系人:
  截图 → VLM 推理"这是联系人页面" → 点"新建" →
  ...完全一样，零经验复用
```

每一步都要调大模型，3-5 秒一步，一个简单任务几十秒才能完成。而且每次都把同样的推理重新做一遍。

**最 naive 的想法**：把操作过程录下来，下次直接重放——像 RPA 宏一样。这当然不行——App 的 UI 会变，按钮位置会挪。盲目重放一个固定坐标的点击序列，碰上任何变化就挂了。

**PreAct 的方案：编译成状态机，但在每一步做断言检查。**

```
不存"点击坐标 (320, 540)"，而存"断言：联系人列表页面可见 → 动作：点击创建联系人按钮"
不存"输入Emilia"，而存"断言：姓名输入框已出现 → 动作：输入Emilia"
```

重放时，每到一个状态先验证屏幕断言，通过才执行动作。断言失败就把控制权交还给完整 Agent。这个设计让 PreAct 和 RPA 宏有了本质区别——**它不是盲目重放，而是有眼的重放。**

但还有一个更隐蔽的问题：状态机跑到了最后一步，**不代表任务真的完成了**。所有步骤都执行了，但联系人可能因为某个微妙原因（断言太宽松、网络延迟、UI 细微差异）实际上没创建成功。如果你把这种假成功存进库里，它会在后续重放中反复失败。

PreAct 的解决方案是**存前验证（Verify-Before-Store）**——编译出的候选状态机必须从干净环境完整重跑一次，由独立评估器确认任务真正完成，才允许入库。论文消融掉这个机制，每轮能解决的任务数直接掉 1.75-2.6 个。

> **记忆点**：状态机不推理——它**重放推理的结论**。存的是"在这个画面状态下，下一步该点这里"，不是"为什么点这里"。推理做一次，执行做无数次。这就是快慢分离在执行层的实例化——首次执行走慢路径（VLM），重复执行走快路径（状态机），8.5-13× 加速。

---

## 二、往下一层：事实记忆该怎么存？

PreAct 解决了"怎么做一件事"（过程记忆），但 Agent 还需要记住"用户是谁"——过敏信息、航班记录、偏好设置。

现在的标准做法是**检索式记忆**：对话记录存成文本，需要时用语义相似度捞出相关片段喂给 LLM。对"上次飞东京是哪天"这种事实召回，这够用了。

但用户问"去年飞了几次？去日本几次？东京 vs 巴黎各几次？"——这就炸了。LLM 要在 thinking 里从 100 条记录里一条条数，费 token、容易漏、还可能数错。要么就把 100 条全塞进上下文让模型消化，但上下文窗口不是用来干这个的。

**根本矛盾：存事实和用事实是分离的。** 存的时候是自由文本，用的时候让 LLM 当场解析。每次查询都要重新理解数据结构。

**User as Code 的解法**：不让 LLM 在推理时做聚合。让它在**写入时**就把事实编译成类型化代码，查询时解释器一行算完。

具体来说，你每次跟 Agent 提到的事——航班、购物、体检——先以原始事实写入一个 **append-only 日志**（facts.jsonl）。积累到一定量后，一个编码 Agent 把日志编译成一个 Python 项目：

```python
@dataclass
class Trip:
    date: date
    origin: str
    destination: str
    flight: str

class TravelState:
    trips: list[Trip]
    
    def count_by_year(self, year: int) -> int:
        return sum(1 for t in self.trips if t.date.year == year)
    
    def count_by_dest(self, dest: str) -> int:
        return sum(1 for t in self.trips if t.destination == dest)

    def check_passport_expiry(self) -> list[str]:
        # 护照过期预警——检索系统根本做不了的事
        ...
```

查询"去年飞了几次"变成了 `count_by_year(2025)`——零 LLM 调用，一行 Python，确定性 100% 准确。对比检索+RAG 的 6-43%。

> **记忆点**：日志是安全属性（事实永不丢失），checkpoint 是性能属性（查询快）。又是 changelog + checkpoint。和数据库 LSM-tree 的 WAL + compaction 一模一样。

但这带来了一个新问题——代码化记忆每次对话都要被注入到 LLM 的上下文中。一段完整的类型定义、约束函数、状态对象，动辄几千 token。每次都重新 prefill 一遍，O(L²) 的 attention 代价。

这就把问题推到了下一层。

---

## 三、再深一层：记忆注入为什么这么贵？

Agent 的每次对话都要带上系统提示、技能说明、用户档案。这些文本几乎不变，但每次都塞进 prompt 从头 prefill。技能越长越严重——一个退货政策 8000 token，每次 prefill 就是 O(8000²) 的 attention 计算。而你的对话本身可能才 200 token。

**直觉方案**：预先把这些不变的内容 prefill 一次，存 KV Cache 里，下次直接用。

问题来了。KV Cache 的生产复用依赖**精确前缀匹配**——vLLM 的 Automatic Prefix Caching 只复用和前一个请求前缀完全相同的部分。你的用户档案里时间戳变了（"上次登录：06-27 → 06-28"），哪怕只变了一个 token，整个下游缓存全废。

**再试一个方案**：精准手术——只改时间戳那个 token 的 KV，其他全留着。行不行？

不行。Bojie Li 的 Programmable KV 论文在这里做出了整条线上最深的一个机制发现。

### 3.1 关键发现：Transformer 在 prefill 时就写好了"结论备忘录"

论文做了一个因果实验。Prompt 是"我的账户余额是 5000 元。我想买一台笔记本电脑。"正常 prefill，存下全部 KV Cache。然后把 `5000` 这个 token 的 KV 替换成随机值，其他所有 token 的 KV 保持原样→模型的回答**几乎不变**。反过来，保持 `5000` 不变，把后面句号 `。` 以及它之后的 token 的 KV 清掉→模型回答**完全错误**。

这意味着什么？**余额 5000 这个信息，不是在 token `5000` 的 KV 里被消费的。Transformer 在 prefill 阶段已经把 "余额=5000" 这个结论传播并记录到了下游的聚合 token（句号、换行、段落边界）上。Decode 时模型读的是这些"备忘笔记"，不读原始字段。**

论文把这称为 **"distributed write, concentrated read"**——写入时信息分散传播到所有后续 token，读取时集中从少数聚合 token 消费。字段本身的 KV 驱动不到 1% 的决策。

这个发现把 KV Cache 的性质彻底重定义了——**它不是"原材料仓库"，而是一本"结论备忘录"**。你改原料没用，因为消费端读的是下游已经写好的结论。

### 3.2 那怎么改？——追加一条更正便签

既然结论已经写在聚合 token 上了，直接改原料无效，那就**追加一条显式更正，让模型在处理更正时重新计算结论**：

```
[原始 prompt：余额是 5000...] + [更正：余额改为 3200，本条覆盖之前所有值]
```

Transformer 在 prefill 这条 erratum 时，会做 attention 回顾前文，在 erratum 的引导下意识到旧结论失效，基于新值重新推理。因为 erratum 是 **append-only**——它追加在已有缓存末尾，前缀部分一个 token 不变——前缀缓存完全不受影响。

```
                | 直接改字段KV  | Erratum (append-only)
前缀缓存命中率  |     1%        |     98.5%
p90 TTFT        |      -        |    降 53–398×
```

> **记忆点**：又是 changelog + checkpoint。Erratum 是增量 changelog，累积到阈值触发一次全量 reprefill（checkpoint）截断。98.5% 的请求根本不需要截断。

### 3.3 那怎么复用？——预编译 + RoPE 重定位

回到最初的问题：怎么复用不变的技能文本的 KV Cache？

既然 KV Cache 里存的是"笔记"而不是原料，而技能文本（退货政策、工具说明）是自包含的——它的笔记只依赖自身内容，不依赖外部上下文——那这些笔记就是**位置可移植的**。

预编译：把技能文本在隔离环境 prefill 一次，存下 KV Cache。

拼接时，关键在 RoPE（旋转位置编码）的数学性质。RoPE 把位置信息编码为对 key 向量的旋转。它的核心性质是旋转可叠加：

$$
R(a) \cdot R(b) = R(a + b)
$$

预编译时存的 key 带了位置 j 的旋转 `R(j) · Kⱼ`。要搬到新位置 `j+P`，再转 P 度：`R(P) · R(j) · Kⱼ = R(j+P) · Kⱼ`。O(L) 的逐 key 旋转替代了 O(L²) 的 attention 重算，在 32k 长度下提速 13.9×。

**一个容易产生的疑虑**：技能 token 在隔离 prefill 时没"见"过前文——它们不知道前缀的存在。这部分信息缺失无法通过旋转补回。论文的解决方案是 **Seam-Repair**——只把拼接边界两三个 token 重新 prefill（让它们 attend 前缀），技能内部继续复用。因为技能是自包含的，边界重算足够补偿。实验验证 logit cosine 0.90-0.999。

**Erratum 不会导致上下文 O(n²) 爆炸吗？** 这是个常见误解。Erratum 是追加新 token，cost = O(N_new × N_old)，不是 O(N_old²)。在 14000 token 的上下文末尾加 20 token 的 erratum，代价 ≈ 14k × 20，可忽略。真正 O(n²) 的只有全量 reprefill——而它只在 checkpoint 时触发。

---

## 四、再深一层：能把记忆写进模型参数吗？

Programmable KV 和 User as Code 把记忆放在模型**外部**（KV Cache 和 Python 文件），通过上下文注入。如果想把记忆写进模型**内部**——像 fine-tuning 一样让模型记住用户事实——标准方案是给每个用户训练一个 LoRA adapter。

但 LoRA 有架构上的根本问题。

LoRA 训练时，用户的内容（"Maya 的航班是 XX"）和推理技能（"怎么根据航班记录回答统计问题"）被折叠进同一个低秩权重增量 ΔW 中。结果是：

**① 全局污染。** ΔW 作用于模型的 Q/K/V/O 权重矩阵。写入 Maya 的事实会扰动整个模型的输出——包括跟 Maya 完全无关的文本。Bojie Li 量化了这个效应：写入相同事实后，Engram 方式对无关文本的干扰比 LoRA 小约三万三千倍。原因不是 LoRA 训练得不好——LoRA 被设计成"找一个便宜的梯度方向把 loss 降下来"，这个方向天然会跨越跟事实无关的维度。

**② 推理退化。** 直接召回（"我的航班号是多少"）LoRA 能做。但间接推理（"哪年飞得多"）准确率大幅下降——因为你把内容塞进了推理技能的权重里，挤占了推理能力。User as Engram 在间接推理上准确率高 5.6×，且从未让任何用户比基础模型更差。

**③ 多租户不兼容。** ΔW 是全局的。100 个用户就要 100 份完整的 LoRA 权重（每份 14.2 MB），按请求动态 swap，而且两份不能同时在线。

### 4.1 DeepSeek Engram：模型内的哈希表

2026 年初 DeepSeek 发表的 Engram 提供了一个完全不同的路线。Engram 在 Transformer 的特定层插入一个**外挂哈希表**——根据输入 token 的 N-gram pattern 做确定性哈希查找，把查到的 embedding 通过 gate 融合进 hidden state：

```
输入序列 → 提取后缀 2-gram、3-gram → 8 个不同哈希函数映射到嵌入表槽位 → 查表 → sigmoid gate 融合
```

类比：attention 是 CPU（计算），Engram 哈希表是 RAM（存储）。遇到熟悉的 N-gram pattern，模型直接从"RAM"读，不用 attention 算。查找是 O(1) 的，且因为是**确定性哈希**（非学习路由），大嵌入表可以放在 CPU 内存预取。

### 4.2 User as Engram：把用户事实存进哈希槽位

User as Engram 利用 Engram 的稀疏寻址特性做了一件 LoRA 做不到的事：**把用户内容（事实）和推理技能（怎么用事实）分开存。**

- 用户内容 → Engram 哈希表的特定槽位。触发 N-gram（如用户名字 "Maya"）通过确定性哈希落到固定槽位，写入事实 embedding。只有输入包含 "Maya" 时才读这几行。
- 推理技能 → 一个**共享** LoRA adapter。所有用户共用同一个推理 adapter，不随用户数量增长。

每用户仅需 88 KB（几行哈希表槽位），对比 per-user LoRA 的 14.2 MB。更关键的是隔离性——不同用户的 trigger N-gram 落在不同槽位，多个用户的表可以直接叠加，哈希不冲突就不干扰。这与 LoRA 的全局覆盖形成了根本性的架构差异。

> **记忆点**：如果把 Engram 比作大脑，哈希表 = 海马体（存稀疏的事实记忆），共享 LoRA = 新皮层（存缓慢习得的推理技能）。一个事实只动一个槽位，不动整个皮层。这和 Programmable KV 里"不要动字段的 KV，在末尾加更正"是同一套直觉。

---

## 五、回到起点：主线是什么？

六个方案拆完，它们之间的关系是这样的：

```
问题层次         方案                  底层机制发现              设计模式
───────         ────                  ──────────               ────────
执行重复        PreAct                断言可替代推理            快慢分离
事实聚合        User as Code          代码化表示 > 文本检索     changelog+checkpoint
记忆注入        Programmable KV       KV Cache = 结论备忘录     changelog+checkpoint
参数化记忆      User as Engram        N-gram 哈希天然隔离       changelog+checkpoint
```

每一步都不是凭空设计一个新架构。每一步都是——先试最显然的做法，发现它因为某个深层原因失败，然后从失败中提出机制假设，验证它，再围绕它设计解法。

- PreAct：试盲目重放→失败，因为环境会变→需要断言
- User as Code：试检索→失败，因为存储和推理分离→需要代码化
- Programmable KV：试改字段 KV→失败，因为模型读的是笔记不是字段→需要 erratum
- User as Engram：试 LoRA→失败，因为全局权重污染→需要哈希隔离

这条线的核心论点：**决定 Agent 表现的，往往不是模型能力，而是交互和表示。** 模型已经足够强了。问题是我们在用做聊天机器人的方式做 Agent——Request/Response 微批、无状态、每轮重来。一旦换到流式事件处理的视角，答案自然浮出来。

这也是为什么 Bojie Li 选择在 **Flink** Forward Asia 上讲这些——因为 Flink 社区花了十年解决"有状态的流式事件处理"问题，而 Agent 社区正在撞上完全相同的问题，用不同的名字。

---

## 附录 A：RoPE 重定位的形式化推导

### A.0 RoPE 的数学定义

RoPE 将位置信息以旋转的方式注入 query 和 key，非 GPT-2 式的可学习位置表加法。

每个注意力头维度为 $d$，将 $d$ 维向量两两分组为 $d/2$ 个二维平面。对位置 $pos$ 上的 query/key 向量，在第 $i$ 个维度对上施加角度 $pos \cdot \theta_i$：

$$
\theta_i = \text{base}^{-2i/d}, \quad i = 0, 1, \dots, d/2-1
$$

旋转矩阵（每个二维平面一个 $2 \times 2$ 旋转）：

$$
R_{\text{pos}}^{(i)} = \begin{bmatrix} \cos(\text{pos} \cdot \theta_i) & -\sin(\text{pos} \cdot \theta_i) \\ \sin(\text{pos} \cdot \theta_i) & \cos(\text{pos} \cdot \theta_i) \end{bmatrix}
$$

整个 $d$ 维向量的旋转矩阵是对角分块的：

$$
R_{\text{pos}} = R_{\text{pos}}^{(0)} \oplus R_{\text{pos}}^{(1)} \oplus \dots \oplus R_{\text{pos}}^{(d/2-1)} \in \mathbb{R}^{d \times d}
$$

RoPE 版本的 Q、K：

$$
\tilde{q}_{\text{pos}} = R_{\text{pos}} \cdot q_{\text{pos}}, \qquad \tilde{k}_{\text{pos}} = R_{\text{pos}} \cdot k_{\text{pos}}
$$

V 不参与旋转——位置信息只需影响"谁看谁"，不需影响"被看时传什么内容"。

> **记忆点**：RoPE 不是"加一个位置向量"，而是在做 QK 点积之前先把 Q 和 K 各自旋转。位置越远，旋转角度越大。

### A.1 核心性质：注意力只依赖相对位置

对位置 $i$ 的 query 和位置 $j$ 的 key：

$$
\begin{aligned}
\text{score}(i, j) &= \tilde{q}_i^{\top} \tilde{k}_j = (R_i \cdot q_i)^{\top} (R_j \cdot k_j) \\
&= q_i^{\top} R_i^{\top} R_j \, k_j
\end{aligned}
$$

旋转矩阵是正交矩阵且满足群封闭性：

$$
R_i^{\top} = R_{-i}, \qquad R_{-i} \cdot R_j = R_{j-i}
$$

因此：

$$
\boxed{\text{score}(i, j) = q_i^{\top} R_{j-i} \, k_j}
$$

分数仅取决于相对位置 $j-i$。两旋转组合等于角度相加——先回转 $i$ 度再前转 $j$ 度 = 净转 $j-i$ 度。这就是 RoPE 天然支持训练时未见长度的原因。

### A.2 预编译：技能被"冷冻"时存了什么

技能文本占 $L_s$ 个 token，隔离 prefill（位置从 0）。对 $j \in [0, L_s-1]$：

$$
k_j^{\text{skill}} = R_j \cdot k_j, \qquad v_j^{\text{skill}} = v_j
$$

存入 KV Cache 的就是 $\{k_j^{\text{skill}}, v_j^{\text{skill}}\}$。注意存的是**已旋过的 key**（$R_j \cdot k_j$）——生产系统中 post-RoPE keys 直接存，避免 decode 时重复计算。

### A.3 重定位：对 key 施加 $\Delta$ 旋转

插入新上下文位置 $[P, P+L_s-1]$。利用旋转可叠加性：

$$
R_P \cdot (R_j \cdot k_j) = (R_P \cdot R_j) \cdot k_j = R_{j+P} \cdot k_j
$$

$L_s$ 个 key，每个一次 $R_P$ 旋转，等价于在新位置重新 prefill。Value 完全不动。

> **记忆点**：因为 $R(a) \cdot R(b) = R(a+b)$。

### A.4 三种 Attention 关系的验证

**情况 A：前缀 token 看技能 token**（$i < P,\ j+P$）

$$
\text{score}(i, j+P) = q_i^{\top} R_i^{\top} R_{j+P} \, k_j = q_i^{\top} R_{(j+P)-i} \, k_j
$$

绝对位置 $j+P$、相对距离正确。✅

**情况 B：技能 token 看前缀 token**（$j+P,\ i < P$）

$$
\text{score}(j+P, i) = q_{j+P}^{\top} R_{j+P}^{\top} R_i \, k_i = q_{j+P}^{\top} R_{i-(j+P)} \, k_i
$$

位置正确 ✅。但 $q_{j+P}$ 来自隔离 prefill——技能 token 没"见"过前缀，query 不含前缀信息。这是 RoPE 重定位不能修复的内容条件依赖。❌

**情况 C：技能内部 token 互看**（$j_1+P,\ j_2+P$）

$$
\text{score}(j_1+P, j_2+P) = q_{j_1+P}^{\top} R_{j_2-j_1} \, k_{j_2+P}
$$

相对位置 $j_2-j_1$ 不变。✅

| 关系 | RoPE 重定位效果 |
|---|---|
| 前缀 → 技能 | 绝对/相对位置正确 ✅ |
| 技能 → 前缀 | 位置正确 ✅，内容条件缺失 ❌ |
| 技能 → 技能 | 全部正确 ✅ |

### A.5 Seam-Repair 与复杂度

边界 2–3 个 token 重新 prefill 吸收前缀信息，技能内部复用。logit cosine 0.90–0.999。

**复杂度对比**（技能 $L_s$，前缀 $L_p$，后缀 $L_t$）：

**完整重算**：$\text{prefill} = O((L_p + L_s + L_t)^2)$

**RoPE 重定位**：
- 重旋转 key：$O(L_s \cdot d)$
- Seam-repair：$O(k \cdot (L_p + k + L_t)),\ k = 2 \sim 3$
- 后缀 prefill：$O(L_t^2 + L_t \cdot (L_p + L_s))$

技能 attention 从 $O(L_s^2 + L_s L_p)$ 降为 $O(L_s \cdot d)$。$L_s = 8000$ 时差异数量级——32k 长度下 TTFT 加速 13.9×。

### A.6 Append-Only Erratum 的复杂度

会话结构：

```
[用户档案 2000] [技能 8000] [对话 4000]
    ↑ 一次prefill   ↑ 一次prefill   ↑ 逐轮增长
```

每轮 attention 复杂度：

| 操作 | 复杂度 | 原因 |
|---|---|---|
| 新 token attend 缓存 | $O(N_{\text{new}} \cdot N_{\text{cached}})$ | 正常推理 |
| 缓存 attend 新 token | 0 | 因果掩码 |
| 缓存内部重新 attention | 0 | 不需要 |

Erratum 是"追加新 token"。追加 20 token 到 14000 token 上下文：$O(20 \cdot 14000)$，可忽略。

- **错误理解**：erratum 累积重算整个 attention → $O(N_{\text{cached}}^2)$
- **正确理解**：erratum 是追加新 token → $O(N_{\text{new}} \cdot N_{\text{old}})$

erratum 链累积到几百条时触发 checkpoint 全量重算截断。98.5% 缓存命中率证明触发频率极低。

---

## 附录 B：Erratum 可编辑性的形式化推导

### B.1 直接改字段 KV 为何无效

设上下文 $x = (x_1, \dots, x_T)$，$x_k$ 为动态字段。完整 prefill 产生 $\mathbf{KV}(x)$。

朴素方案：只替换 $x_k$ 的 KV，其余保留：

$$
\widehat{\mathbf{KV}} = \big(\mathbf{KV}_{1:k-1}(x), \mathbf{KV}_k^{\text{new}}, \mathbf{KV}_{k+1:T}(x)\big)
$$

**失效原因**：设 $x_j$（$j > k$）为聚合 token（句号、换行等）。prefill 阶段 $x_j$ 的 self-attention 吸收 $x_k$ 的信息后写入自身 KV：

$$
\mathbf{KV}_j(x) = f\big(x_j, \text{attention}(x_j, x_{\leq j})\big)
$$

$\widehat{\mathbf{KV}}$ 中 $\mathbf{KV}_j$ 仍保留旧值——**改变 $x_k$ 而不更新所有 $j > k$ 的聚合 token，下游"备忘笔记"仍读旧结论。** 因果实验：字段自身 KV 驱动 < 1% 决策。

### B.2 Erratum 工作原理

Erratum $e$ 追加在末尾：

$$
x' = (x_1, \dots, x_T, e_1, \dots, e_{|e|})
$$

$e$ 语义："覆盖 $x_k$，新值为 Y"。Transformer 处理 $e$ 时，$e$ 的 attention 回顾所有前文（包括 $x_k$ 和各聚合 token $x_j$），在 $e$ 引导下判定旧结论失效，基于新值重新推理。

设 $d$ 为 erratum 之后的问题 token，其 KV：

$$
\mathbf{KV}_d(x') = f\big(x_d, \text{attention}(x_d, x_{\leq T}, e)\big)
$$

$e$ 含量使 $x_d$ 的 attention 基于新值决策。

**关键性质**：erratum 是 append-only，前缀完全不变：

$$
\mathbf{KV}_{1:T}(x') = \mathbf{KV}_{1:T}(x)
$$

prefix cache 100% 兼容。

### B.3 Changelog + Checkpoint 形式化

第 $n$ 次字段更新产生 erratum $e^{(n)}$。$N$ 次更新后：

$$
x^{(N)} = (x_1, \dots, x_T, e^{(1)}, \dots, e^{(N)})
$$

**Changelog 阶段**：每次追加 $e^{(n)}$，cost：

$$
\text{cost}(e^{(n)}) = O\big(|e^{(n)}| \cdot (T + \sum_{i=1}^{n-1} |e^{(i)}|)\big)
$$

$|e^{(n)}| \approx 15 \sim 20 \ll T$，可忽略。

**Checkpoint 阶段**：$\sum_{i=1}^N |e^{(i)}| > \tau$ 触发全量重 prefill：

$$
x^{\text{ckpt}} = (x'_1, \dots, x'_T)
$$

$x'_k$ 已替换为新值，erratum 链清零。重算 $O(T^2)$ 被 $N$ 次请求摊销。

---

## 附录 C：Engram 哈希表寻址的形式化推导

### C.1 N-gram 提取与哈希

位置 $t$ 的后缀 N-gram（$n = 2, 3$）：

$$
g_t^{(n)} = (x_{t-n+1}, \dots, x_t)
$$

对每个 N-gram 阶数 $n$ 和哈希头 $k \in \{1, \dots, K\}$（默认 $K = 8$）：

$$
\text{idx}_{n,k} = \varphi_{n,k}\big(\text{compress}(g_t^{(n)})\big) \bmod M_{n,k}
$$

- $\text{compress}(\cdot)$：tokenizer 压缩（归一化 + 去重，减少有效词表 ~70%）
- $\varphi_{n,k}$：multiplicative-XOR 哈希
- $M_{n,k}$：质数模数，减少系统性碰撞

索引到嵌入表：

$$
\mathbf{e}_{n,k} = \mathbf{E}_{n,k}[\text{idx}_{n,k}], \quad \mathbf{E}_{n,k} \in \mathbb{R}^{M_{n,k} \times d_{\text{head}}}
$$

拼接为最终记忆向量：

$$
\mathbf{e}_t = [\mathbf{e}_{2,1}; \dots; \mathbf{e}_{2,K}; \mathbf{e}_{3,1}; \dots; \mathbf{e}_{3,K}]
$$

### C.2 门控融合

记忆向量与 hidden state 通过 sigmoid gate 动态调制：

$$
\mathbf{g}_t = \sigma\left(\frac{\text{norm}(\mathbf{W}_k \mathbf{e}_t) \odot \text{norm}(\mathbf{W}_q \mathbf{h}_t)}{\sqrt{D}}\right)
$$

$$
\mathbf{h}'_t = \mathbf{h}_t + \mathbf{g}_t \odot (\mathbf{W}_v \mathbf{e}_t)
$$

Gate 让模型学会"什么情况下该信任记忆"——对无关 N-gram，gate → 0 屏蔽。

### C.3 多租户叠加

用户 $u$ 的事实写入槽位集合 $\mathcal{S}_u$。两用户 $u_1$、$u_2$ 碰撞概率：

$$
\mathbb{P}(\mathcal{S}_{u_1} \cap \mathcal{S}_{u_2} \neq \emptyset) \approx 1 - \left(1 - \frac{|\mathcal{S}_{u_1}|}{M}\right)^{|\mathcal{S}_{u_2}|}
$$

$M$ 百万至千万量级，$|\mathcal{S}_u|$ 百至千量级，碰撞概率极低。不碰撞时叠加：

$$
\mathbf{E}^{\text{combined}}[i] = \begin{cases}
\mathbf{E}^{u_1}[i] & i \in \mathcal{S}_{u_1} \\
\mathbf{E}^{u_2}[i] & i \in \mathcal{S}_{u_2} \\
\mathbf{E}^{\text{base}}[i] & \text{otherwise}
\end{cases}
$$

确定性哈希保证每个 N-gram 只读固定槽位——不同用户 trigger 天然不交叉。

### C.4 与 LoRA 的隔离性对比

**LoRA**：$\Delta W^{(u)} = B^{(u)} A^{(u)}$ 作用于全局权重。任意输入 $x$：

$$
h' = h + \Delta W^{(u)} \cdot h
$$

无关输入也被 $\Delta W^{(u)}$ 扰动。

**Engram**：读取通过确定性 N-gram 哈希触发。仅当输入包含 trigger N-gram（如用户名）时才查对应槽位。无关输入的 edit 行不被读取，输出 bit-for-bit 不变：

$$
\|\mathbf{y}_{\text{engram}} - \mathbf{y}_{\text{base}}\|_2 \approx 0,\quad
\|\mathbf{y}_{\text{lora}} - \mathbf{y}_{\text{base}}\|_2 \gg 0
$$

论文量化干扰比为 ~1/33,000。

---

## 相关论文

| 方案 | arXiv | GitHub |
|---|---|---|
| PreAct | [2606.17929](https://arxiv.org/abs/2606.17929) | [19PINE-AI/PreAct](https://github.com/19PINE-AI/PreAct) |
| User as Code | [2606.16707](https://arxiv.org/abs/2606.16707) | [19PINE-AI/user-as-code](https://github.com/19PINE-AI/user-as-code) |
| Programmable KV | [2606.17107](https://arxiv.org/abs/2606.17107) | [19PINE-AI/programmable-kv](https://github.com/19PINE-AI/programmable-kv) |
| User as Engram | [2606.19172](https://arxiv.org/abs/2606.19172) | [19PINE-AI/user-as-engram](https://github.com/19PINE-AI/user-as-engram) |
| Sema | [2604.20940](https://arxiv.org/abs/2604.20940) | — |
| Latent Bridge | [2606.24470](https://arxiv.org/abs/2606.24470) | [19PINE-AI/latent-bridge-games](https://github.com/19PINE-AI/latent-bridge-games) |
| Engram (DeepSeek) | [2601.07372](https://arxiv.org/abs/2601.07372) | [deepseek-ai/Engram](https://github.com/deepseek-ai/Engram) |

---

## 相关领域其他工作（简表）

| 方向 | 代表性工作 | 与 Bojie Li 线的关键差异 |
|---|---|---|
| Agent 记忆框架 | MemGPT/Letta, Mem0, Zep, Cognee | 工业方案：外挂服务集成；Bojie Li：记忆进模型/近模型层 |
| 参数化用户记忆 | MemoryLLM (ICML 2024), SELF-PARAM, Larimar, TAP-PER | 同方向，但 Engram 独特在哈希隔离而非连续空间/学习路由 |
| 技能编译 | Muscle-Mem, SkillOpt, Skill-R1, Trace2Skill | 同方向，但 PreAct 独特在"存的就是跑的"（状态机直接执行） |
| KV Cache 编程 | Leyline, Kamera, KVEraser, CacheSlide, RedKnot | 同方向偏工程/系统优化，Programmable KV 独特在底层机制发现 |

