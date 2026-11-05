# Agent instructions (optional)

`dsh-todo-editor` needs no cooperation from the model when the command channel is active:
saving writes a `todo/write` event directly. These instructions only matter for the **fallback
path** (no `/todo-apply` command available) and for keeping the panel honest afterwards.

Append the block below to your global agent instructions (`~/.dsh/AGENTS.md`) or to a project
`AGENTS.md`.

---

## User-authored task flow (`［任务流程］` marker)

When a user message starts with `［任务流程］`, that checklist was authored by the **user** (it
comes from the task-flow editor in the session header):

- Write it with `todo_write` **verbatim**: keep every node's wording and order, copy the
  statuses as given.
- Afterwards only advance statuses (待处理 / 进行中 / 已完成). Do not add, remove or reword
  nodes; explain first if a change is genuinely needed.
- Finish the run when the work is done; do not swap in your own plan unless asked.
- **Without** the marker, behave exactly as before: plan the steps yourself and maintain the
  todo list on your own initiative.

Cleanup note: because an unfinished list now survives across turns (with the recommended host
patch), a plan **you** created should be cleared with `todo_write` when the task ends — an empty
list, or every item completed. Otherwise abandoned nodes keep sitting above the composer.

---

## Why the marker exists

The editor has two save paths:

| Path | What reaches the model |
| --- | --- |
| `/todo-apply` command (preferred) | nothing — the event is written host-side |
| `session.prompt` fallback | one message beginning with `［任务流程］` |

The fallback is what those instructions govern. Since it is a normal user message, the marker is
the only signal that separates "the user dictated this plan" from "the model should plan".
