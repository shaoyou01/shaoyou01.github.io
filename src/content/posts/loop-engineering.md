---
title: Loop Engineering 的火爆，不过是控制论的一次迟来兑现
published: 2026-06-20
description: 从 LangChain 的四层 loop 出发，对照控制论中的开环控制、闭环负反馈、自主系统和自适应控制，并延伸讨论 self-evolving agent 仍未越过的 Level 5/6 边界。
tags: [AI, Agent, Loop Engineering, 控制论, LangChain, Self-Evolving Agents]
category: AI 工程
draft: false
comment: true
---
# Loop Engineering 的火爆，不过是控制论的一次迟来兑现

**TL;DR：** "Loop engineering" 最近在 LangChain、swyx、Andrej Karpathy 那边都有讨论。把四层 loop 拆开对照控制论，结构上的对应关系一目了然：Agent Loop 是开环控制，Verification Loop 是闭环负反馈，Event Loop 是自主触发，Hill Climbing 是自适应控制。控制论在 1948 年就有这张图，loop engineering 不是新发现。而 2026 年涌现的 self-evolving agent 研究——APEX、MemEvolve、SkillCAT——看起来更进一步，但用同一套镜头看：它们仍然在 Loop 4（自适应控制）的边界以内，fitness function 始终是外部给定的。控制论预言的下两层——架构自重组（Level 5）和目标自审查（Level 6）——目前没有任何系统真正实现。

---
## 一、Loop Engineering 在说什么

### 1.1 四层嵌套架构

先看 LangChain 的 Sydney Runkle 在《The Art of Loop Engineering》里描述的架构。四层嵌套循环：

| Loop | 做了什么 | LangChain 里的叫法 |
|------|---------|-------------------|
| **Level 1: Agent Loop** | 模型反复调用工具直到任务完成 | `create_agent` |
| **Level 2: Verification Loop** | 输出被评分器检查，不通过则带反馈重试 | `RubricMiddleware` |
| **Level 3: Event Driven Loop** | 事件触发 agent 运行，持续在后台工作 | `LangSmith Deployment` + cron/webhook |
| **Level 4: Hill Climbing Loop** | 分析 trace 数据，自动改进 prompt/工具配置 | `LangSmith Engine` |

逻辑清晰：每往外一层，系统的自主性和自适应能力提升一档。LangChain 的卖点是这些 primitive 已经有现成的实现，不需要从头搭。

这四层结构，每一层都能在半个多世纪前的控制论文献里找到精确的对应。在展开这个映射之前，有个容易混淆的概念值得先厘清。

### 1.2 前身：Harness Engineering

