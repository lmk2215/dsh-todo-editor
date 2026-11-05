/**
 * Host half of dsh-todo-editor.
 *
 * Registers the `/todo-apply` slash command: the client editor hands it one
 * encoded task list, and the handler appends a `todo/write` session event
 * directly. No model message is created, so saving in the editor updates the
 * task panel immediately instead of starting an agent turn.
 *
 * Command handlers run on the receiving agent, which is why `agent.session` is
 * available here without any extra service.
 */

/** Plugin name reported by the loader. */
export const name = 'dsh-todo-editor'

/** The command registry is the only service this plugin needs. */
export const inject = ['commands']

const STATUSES = new Set(['pending', 'in_progress', 'completed'])

/**
 * Decode and validate the editor payload.
 * @param rawInput - everything after `/todo-apply `, a URI-encoded JSON array.
 * @returns validated todo list; an empty array clears the panel.
 * @throws Error with a user-facing message when the payload is unusable.
 */
function decodePayload(rawInput) {
  const text = String(rawInput == null ? '' : rawInput).trim()
  if (text.length === 0) throw new Error('任务清单为空')
  let json
  try {
    json = decodeURIComponent(text)
  } catch (_) {
    throw new Error('任务清单编码无效')
  }
  let parsed
  try {
    parsed = JSON.parse(json)
  } catch (_) {
    throw new Error('任务清单不是合法 JSON')
  }
  if (!Array.isArray(parsed)) throw new Error('任务清单必须是数组')

  const todos = []
  const seen = new Set()
  for (const item of parsed) {
    const content = String((item && item.content) || '').trim()
    if (content.length === 0) throw new Error('任务内容不能为空')
    if (seen.has(content)) throw new Error(`任务重复：${content}`)
    seen.add(content)
    const status = item && item.status
    if (!STATUSES.has(status)) throw new Error(`任务状态无效：${String(status)}`)
    todos.push({ content, status })
  }
  return todos
}

/**
 * Mount the command.
 * @param ctx - host context carrying the command registry.
 */
export function apply(ctx) {
  ctx.commands.register({
    name: 'todo-apply',
    description: '把任务清单写入当前会话的任务面板（本地编辑，不进入对话）',
    input: { hint: '<编码后的任务清单>' },
    recordInput: false,
    handler: (invocation) => {
      try {
        const todos = decodePayload(invocation.rawInput)
        invocation.agent.session.append('todo/write', { todos })
        return { kind: 'success' }
      } catch (error) {
        return {
          kind: 'error',
          text: String(error && error.message ? error.message : error)
        }
      }
    }
  })
}
