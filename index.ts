import type { AgentMessage } from "@mariozechner/pi-ai";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { extractTodoItems, isSafeCommand, markCompletedSteps, type TodoItem } from "./utils.ts";

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "ask_user_question"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];
const WIDGET_KEY = "plan-mode";
const MAX_WIDGET_LINES = 12;

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function formatStepGlyph(item: TodoItem, theme: Theme): string {
	if (item.completed) return theme.fg("success", "✓");
	return theme.fg("dim", "○");
}

function formatStepLine(item: TodoItem, theme: Theme): string {
	const glyph = formatStepGlyph(item, theme);
	const subjectColor = item.completed ? "dim" : "text";
	let subject = theme.fg(subjectColor, item.text);
	if (item.completed) subject = theme.strikethrough(subject);
	return `${glyph} ${subject}`;
}

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let widgetRegistered = false;
	let tuiRef: { requestRender(): void } | undefined;
	let hiddenCompleted = new Set<number>();

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	function renderWidget(theme: Theme, width: number): string[] {
		const visible = todoItems.filter((item) => !hiddenCompleted.has(item.step));
		if (visible.length === 0 && !executionMode && !planModeEnabled) return [];

		const truncate = (line: string): string => {
			if (line.length <= width) return line;
			return line.slice(0, width - 1) + "…";
		};
		const completed = todoItems.filter((t) => t.completed).length;
		const total = todoItems.length;

		const lines: string[] = [];

		if (executionMode && total > 0) {
			const headingIcon = theme.fg("accent", "●");
			const headingText = theme.fg("accent", `Plan (${completed}/${total})`);
			lines.push(truncate(`${headingIcon} ${headingText}`));
		} else if (planModeEnabled) {
			lines.push(truncate(`${theme.fg("warning", "○")} ${theme.fg("warning", "Plan mode")}`));
		}

		if (visible.length === 0) return lines;

		const budget = MAX_WIDGET_LINES - lines.length - (visible.length > MAX_WIDGET_LINES - lines.length ? 1 : 0);
		const shown = visible.slice(0, Math.max(budget, 1));
		const remaining = visible.length - shown.length;

		for (let i = 0; i < shown.length; i++) {
			const isLast = i === shown.length - 1 && remaining === 0;
			const connector = isLast ? theme.fg("dim", "└─") : theme.fg("dim", "├─");
			lines.push(truncate(`${connector} ${formatStepLine(shown[i], theme)}`));
		}

		if (remaining > 0) {
			lines.push(truncate(`${theme.fg("dim", "└─")} ${theme.fg("dim", `+${remaining} more`)}`));
		}

		return lines;
	}

	function updateWidget(ctx: ExtensionContext): void {
		const hasContent = planModeEnabled || executionMode || todoItems.length > 0;

		if (!hasContent) {
			if (widgetRegistered) {
				ctx.ui.setWidget(WIDGET_KEY, undefined);
				widgetRegistered = false;
				tuiRef = undefined;
			}
			ctx.ui.setStatus("plan", undefined);
			return;
		}

		if (executionMode && todoItems.length > 0) {
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus("plan", ctx.ui.theme.fg("accent", `${completed}/${todoItems.length}`));
		} else if (planModeEnabled) {
			ctx.ui.setStatus("plan", undefined);
		}

		if (!widgetRegistered) {
			ctx.ui.setWidget(
				WIDGET_KEY,
				(tui, theme) => {
					tuiRef = tui;
					return {
						render: (width: number) => renderWidget(theme, width),
						invalidate: () => {
							widgetRegistered = false;
							tuiRef = undefined;
						},
					};
				},
				{ placement: "aboveEditor" },
			);
			widgetRegistered = true;
		} else {
			tuiRef?.requestRender();
		}
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;
		executionMode = false;
		todoItems = [];
		hiddenCompleted.clear();

		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
			ctx.ui.notify(`Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
		} else {
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}
		updateWidget(ctx);
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			todos: todoItems,
			executing: executionMode,
		});
	}

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerCommand("todos", {
		description: "Show current plan progress",
		handler: async (_args, ctx) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No plan steps yet. Use /plan to enable plan mode.", "info");
				return;
			}
			const list = todoItems
				.map((item) => {
					const glyph = item.completed ? "✓" : "○";
					return `${item.step}. ${glyph} ${item.text}`;
				})
				.join("\n");
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.notify(`Plan (${completed}/${todoItems.length}):\n${list}`, "info");
		},
	});

	pi.registerShortcut(Key.ctrlShift("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	pi.on("tool_call", async (event) => {
		if (!planModeEnabled || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `Plan mode: command blocked (not allowlisted). Use /plan to disable plan mode first.\nCommand: ${command}`,
			};
		}
	});

	pi.on("context", async (event) => {
		if (planModeEnabled) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "plan-mode-context" || msg.customType === "plan-execution-context") return false;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[PLAN MODE ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c) => c.type === "text" && (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
					);
				}
				return true;
			}),
		};
	});

	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in plan mode — read-only exploration and planning.

Available tools:
- read, bash, grep, find, ls — explore the codebase freely (bash restricted to read-only commands)
- ask_user_question — ask clarifying questions when requirements are ambiguous

Workflow:
1. Explore the codebase to understand the current state
2. Ask clarifying questions via ask_user_question if needed
3. For complex tasks, create a numbered plan under a "Plan:" header
4. For simple tasks, just confirm your approach briefly

Plan format for complex tasks:
Plan:
1. Analyze the existing authentication module
2. Design the new OAuth2 integration
3. Update the user model and database schema
4. Implement the auth flow
5. Add tests

You CANNOT use: edit, write. Do NOT attempt to make changes.`,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.

IMPORTANT: You MUST mark each completed step by including a [DONE:n] tag in your response (where n is the step number). These tags are how progress is tracked.

Examples:
- After finishing step ${remaining[0]?.step ?? 1}: include [DONE:${remaining[0]?.step ?? 1}] in your response
- After finishing multiple steps: include [DONE:1] [DONE:2] [DONE:3]

Always include [DONE:n] tags when a step is complete. Do NOT skip this.`,
					display: false,
				},
			};
		}
	});

	pi.on("agent_start", async () => {
		if (executionMode) {
			hiddenCompleted = new Set();
		}
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!executionMode || todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, todoItems) > 0) {
			for (const item of todoItems) {
				if (item.completed) {
					hiddenCompleted.add(item.step);
				}
			}
			updateWidget(ctx);
		}
		persistState();
	});

	pi.on("agent_end", async (event, ctx) => {
		if (executionMode && todoItems.length > 0) {
			if (todoItems.every((t) => t.completed)) {
				const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
					{ triggerTurn: false },
				);
				executionMode = false;
				todoItems = [];
				hiddenCompleted.clear();
				pi.setActiveTools(NORMAL_MODE_TOOLS);
				updateWidget(ctx);
				persistState();
			}
			return;
		}

		if (!planModeEnabled || !ctx.hasUI) return;

		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const extracted = extractTodoItems(getTextContent(lastAssistant));
			if (extracted.length > 0) {
				todoItems = extracted;
			}
		}

		updateWidget(ctx);

		if (todoItems.length === 0) return;

		const choice = await ctx.ui.select("Plan mode — what next?", [
			"Execute the plan (track progress)",
			"Stay in plan mode",
			"Refine the plan",
		]);

		if (choice === "Execute the plan (track progress)") {
			planModeEnabled = false;
			executionMode = true;
			hiddenCompleted.clear();
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			updateWidget(ctx);
			persistState();

			pi.sendUserMessage(`Execute the plan. Start with: ${todoItems[0].text}`);
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim());
			}
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
		}

		const entries = ctx.sessionManager.getEntries();
		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: { enabled: boolean; todos?: TodoItem[]; executing?: boolean } } | undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			todoItems = planModeEntry.data.todos ?? todoItems;
			executionMode = planModeEntry.data.executing ?? executionMode;
		}

		if (executionMode && todoItems.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (entry.type === "message" && "message" in entry && isAssistantMessage(entry.message as AgentMessage)) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, todoItems);
		}

		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
		}
		updateWidget(ctx);
	});
}
