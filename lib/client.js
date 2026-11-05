/**
 * dsh-todo-editor — client half.
 *
 * Registers one action in `conversation.session.header.actions`: a checklist
 * button that opens a small editor for the session's task list. Saving builds a
 * structured `［任务流程］` prompt and hands it to the session, so the agent writes
 * the user-authored plan through `todo_write` and then follows it node by node.
 *
 * Hand-written bundle: only `react` and `react-dom` are required, and both are
 * provided by the host module table (no build step, no npm install).
 */
window.__ModuleLoader__.load({
	id: "dsh-todo-editor",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const ReactDOM = require("react-dom");
		const h = React.createElement;

		/** Marker the agent recognises as "this checklist is the user's, do not rewrite it". */
		const PROMPT_PREFIX = "［任务流程］";
		const LABEL = {
			pending: "待处理",
			in_progress: "进行中",
			completed: "已完成"
		};
		const NEXT = {
			pending: "in_progress",
			in_progress: "completed",
			completed: "pending"
		};

		const CSS = String.raw`
.dte-anchor{display:flex;align-items:center}
.dte-trigger{position:relative;display:grid;place-items:center;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#9aa0a6);cursor:pointer}
.dte-trigger:hover{background:rgba(255,255,255,.08);color:var(--dsw-alias-label-primary,#e8eaed)}
.dte-badge{position:absolute;top:-3px;right:-4px;min-width:14px;height:14px;padding:0 3px;box-sizing:border-box;border-radius:7px;background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff;font-size:9px;line-height:14px;text-align:center;font-weight:600}
.dte-panel{position:fixed;z-index:80;width:392px;max-width:calc(100vw - 24px);box-sizing:border-box;border-radius:12px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));background:var(--dsw-alias-bg-layer-3,#2a2c32);box-shadow:var(--dsw-elevation-panel,0 8px 28px rgba(0,0,0,.45));color:var(--dsw-alias-label-primary,#e8eaed);font-size:13px;overflow:hidden}
.dte-head{display:flex;align-items:baseline;gap:8px;padding:11px 12px 6px}
.dte-title{font-weight:600;font-size:13px}
.dte-hint{color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:11px;margin-left:auto;text-align:right}
.dte-list{max-height:304px;overflow-y:auto;padding:2px 10px 4px;display:flex;flex-direction:column;gap:4px}
.dte-row{display:flex;align-items:center;gap:6px}
.dte-idx{width:16px;flex:none;color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:11px;text-align:right}
.dte-input{flex:1;min-width:0;height:26px;padding:0 8px;box-sizing:border-box;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:inherit;font-size:12.5px;outline:none}
.dte-input:focus{border-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dte-status{flex:none;height:24px;padding:0 7px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:transparent;color:var(--dsw-alias-label-secondary,#c4c7cc);font-size:11px;cursor:pointer}
.dte-status[data-s="in_progress"]{color:#8ab4f8;border-color:rgba(138,180,248,.5)}
.dte-status[data-s="completed"]{color:#81c995;border-color:rgba(129,201,149,.5)}
.dte-del{flex:none;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#9aa0a6);cursor:pointer;font-size:15px;line-height:1}
.dte-del:hover{color:#f28b82;background:rgba(242,139,130,.12)}
.dte-add{margin:4px 10px 0;height:28px;border-radius:6px;border:1px dashed rgba(255,255,255,.18);background:transparent;color:var(--dsw-alias-label-tertiary,#9aa0a6);font-size:12px;cursor:pointer}
.dte-add:hover{color:var(--dsw-alias-label-primary,#e8eaed);border-color:rgba(255,255,255,.34)}
.dte-foot{display:flex;align-items:center;gap:8px;padding:10px 12px 12px}
.dte-err{color:#f28b82;font-size:11px;flex:1;min-width:0}
.dte-spacer{flex:1}
.dte-btn{height:26px;padding:0 12px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:transparent;color:var(--dsw-alias-label-secondary,#c4c7cc);font-size:12px;cursor:pointer}
.dte-btn:hover{color:var(--dsw-alias-label-primary,#e8eaed)}
.dte-btn[data-primary="1"]{background:var(--dsw-alias-brand-primary,#4d6bfe);border-color:transparent;color:#fff}
.dte-btn:disabled{opacity:.5;cursor:default}
`;

		/** Inject the stylesheet once per page. Never throws. */
		function ensureCss() {
			try {
				if (typeof document === "undefined") return;
				if (document.querySelector('style[data-dsh-todo-editor="1"]')) {
					// Hot-reload path: rewrite the sheet when its text changed, so a patched
					// stylesheet lands on the next render without a page reload.
					const existing = document.querySelector('style[data-dsh-todo-editor="1"]');
					if (existing && existing.textContent !== CSS) existing.textContent = CSS;
					return;
				}
				const tag = document.createElement("style");
				tag.dataset.dshTodoEditor = "1";
				tag.textContent = CSS;
				document.head.appendChild(tag);
			} catch (_) {}
		}

		/**
		 * Count the three lifecycle states.
		 * @param list - projected todo list (may be empty).
		 * @returns counts plus the number of unfinished items.
		 */
		function statusCount(list) {
			let pending = 0;
			let active = 0;
			let done = 0;
			for (const item of list) {
				if (item.status === "completed") done++;
				else if (item.status === "in_progress") active++;
				else pending++;
			}
			return { pending, active, done, open: pending + active };
		}

		/**
		 * Build the structured prompt the agent receives on save.
		 * @param list - validated rows (non-empty content, unique).
		 * @returns prompt text beginning with PROMPT_PREFIX.
		 */
		function buildPrompt(list) {
			const lines = list.map((item, index) => `${index + 1}. ${item.content} —— ${LABEL[item.status] || LABEL.pending}`);
			return [
				PROMPT_PREFIX + "下面这份清单是我定好的执行流程。节点文字和顺序以我的为准，不要增删或改写；你只负责推进每一节点的状态。",
				"",
				...lines,
				"",
				"请先用 todo_write 把这份清单原样写入（状态照抄），然后停下来等我把材料发过来，再逐个节点执行。"
			].join("\n");
		}

		/**
		 * Subscribe to a projection face and return its current value.
		 * @param face - identity-stable projection face, or undefined when the session is closed.
		 * @returns latest snapshot (undefined while the key carries no value).
		 */
		function useFaceSnapshot(face) {
			const [value, setValue] = React.useState(() => {
				try {
					return face ? face.getSnapshot() : undefined;
				} catch (_) {
					return undefined;
				}
			});
			React.useEffect(() => {
				if (!face || typeof face.subscribe !== "function") return undefined;
				let off;
				try {
					off = face.subscribe(() => {
						try {
							setValue(face.getSnapshot());
						} catch (_) {}
					});
				} catch (_) {}
				return () => {
					try {
						if (typeof off === "function") off();
					} catch (_) {}
				};
			}, [face]);
			return value;
		}

		/**
		 * Header action: trigger button plus the editor popover.
		 * @param props - slot props: sessionId plus the injected verbs.
		 */
		function TodoEditorAction(props) {
			ensureCss();
			const { sessionId, getTodosFace, sendPrompt, applyTodos } = props;
			const face = React.useMemo(() => {
				try {
					return getTodosFace(sessionId);
				} catch (_) {
					return undefined;
				}
			}, [sessionId, getTodosFace]);
			const snapshot = useFaceSnapshot(face);
			const projected = Array.isArray(snapshot) ? snapshot : [];
			const counts = statusCount(projected);

			const [open, setOpen] = React.useState(false);
			const [rows, setRows] = React.useState([]);
			const [error, setError] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const [pos, setPos] = React.useState(null);
			const triggerRef = React.useRef(null);
			const panelRef = React.useRef(null);

			const place = React.useCallback(() => {
				try {
					const el = triggerRef.current;
					if (!el || typeof window === "undefined") return;
					const rect = el.getBoundingClientRect();
					const width = Math.min(392, window.innerWidth - 24);
					const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
					setPos({ top: Math.round(rect.bottom + 8), left: Math.round(left) });
				} catch (_) {}
			}, []);

			const openPanel = React.useCallback(() => {
				const seed = (Array.isArray(snapshot) ? snapshot : []).map((item) => ({
					content: item.content,
					status: item.status
				}));
				setRows(seed.length > 0 ? seed : [{ content: "", status: "pending" }]);
				setError("");
				setOpen(true);
				place();
			}, [snapshot, place]);

			const close = React.useCallback(() => {
				setOpen(false);
				setError("");
			}, []);

			React.useEffect(() => {
				if (!open) return undefined;
				const onDown = (event) => {
					const target = event.target;
					if (panelRef.current && panelRef.current.contains(target)) return;
					if (triggerRef.current && triggerRef.current.contains(target)) return;
					close();
				};
				const onKey = (event) => {
					if (event.key === "Escape") close();
				};
				document.addEventListener("mousedown", onDown, true);
				document.addEventListener("keydown", onKey, true);
				return () => {
					document.removeEventListener("mousedown", onDown, true);
					document.removeEventListener("keydown", onKey, true);
				};
			}, [open, close]);

			React.useEffect(() => {
				if (!open) return undefined;
				const onResize = () => place();
				window.addEventListener("resize", onResize);
				return () => window.removeEventListener("resize", onResize);
			}, [open, place]);

			const updateContent = (index, value) => {
				setRows((prev) => prev.map((row, at) => (at === index ? { ...row, content: value } : row)));
			};

			const cycleStatus = (index) => {
				setRows((prev) => {
					const next = [...prev];
					const value = NEXT[next[index].status] || "pending";
					next[index] = { ...next[index], status: value };
					if (value === "in_progress") {
						for (let at = 0; at < next.length; at++) {
							if (at !== index && next[at].status === "in_progress") next[at] = { ...next[at], status: "pending" };
						}
					}
					return next;
				});
			};

			const removeRow = (index) => {
				setRows((prev) => {
					const next = prev.filter((_, at) => at !== index);
					return next.length > 0 ? next : [{ content: "", status: "pending" }];
				});
			};

			const addRow = () => {
				setRows((prev) => [...prev, { content: "", status: "pending" }]);
			};

			const save = React.useCallback(async () => {
				const clean = rows
					.map((row) => ({ content: String(row.content || "").trim(), status: row.status }))
					.filter((row) => row.content.length > 0);
				if (clean.length === 0) {
					setError("至少写一条任务");
					return;
				}
				const seen = new Set();
				for (const row of clean) {
					if (seen.has(row.content)) {
						setError("有重复的条目：" + row.content);
						return;
					}
					seen.add(row.content);
				}
				setBusy(true);
				setError("");
				try {
					const applied = await applyTodos(sessionId, clean);
					if (applied.ok) {
						setOpen(false);
						return;
					}
					if (applied.matched === false) {
						// The command channel is not mounted (host half not reloaded yet):
						// fall back to handing the list to the agent through the conversation.
						const ok = await sendPrompt(sessionId, buildPrompt(clean));
						if (ok) setOpen(false);
						else setError("命令通道未就绪，回退发送也失败了");
						return;
					}
					setError(applied.reason || "写入失败");
				} catch (err) {
					setError(String(err && err.message ? err.message : err));
				} finally {
					setBusy(false);
				}
			}, [rows, sessionId, sendPrompt, applyTodos]);

			const trigger = h(
				"div",
				{ className: "dte-anchor" },
				h(
					"button",
					{
						ref: triggerRef,
						type: "button",
						className: "dte-trigger",
						title: open ? "收起任务流程" : "编辑任务流程",
						"aria-label": "编辑任务流程",
						"aria-expanded": open,
						"data-testid": "todo-editor-trigger",
						onClick: () => {
							if (open) setOpen(false);
							else openPanel();
						}
					},
					h(
						"svg",
						{ width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
						h("path", {
							d: "M2.4 4.1l1.35 1.35L6.6 2.5",
							stroke: "currentColor",
							strokeWidth: 1.4,
							strokeLinecap: "round",
							strokeLinejoin: "round"
						}),
						h("path", {
							d: "M2.4 9.6l1.35 1.35L6.6 8",
							stroke: "currentColor",
							strokeWidth: 1.4,
							strokeLinecap: "round",
							strokeLinejoin: "round"
						}),
						h("path", {
							d: "M8.7 3.8h4.9M8.7 9.3h4.9",
							stroke: "currentColor",
							strokeWidth: 1.4,
							strokeLinecap: "round"
						})
					),
					counts.open > 0 ? h("span", { className: "dte-badge" }, String(counts.open)) : null
				)
			);

			if (!open) return trigger;

			const panel = h(
				"div",
				{
					ref: panelRef,
					className: "dte-panel",
					style: pos ? { top: pos.top + "px", left: pos.left + "px" } : { top: "64px", right: "12px" },
					role: "dialog",
					"aria-label": "任务流程编辑器",
					"data-testid": "todo-editor-panel"
				},
				h(
					"div",
					{ className: "dte-head" },
					h("span", { className: "dte-title" }, "任务流程"),
					h("span", { className: "dte-hint" }, "保存即写入任务面板，不进入对话")
				),
				h(
					"div",
					{ className: "dte-list" },
					rows.map((row, index) =>
						h(
							"div",
							{ className: "dte-row", key: index },
							h("span", { className: "dte-idx" }, String(index + 1)),
							h("input", {
								className: "dte-input",
								value: row.content,
								placeholder: "这一步要做什么",
								onChange: (event) => updateContent(index, event.target.value)
							}),
							h(
								"button",
								{
									type: "button",
									className: "dte-status",
									"data-s": row.status,
									title: "点一下切换状态",
									onClick: () => cycleStatus(index)
								},
								LABEL[row.status] || LABEL.pending
							),
							h(
								"button",
								{ type: "button", className: "dte-del", title: "删除这一条", onClick: () => removeRow(index) },
								"×"
							)
						)
					)
				),
				h("button", { type: "button", className: "dte-add", onClick: addRow }, "＋ 添加一条"),
				h(
					"div",
					{ className: "dte-foot" },
					error ? h("span", { className: "dte-err" }, error) : h("span", { className: "dte-spacer" }),
					h("button", { type: "button", className: "dte-btn", disabled: busy, onClick: close }, "取消"),
					h(
						"button",
						{
							type: "button",
							className: "dte-btn",
							"data-primary": "1",
							disabled: busy,
							onClick: () => {
								void save();
							}
						},
						busy ? "写入中…" : "保存"
					)
				)
			);

			return h(React.Fragment, null, trigger, ReactDOM.createPortal(panel, document.body));
		}

		const inject = ["slots", "sessions"];

		/**
		 * Register the header action.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ensureCss();
			const sessions = ctx.sessions;
			ctx.slots.inject("conversation.session.header.actions", () =>
				ctx.slots.register(
					{
						name: "conversation.session.header.actions",
						id: "todo-editor",
						order: 5,
						inject: () => ({
							getTodosFace: (sessionId) => {
								try {
									const binding = sessions.binding(sessionId);
									if (!binding) return undefined;
									return binding.session.projections.faceOf("todos");
								} catch (_) {
									return undefined;
								}
							},
							sendPrompt: async (sessionId, text) => {
								try {
									const binding = sessions.binding(sessionId);
									if (!binding) return false;
									const result = await binding.session.prompt([{ type: "text", text }], "queue");
									return Boolean(result && result.ok);
								} catch (_) {
									return false;
								}
							},
							applyTodos: async (sessionId, todos) => {
								try {
									const binding = sessions.binding(sessionId);
									if (!binding) return { ok: false, reason: "会话未打开", matched: true };
									const payload = encodeURIComponent(JSON.stringify(todos));
									const result = await binding.session.command("/todo-apply " + payload);
									if (!result || !result.ok) return { ok: false, reason: "命令执行失败", matched: true };
									if (!result.value || result.value.matched !== true) {
										return { ok: false, reason: "命令通道未注册", matched: false };
									}
									return { ok: true };
								} catch (err) {
									return { ok: false, reason: String(err && err.message ? err.message : err), matched: true };
								}
							}
						})
					},
					TodoEditorAction
				)
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.name = "dsh-todo-editor";
		return module.exports;
	}
});
