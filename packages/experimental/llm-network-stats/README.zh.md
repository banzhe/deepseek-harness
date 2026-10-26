---
description: "按请求统计 LLM 传输指标，供组合或排查 llmNetworkStats 投影单元的客户端与维护者使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-llm-network-stats

[English](README.md) | 中文

## 概述

本包记录每次 LLM 请求在线路上付出的代价——请求体发送用了多久、响应头等了多久、请求体压缩把体积变成了多少——并通过公开的 `llmNetworkStats` 值提供整会话的汇总读数。这些读数来自完整的持久日志，因此分页与压缩历史都不会改变它们。当客户端需要展示模型产出任何内容之前请求的时间去向，或压缩省下了多少时，使用本包。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本插件挂在 Session 存储、投影注册表，以及会发出 `llm/transport` 事实的 LLM 适配器旁边——`@deepseek-ai/dsh-llm-pi-ai` 会为每个接受注入 `fetch` 的线路协议路由发出这些事实。只有在注册表存在时单元才会注册；没有适配器发出事实时它不记录任何内容。

### 组合

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-projection'
- name: '@deepseek-ai/dsh-experimental-llm-network-stats'
```

### 各字段含义

| 字段 | 含义 |
|---|---|
| `requests` | 上报了传输指标的会话请求数 |
| `uploadMs` | 从发出请求到 HTTP 客户端取走完整请求体的累计耗时，含建立连接 |
| `responseMs` | 从请求体交完到收到响应头的累计耗时 |
| `requestBytes` / `sentBytes` | 压缩前请求体体积与写到线路上的字节数的累计值 |
| `compressedRequests` | 请求体带 `content-encoding` 的计数请求数 |
| `last` | 最后一条计数请求自身的读数，首条之前为 null |

客户端从 `last` 读最近一次请求的读数，从各求和字段除以 `requests` 读整会话平均。只有会话请求计入：辅助调用（压缩、会话标题）仍会被记录，以便读数可以重新推导，但不进入平均与 `last`。

### 失败与恢复

没有投影注册表时单元完全惰性：`inject` 让 fiber 保持 pending，不会注册，其他组合也就没有 `llmNetworkStats` 键。卸载插件会移除该键并停止记录，因为两者都是挂载 fiber 上的 effect。无法写入的记录——会话已不存活、append 被拒绝——只记日志并丢弃，不会让产生它的请求失败。恢复出来的记录若载荷由另一个构建写入，会被丢弃而不是误读。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节说明读数背后的折叠；可观察行为已在[使用本包](#use-this-package)中完整覆盖。

### 设计思路

一次请求的传输事实是关于一个已经成功的请求的诊断信息，因此它们以可忽略的 `plugin:` 记录承载，而不是作为已发布的会话状态：`plugin:llm-network-stats/request` 不新增持久化 schema root，不认识它的读取方会保留并跳过。单元只折叠这一种记录，因此其读数不会与模型输出混淆，未知或畸形的载荷也不会影响折叠结果。

### 源码导览

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`inject`、单元注册，以及 `llm/transport` 写入方 |
| [`src/projection.ts`](src/projection.ts) | 折叠：记录校验、状态结构、wire 视图 |
| [`src/types.ts`](src/types.ts) | 记录载荷与 `llmNetworkStats` 投影键声明的唯一归属 |

### 数据模型

状态就是发布的视图本身——五个求和、请求计数、压缩请求计数与 `last`——因此一个 schema 同时校验持久缓存前置条件与 wire 输出边界。`last` 携带最新一条计数请求自身的读数，带压缩时包含它的 `content-encoding`。

### 折叠规则

- 不是本单元记录的事件返回同一个状态引用；注册表的 `Object.is` 判定让变更流保持安静。
- 载荷校验失败的记录被丢弃；带 `purpose` 的记录会落盘但不计数。
- 每条计数请求都累加到五个求和上；`compressedRequests` 仅在请求体带编码时递增。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当单元的契约不够用时，阅读以下页面。它们从驱动单元的注册表走到上报事实的适配器。

- [会话投影子系统](../../../docs/subsystems/session-projection.zh.md)——驱动单元并提供快照与变更流值的注册表。
- [LLM 流式子系统](../../../docs/subsystems/llm-streaming.zh.md)——传输事实所属的请求与流词汇。
- [pi-ai 适配器包](../../llm/llm-pi-ai/README.zh.md)——发出 `llm/transport` 并持有注入 fetch 的适配器。

-----

<a id="model-experience"></a>
## 模型体验

无。单元把一条插件记录折叠成面向客户端的读模型，不注册任何面向模型的内容；该记录从不进入模型可见表面。

#### KV Cache 影响

无；本包从不组装或发送 provider 请求。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了读数描述的范围以及单元缺席的情形，属于当前的包约束。

- **上传耗时包含建立连接** —— 跨度从发出请求开始，因此冷连接会把 DNS、连接与 TLS 时间一并计入。拆分它们需要本包并不拥有的传输层钩子。
- **交接点在 HTTP 客户端侧测量** —— 最后一次拉取请求体是客户端取走最后一个字节的时刻，而不是对端确认的时刻；因此阻塞的 socket 会把阻塞时间计入。
- **失败的请求不产生读数** —— 事实在收到响应头时上报，因此被中止或被拒绝的请求没有读数，也不进入平均与 `last`。
- **只有注入 `fetch` 的路由会被测量** —— 拒绝注入的协议永远不会被插桩；不在任何 Session 中的请求也没有日志可写。
- **平均会混合不同配置** —— 会话中途改变压缩设置时，平均值覆盖两种情况，因为这些读数描述的是实际发生了什么，而不是当前配置。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
