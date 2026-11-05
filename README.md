# dsh-todo-editor

[中文说明 →](README.zh.md)

An **editable task-flow panel** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
Write the checklist yourself, hit save, and the task panel above the composer updates
immediately — **without sending a message to the model**. The agent then walks your nodes
one by one.

```
┌─ header ────────────────────────────────────────────┐
│  Session title                       [☑·3] ← button │
└─────────────────────────────────────────────────────┘
        │ click
        ▼
┌─ 任务流程 ───────────────────────────────────────────┐
│ 1 [ Research the datasheet        ] 待处理   ×      │
│ 2 [ Extract the dimension table   ] 进行中   ×      │
│ 3 [ Cross-check against the PDF   ] 待处理   ×      │
│ ＋ 添加一条                                          │
│                              取消    [ 保存 ]        │
└─────────────────────────────────────────────────────┘
        │ save → /todo-apply …  (no model turn)
        ▼
┌─ 任务  (native panel, now yours) ───────────────────┐
│ ● Research the datasheet                            │
│ ● Extract the dimension table                       │
│ ○ Cross-check against the PDF                       │
└─────────────────────────────────────────────────────┘
```

## Why

Harness ships a task panel that is **read-only** and rendered from the `todos` session
projection. Two consequences:

1. The plan is always authored by the model. You can watch it, not set it.
2. When the projection is empty the component returns `null`, so there is no entry point
   at all before the model writes its first todo.

This plugin flips the direction: **you order, the model executes**. The button lives in the
session header, so it is always reachable — including on a brand-new conversation where the
list is still empty.

## Features

- Header action with an open-item badge; works on an empty list.
- Per-row text editing, `＋` to append, `×` to delete.
- Click the status chip to cycle 待处理 → 进行中 → 已完成 (only one `in_progress` at a time,
  matching the default host policy).
- **Save writes the session directly** through a host command (`/todo-apply`): the panel
  updates instantly, no user message, no model turn, no tokens spent.
- Validation on both sides: empty content, duplicates and unknown states are rejected before
  anything reaches the session log.
- Degrades gracefully: if the command channel is missing (old host half), save falls back to
  sending one structured `［任务流程］` message so the feature still works.

## Requirements

- DeepSeek Harness `>= 0.2.0` (client-plugin slot registry + `dsh-commands`).
- The `conversation.session.header.actions` slot, which is part of
  `@deepseek-ai/dsh-client-ui-conversation`.
- No build step: `lib/client.js` is a hand-written bundle that only requires `react` and
  `react-dom` from the host module table.

## Install

### Option A — plugin manager (has pnpm)

```bash
dsh plugin --profile desktop add dsh-todo-editor
```

### Option B — manual (no pnpm required)

DeepSeek Harness profiles are plain folders, so a local package can be linked by hand:

1. Put this repository somewhere stable, e.g. `~/.dsh/local-plugins/dsh-todo-editor`.
2. Link it into the profile's `node_modules`:

   ```powershell
   # Windows: junction needs no administrator rights
   cmd /c mklink /J "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-todo-editor" ^
     "%USERPROFILE%\.dsh\local-plugins\dsh-todo-editor"
   ```

   ```bash
   # macOS / Linux
   ln -s ~/.dsh/local-plugins/dsh-todo-editor ~/.dsh/profiles/desktop/node_modules/dsh-todo-editor
   ```

3. Register it in `~/.dsh/profiles/desktop/package.json`:

   - append `"dsh-todo-editor"` to `dsh.profile.bundles`
   - add `"dsh-todo-editor": "link:<absolute path to this repo>"` to `dependencies`

4. Restart the Harness app. **A page refresh is not enough** — the client bundle is
   snapshotted when the host boots.

Both options are automated by:

```bash
node scripts/install.mjs            # install / repair
node scripts/install.mjs --revert   # uninstall
```

Use `--profile <dir>` or `--dsh <app/dsh dir>` when the defaults do not match your setup.

## Recommended host patch (optional)

The `todos` projection in `@deepseek-ai/dsh-tool-todo` clears itself on every `turn/start`.
With that behaviour, a checklist you authored disappears the moment you send your next
message, and only reappears once the model rewrites it.

`patches/tool-todo-survive-turn-start.md` documents a one-line change that keeps an
unfinished plan across turns (a fully completed list is still cleared, so stale progress
never lingers). `scripts/install.mjs` applies it with a timestamped backup; `--revert`
restores the backup.

Without the patch the plugin still works — the panel just blinks empty until the model
re-emits the list.

## Usage

1. Click the checklist icon in the session header.
2. Write your nodes. Status chips cycle on click.
3. **保存** — the native task panel above the composer updates immediately.
4. Attach your material and send it. The agent reads the list from the session and executes
   node by node, updating statuses as it goes.

The button badge shows how many items are still open.

## How it works

| Layer | Piece | Role |
| --- | --- | --- |
| Client | `lib/client.js` | Registers slot `conversation.session.header.actions` (`id: todo-editor`, `order: 5`) and renders the popover through a `react-dom` portal |
| Client | `getTodosFace` | Reads `session.projections.faceOf("todos")` and subscribes for live updates |
| Client | `applyTodos` | Calls `session.command("/todo-apply <encodeURIComponent(JSON)>")` |
| Host | `lib/index.js` | Registers `/todo-apply`; the handler runs `agent.session.append("todo/write", { todos })` and returns `{ kind: "success" }` with no text |
| Host | `@deepseek-ai/dsh-tool-todo` | Owns the `todos` projection the panel renders |

Command handlers run directly against the receiving agent and create no model message,
which is exactly why save is instant and silent. `recordInput: false` keeps the encoded
payload out of the session log.

## Uninstall / revert

```bash
node scripts/install.mjs --revert
```

Three things are undone: the profile `node_modules` link, the two `package.json` entries, and
the host patch (restored from its `.bak-todoeditor-*` backup). Restart afterwards.

## Known limitations

- Save is not a lock: a model `todo_write` replaces the whole list, including edits you made.
- Status chips change the prompt text only when the fallback path is used; the command path
  writes the statuses as given.
- The popover is a fixed-position portal, anchored to the button. It does not reposition on
  container scroll (the header does not scroll).
- No keyboard reordering; rows are edited in place and appended at the end.

## License

MIT
