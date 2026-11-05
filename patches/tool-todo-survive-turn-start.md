# Optional host patch: keep an unfinished plan across turns

## The behaviour being changed

`@deepseek-ai/dsh-tool-todo` builds the `todos` session projection like this:

```js
apply: (state, event) => {
  if (event.type === "todo/write") return event.data.todos;
  if (event.type === "turn/start") return null;          // ← resets on every new user message
  if (event.type === "user/message") { /* rewind handling */ }
  return state;
}
```

`turn/start` fires when you send a message. So a checklist that is already on screen is wiped
at the exact moment you send the material the checklist refers to. The model usually rewrites
it on its next step, which is why the reset is barely noticeable in normal use — but for a
plan **you** authored it means the panel blinks empty and only comes back if the model decides
to write it again.

## The patch

```diff
-  if (event.type === "turn/start") return null;
+  if (event.type === "turn/start") {
+    // Keep an unfinished plan alive across turns; a fully-completed list still clears.
+    return Array.isArray(state) && state.some((item) => item.status !== "completed") ? state : null;
+  }
```

Semantics after the patch:

| List state at `turn/start` | Result |
| --- | --- |
| `null` or empty | stays empty |
| has any `pending` / `in_progress` item | kept as-is |
| every item `completed` | cleared (no stale progress lingers) |

`todo/write` and the rewind branch are untouched, so the model can still replace or reset the
list at any time.

## Trade-offs

- **Scope.** It is a host-wide change: every session, for every agent, keeps unfinished lists
  across turns. If you run several agents on long-lived plans, each keeps its own list, so this
  is usually the desired behaviour.
- **Residue.** An abandoned plan stays visible until something clears it. The model is told to
  clear its own unfinished lists when a task ends (see `docs/agent-instructions.md`), and a
  fully-completed list self-clears.
- **Upgrades.** A Harness update replaces `lib/index.js` and silently drops the patch. Re-apply
  it after upgrading.

## Applying it

```bash
node scripts/install.mjs --dsh <path to .../resources/app/dsh>
```

It backs the file up as `index.js.bak-todoeditor-<timestamp>` next to the original, refuses to
touch a file whose anchor line is missing (a sign the upstream shape changed), and records
nothing else.

Revert with:

```bash
node scripts/install.mjs --revert --dsh <path to .../resources/app/dsh>
```

## Skipping it

The plugin works without this patch. Saving still writes the list instantly; the only
difference is that the list is cleared when you send your next message and reappears once the
agent writes it again.
