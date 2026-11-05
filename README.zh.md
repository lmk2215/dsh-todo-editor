# dsh-todo-editor

[English →](README.md)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 加一个**可编辑的任务流程面板**：
清单由你自己写，点保存后输入框上方的任务面板**立刻更新**，**不产生模型消息**；之后模型按你定的节点逐个执行。

```
┌─ 会话头部 ──────────────────────────────────────────┐
│  会话标题                            [☑·3] ← 按钮    │
└─────────────────────────────────────────────────────┘
        │ 点开
        ▼
┌─ 任务流程 ───────────────────────────────────────────┐
│ 1 [ 查阅产品样本           ] 待处理   ×              │
│ 2 [ 提取尺寸表             ] 进行中   ×              │
│ 3 [ 与标准原文交叉核对     ] 待处理   ×              │
│ ＋ 添加一条                                          │
│                              取消    [ 保存 ]        │
└─────────────────────────────────────────────────────┘
        │ 保存 → /todo-apply …（不产生模型回合）
        ▼
┌─ 任务（原生面板，现在装的是你的清单）────────────────┐
│ ● 查阅产品样本                                       │
│ ● 提取尺寸表                                         │
│ ○ 与标准原文交叉核对                                 │
└─────────────────────────────────────────────────────┘
```

## 为什么需要它

Harness 自带的任务面板是**只读**的，数据来自会话投影 `todos`。这带来两个限制：

1. 计划永远由模型拟定，你只能看，不能定；
2. 投影为空时组件直接 `return null` —— 模型写下第一条任务之前，**连入口都不存在**。

本插件把方向反过来：**你下单，模型执行**。入口挂在会话头部，任何时刻都能点，包括列表还空着的新会话。

## 功能

- 头部按钮 + 未完成数量角标，空列表也能用。
- 逐行改文字、`＋` 追加、`×` 删除。
- 点状态标签循环切换「待处理 → 进行中 → 已完成」（同时只允许一个进行中，与宿主默认策略一致）。
- **保存直接写会话**：走宿主命令 `/todo-apply`，面板立刻刷新 —— 没有用户消息、不走模型回合、不消耗 token。
- 双端校验：空内容、重复条目、非法状态在进入会话日志之前就被挡掉。
- 降级可用：命令通道缺失（宿主半边没重启）时，保存自动回退成「发一条 `［任务流程］` 消息」，功能不中断。

## 环境要求

- DeepSeek Harness `>= 0.2.0`（客户端 slot 注册表 + `dsh-commands`）。
- 需要 slot `conversation.session.header.actions`，由 `@deepseek-ai/dsh-client-ui-conversation` 提供。
- 无需构建：`lib/client.js` 是手写 bundle，只从宿主模块表 `require` 了 `react` 与 `react-dom`。

## 安装

### 方式 A — 插件管理器（有 pnpm）

```bash
dsh plugin --profile desktop add dsh-todo-editor
```

### 方式 B — 手动（不需要 pnpm）

DSH 的 profile 就是普通目录，本地包可以手工挂上去：

1. 把本仓库放到固定位置，例如 `~/.dsh/local-plugins/dsh-todo-editor`。
2. 链接进 profile 的 `node_modules`：

   ```powershell
   # Windows：junction 不需要管理员权限
   cmd /c mklink /J "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-todo-editor" ^
     "%USERPROFILE%\.dsh\local-plugins\dsh-todo-editor"
   ```

   ```bash
   # macOS / Linux
   ln -s ~/.dsh/local-plugins/dsh-todo-editor ~/.dsh/profiles/desktop/node_modules/dsh-todo-editor
   ```

3. 在 `~/.dsh/profiles/desktop/package.json` 里登记：

   - `dsh.profile.bundles` 追加 `"dsh-todo-editor"`
   - `dependencies` 追加 `"dsh-todo-editor": "link:<本仓库绝对路径>"`

4. 重启 Harness。**刷新页面不够** —— 客户端 bundle 在宿主启动时快照。

以上两步都有脚本：

```bash
node scripts/install.mjs            # 安装 / 修复
node scripts/install.mjs --revert   # 卸载
```

默认值不匹配时用 `--profile <dir>` 或 `--dsh <app/dsh 目录>` 指定。

## 建议配套的宿主补丁（可选）

`@deepseek-ai/dsh-tool-todo` 里的 `todos` 投影会在每次 `turn/start` 清空。这样你定好的清单，
在发出下一句话时就会消失，等模型重新写一次才回来。

`patches/tool-todo-survive-turn-start.md` 记录了一行改动：**有未完成节点就跨轮保留**，
全部完成后仍然清空（避免陈旧进度常驻）。`scripts/install.mjs` 会带时间戳备份地应用它，
`--revert` 则从备份还原。

不打这个补丁插件也能用，只是面板会先闪空、等模型重发。

## 用法

1. 点会话头部的清单图标。
2. 写节点，点状态标签切状态。
3. **保存** —— 输入框上方的任务面板立刻变成你这份清单。
4. 把材料发出去，模型就按清单逐个节点执行并更新状态。

按钮角标显示还有多少条未完成。

## 实现结构

| 层 | 位置 | 作用 |
| --- | --- | --- |
| 客户端 | `lib/client.js` | 注册 slot `conversation.session.header.actions`（`id: todo-editor`，`order: 5`），用 `react-dom` portal 渲染浮层 |
| 客户端 | `getTodosFace` | 读 `session.projections.faceOf("todos")` 并订阅变化 |
| 客户端 | `applyTodos` | 调 `session.command("/todo-apply <encodeURIComponent(JSON)>")` |
| 宿主 | `lib/index.js` | 注册 `/todo-apply`，handler 执行 `agent.session.append("todo/write", { todos })`，返回不含 text 的 `{ kind: "success" }` |
| 宿主 | `@deepseek-ai/dsh-tool-todo` | 持有 `todos` 投影，面板实际渲染它 |

命令 handler 直接跑在接收 agent 上、不产生模型消息 —— 这就是保存即时且静默的原因。
`recordInput: false` 让编码后的载荷不落进会话日志。

## 卸载 / 回滚

```bash
node scripts/install.mjs --revert
```

共撤销三处：profile `node_modules` 里的链接、`package.json` 的两处登记、宿主补丁（从
`.bak-todoeditor-*` 备份还原）。之后重启。

## 已知限制

- 保存不加锁：模型一次 `todo_write` 会整表替换，包括你改过的内容。
- 状态标签在命令路径下按你设定的状态原样写入；只有回退路径才经由提示文本表达。
- 浮层是 fixed 定位的 portal，锚定按钮；容器滚动不重算位置（头部本身不滚动）。
- 不支持拖动排序，行内编辑、末尾追加。

## 许可证

MIT