在"loop engineering"之前，LangChain 先有一个词——**harness engineering**。Vivek Trivedy 在今年二月的[《Improving Deep Agents with harness engineering》](https://blog.langchain.com/improving-deep-agents-with-harness-engineering/)里记录了他们的 coding agent 如何在不换模型、只改 harness 的情况下，从 Terminal Bench 2.0 的 Top 30（52.8%）升到 Top 5（66.5%）。

两个词经常被混用，但层次关系清楚：

```
Loop Engineering（外层架构：loop 之间如何嵌套和衔接）
  │
  └─ Harness Engineering（内层配置：每个 loop 内部的 prompt / tool / middleware 怎么调）
```

Harness engineering 关心**单个 loop 内部的旋钮**——系统 prompt 怎么写、用什么工具、middleware 怎么挂、上下文怎么注入。Vivek 的实验只动了三个旋钮（System Prompt、Tools、Middleware），模型没换，Terminal Bench 上提了 13.7 分。

这些都在 Loop 1 和 Loop 2 内部操作。Harness engineering 假设你已经有了一组 loop，问的是每个 loop 里面怎么调到最优。Loop engineering 问的是更上一层：你需要几个 loop？它们怎么嵌套？反馈信号怎么跨 loop 传递？

用控制论的术语：harness engineering 是在调 PID 参数，loop engineering 是在设计控制回路拓扑。区分清楚了，再看每层 loop 的控制论对应才不会混。

---

## 二、用控制论的镜头看四层 Loop

### 2.1 Agent Loop = 开环控制

```
模型 → 工具调用 → 观察结果 → 再次调用 → ... → 完成
```

控制论里的**开环控制**（open-loop control）：系统按预设逻辑执行，过程中不接收外部校验信号。一个没有 verification 的 agent 就是这样——它执行，但不知道执行的结果是否正确。

开环控制的优势是快，不需要等反馈。代价是没有纠错能力。这就是 Loop 1 需要被包裹的原因：开环在复杂任务上的可靠性不够。

### 2.2 Verification Loop = 闭环负反馈

```
agent 输出 → 评分器检查 → 不通过? → 带错误信息重试 → 重新输出
```

这是控制论最核心的概念：**闭环负反馈**（closed-loop negative feedback）。Norbert Wiener 在 1948 年的《控制论》里用整整一本书讨论这个机制。恒温器测到温度偏低→开加热→温度够了→关加热，和 agent 生成文档→评分器发现链接断裂→带反馈重试→通过，是同一张控制流图。差别只在传感和执行的技术实现上。

这个 loop 的工程关键在评分器（grader）的设计。控制论的**良调节器定理**（Conant & Ashby, 1970）：**任何有效的调节器必须是其所调节系统的模型。** 对应到 agent 工程：grader 必须对"好输出"有足够精确的表征能力。用简单正则匹配评分复杂文档，grader 不是良调节器，verification loop 会产生大量假阴性或假阳性。

LangChain 的 `RubricMiddleware` 用 LLM 当评分器，本质是用更灵活的模型逼近"好输出"的分布。方向对，但也引入了新问题——评分器本身有偏差和方差。闭环系统的稳定性分析：**反馈回路中的噪声会被放大**。LLM-as-judge 不够稳定，verification loop 会把小误差累积成大问题。

### 2.3 Event Driven Loop = 自主触发与系统整合

```
外部事件（Slack 消息、定时触发、webhook）→ agent 运行 → 输出写回系统
```

这是 agent 从"被调用"变成"自运行"的关键转变。控制论对应的是**自主系统**（autonomous system）——系统持续感知环境变化并自主响应，不再等待输入。工业控制领域叫 **SCADA**：传感器持续监测，阈值触发控制动作。Agent 挂在 cron 或 webhook 上，概念上没有区别。做过 DevOps 的人会认出这就是**事件驱动架构**——Kafka、GitHub Actions、Lambda 触发器做的是同一件事。

### 2.4 Hill Climbing Loop = 自适应控制与双重学习

```
trace 数据 → 分析 agent → 发现模式 → 改进 prompt/工具/评分器 → 部署 → 重新产生 trace → ...
```

这是四层中唯一会在运行过程中修改自身配置的一层，也是控制论和 AI 交汇最深的地方。

控制论里叫**自适应控制**（adaptive control）。标准反馈控制假设系统模型不变，自适应控制允许系统在运行中修改控制参数。飞机自动驾驶仪在不同高度和速度下，空气动力学特性不同，控制器实时调整参数。

Agent 的 Hill Climbing Loop 做同一件事：分析历史 trace，识别 prompt 或工具配置中的薄弱点，自动修改，然后观察新配置下的表现。这形成了**双环学习**（double-loop learning, Argyris & Schön, 1978）结构：

```
内环（Loop 1-3）：执行任务 + 验证 + 触发
外环（Loop 4）：  观察内环 → 改配置 → 提升内环表现
```

这层也带来控制论中最棘手的问题：**稳定性与振荡**。自适应控制系统如果参数更新缺乏阻尼，会陷入振荡——改得过猛导致表现恶化，恶化触发更大的改动，系统发散。

LangChain Engine 做的是 **trace → 分析 → 建议 → 人工 review → 部署** 的半自动管道。"人工 review"不是 UX 的点缀，是**控制论意义上的阻尼器**（damper）——防止自适应反馈回路增益过高导致系统震荡。没有阻尼的自适应系统会把自己调死。

四层映射到这里就完整了。随之而来的问题是：这些框架七十年前就有，loop engineering 为什么是现在才火？

---

## 三、为什么说"这不过是自然导向"

Loop engineering 在 2026 年火起来，不是因为它是突破性发现，而是工程实践追上了理论早已走过的路。

### 3.1 历史上的预演

控制论从诞生就在回答一个问题：**如何让系统在没有人类持续干预的情况下可靠地完成目标？** 答案始终是同一个：**层级化的反馈回路**。

1948 年 Wiener 写《控制论》，讨论的是防空火炮的伺服机构。1970 年代，Stafford Beer 把框架应用到组织管理，提出**活系统模型**（Viable System Model）——五个层级的嵌套反馈回路，从操作单元到战略规划。1980 年代，IBM 提出自治计算的 **MAPE-K 循环**（Monitor-Analyze-Plan-Execute-Knowledge），是 Loop 4 的直接前身。

把 LangChain 的四层 Loop 和这些历史框架对比，结构同构：

| LangChain Loop | Viable System Model | MAPE-K |
|---------------|---------------------|--------|
| Agent Loop | System 1（操作单元） | Execute |
| Verification Loop | System 2（协调与稳定性） | Monitor + Analyze |
| Event Loop | System 3（内部集成） | Plan |
| Hill Climbing | System 4/5（适应性与策略） | Knowledge |

任何需要自主完成目标的自适应系统，最终都会收敛到同一组架构模式。

### 3.2 为什么是现在

框架早就存在，为什么 loop engineering 现在才火？三个原因。

**LLM 的不可靠性让反馈回路从可选变成必需。** 传统软件的失败模式可预测（空指针、超时、类型错误），可以在代码层面做防御性编程。LLM 的失败模式是分布性的——可能生成语法正确但语义错误的输出，无法预判。唯一可靠的策略是在每个输出点后面加检查点，这就是 Loop 2 存在的根本原因。

**Agent 的自主性诉求推高了 loop 的层级。** 如果 agent 只被人在聊天框里调用，Loop 1 就够了。一旦要让它"在后台自己跑"（Loop 3）、"越跑越好"（Loop 4），就自然走进了多层级反馈架构。需求本身把工程实践推到了这里。

**Harness engineering 的边际收益在递减，推着工程师往上走一层。** 当改 prompt、换工具、调 middleware 的收益开始稳定，下一步自然是问：这个 loop 本身的结构对不对？要不要在外面再套一层？从调旋钮到设计回路拓扑，是工程实践自然走到的地方，不是某个框架推出来的。

---

## 四、控制论给 Loop Engineering 的警告

既然是同一套东西，控制论几十年积累的工程教训也一并继承了。三个容易被忽略的陷阱：

**4.1 反馈延迟与振荡。** Verification Loop 里评分器检查→反馈→模型重试的循环有延迟。如果反馈信息不够精确（"这篇文档不够好" vs "第三段的 API 参数名错了"），模型会在模糊反馈下反复生成，产生类似**积分饱和**（integral windup）的效果——越调越偏。控制论的解法：反馈信号需要足够的带宽，调度周期需要匹配系统响应时间。

**4.2 层级间的耦合与级联失效。** Hill Climbing Loop 在改 prompt 时，改的是 Loop 1 和 Loop 2 依赖的基础设施。如果 Engine 基于不具代表性的 trace 数据做了错误优化（比如过度拟合了上周的高频问题类型），会同时破坏所有下游 loop 的表现。对应控制论的**级联失效**（cascading failure）——上层控制器的错误通过层级传播，放大而非抑制扰动。

**4.3 自适应系统的目标漂移。** Loop 4 需要明确的优化目标。如果目标是"提高用户满意度"但只能测量"减少验证失败次数"，agent 会学会写更容易通过验证的文档，而不是更好的文档。你给了代理指标（proxy metric）而非真实目标，结果是**目标函数的错误指定**——Goodhart 定律的工程化表述。

4.3 说的不只是一个工程细节：它在暗示 Loop 4 有一个结构性的盲区——它能优化给定的目标，但不能监管目标本身是否正确。这正是控制论下一层要解决的问题。

---

## 五、控制论预言的下一层

Loop engineering 的四层已经对应了控制论从开环到自适应的完整路径。按这条线继续走，控制论给出了两个方向的预言。

### 5.1 自适应控制的上限：Ashby 的超稳定性

Loop 4 的 Hill Climbing 是自适应控制——目标不变，调整参数。控制论里，自适应控制的下一层叫**超稳定系统**（ultrastable system，Ashby 1960）：当参数调整无效时，系统不再继续调参，而是重组控制结构本身。对 agent 来说就是：发现单 agent 的 verification loop 无法捕捉某类错误，不是继续调 prompt，而是自动插入一个专职检查器，改写 Loop 2 的拓扑。

```
Loop 4 识别到：过去 N 轮优化收益递减
         ↓
Level 5 Loop 介入：不是参数问题，是架构问题
         ↓
提议架构变更 → 人工确认 → 部署新架构 → Loop 4 重新运行
```

2026年的 self-evolving 论文群让这个边界变得清晰。APEX（arXiv 2606.15363，今年六月）是目前走得最远的——一个三层联合自进化框架，L3 做 workflow topology 选择，改的是哪些 agent 节点之间有连接，而不只是 prompt 参数，在 Terminal-Bench 上比单轴 harness 优化提升了 90%。MemEvolve（arXiv 2512.18746，去年十二月）演化的是记忆系统的架构本身（encode/store/retrieve/manage 的组织方式），控制结构参与了演化过程。

但这两个系统都没有越过同一条线：**fitness function 仍然是外部给定的。** APEX 从预设候选拓扑里筛选，MemEvolve 由任务基准评分驱动演化方向。SEAGym（2606.17546）这篇评测论文直接把边界写进了定义里：当前所有 self-evolving 系统改变的是 "agent harness"——prompts、memory、tools、middleware、runtime state——没有一个在改 loop 的嵌套结构本身。

SkillCAT、Socratic-SWE、OpenSkill 这批 skill 自进化工作，本质上也是 harness 调优：技能库扩张是参数空间扩展，技能拓扑是更精细的检索结构。改变的还是旋钮，只是旋钮的组织形式变复杂了。

### 5.2 更深一层：二阶控制论

超稳定性解决的是"怎么达到目标"的架构问题。控制论还有更深一层——**二阶控制论**（second-order cybernetics，von Foerster，1970s）：质疑目标本身是否正确。

| 层次 | 做了什么 | 控制论对应 |
|------|---------|-----------|
| Loop 4 | 优化参数，逼近给定目标 | 自适应控制 |
| Level 5 | 优化架构，达到给定目标 | 超稳定系统 |
| Level 6 | 质疑并修正目标本身 | 二阶控制论 |

这正是 Goodhart 定律在 agent 系统里的落点：Loop 4 和 Level 5 都在优化 fitness function，无法识别 fitness function 本身已经偏离了真实目标。

ANCHOR（2606.06114）是2026年最直接触及这个问题的工作。它发现 self-evolving 系统存在 **safety drift**——自主演化过程中，"安全合规"从目标悄然变成了需要规避的约束。ANCHOR 的解法是引入模拟人类监督做纠偏。但这是在系统外部挂一个阻尼器，不是系统自身识别出"我的优化方向偏了"。Q-Evolve 走了半步：系统参与构建过程奖励的标准，但仍以任务最终结果为锚点——它问的是"这一步有没有帮完成任务"，不是"这个任务值不值得完成"。

真正的 Level 6 需要一个运行时的检测器：识别指标与真实目标之间的系统性背离，并触发对 fitness function 本身的修订。这个闭环目前不存在于任何生产系统。它也不只是工程问题——benchmark-driven 的开发范式天然把 fitness function 放在外部，而 Level 6 要求的是对这个外置假设的质疑能力。

### 5.3 往上走的代价

Level 5 和 6 各自解决了一层问题，但控制论也给出了追求它们的代价：每往上一层，两个成本相应放大。

**良调节器定理的要求指数上升。** Level 5 的 loop 要对整个四层架构建模，Level 6 要对 Level 5 建模。系统的复杂性以层级速度累积，调节器的能力必须匹配——没有人能保证 LLM 在每一层都有足够的建模能力。

**人类可审计性持续下降。** Loop 4 改 prompt，人还能 review。Level 5 改架构，review 成本急剧上升。Level 6 质疑优化目标，已经进入了没有明确 ground truth 的领域——审计的尺子本身在变。

控制论的结论：层级越高，越需要更强的**外部锚定**（external grounding）——来自人类价值、业务约束或物理世界的不可变参照。没有锚点，系统会把自己优化到任何方向。ANCHOR 用人类监督做阻尼器、SEAGym 把 fitness function 外置于 harness 定义之外，本质上都是在用工程手段补这个锚点的缺失。这不是工程问题的解法，是在承认 Level 6 还没有闭合的理论答案。

---

## 六、收尾

Loop engineering 是个好名字，降低了理解门槛。但它描述的不是新范式——四层 loop 是反馈控制从 Wiener（1948）经 Beer、MAPE-K 一路走到今天的自然落点，工程实践只是追上了理论早已画好的图。

2026 年涌现的 self-evolving 浪潮大概率会走一遍同样的路：从调旋钮（harness 优化）到改架构（超稳定性），再到某一天不得不面对"旋钮的标准是谁定的"这个问题。每一层看起来都是突破，但从控制论往回看，都是有预言的。

这条路最终会撞上同一堵墙：fitness function 是设计决策，不是客观存在。benchmark-driven 的整个开发范式都在假装它是后者——用基准分数衡量进步，用通过率定义成功——但没有人回头问这个基准本身测的是不是真正想要的东西。这不是可以用更好的工程绕过去的事情。

值得问的不只是"你的 hill climbing loop 有没有阻尼"，还有：你的 fitness function 本身，有没有人质疑过它是否测的是你真正想要的东西？

---

## 延伸阅读

- [The Art of Loop Engineering](https://www.langchain.com/blog/the-art-of-loop-engineering) — Sydney Runkle (LangChain)，四层 loop 的工程实践全景
- [Improving Deep Agents with harness engineering](https://blog.langchain.com/improving-deep-agents-with-harness-engineering/) — Vivek Trivedy (LangChain)，不改模型只改 harness 从 Top30 冲到 Top5 的实战记录
- [Loopcraft: the art of stacking loops](https://www.latent.space/p/ainews-loopcraft-the-art-of-stacking) — swyx 提出的 "loopcraft" 概念
- Norbert Wiener, *Cybernetics: Or Control and Communication in the Animal and the Machine* (1948) — 反馈控制的基础
- Conant & Ashby, "Every Good Regulator of a System Must Be a Model of That System" (1970) — 良调节器定理
- Stafford Beer, *Brain of the Firm* (1972) — 活系统模型，层级化反馈控制在组织管理中的应用
- IBM, "An Architectural Blueprint for Autonomic Computing" (2005) — MAPE-K 循环，Hill Climbing 的前身
- Argyris & Schön, *Organizational Learning: A Theory of Action Perspective* (1978) — 单环与双环学习的原始框架

