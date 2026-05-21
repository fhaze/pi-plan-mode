import type { AgentMessage } from "@mariozechner/pi-ai";
import type { TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { isSafeCommand } from "./utils.ts";

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "ask_user_question", "todo"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = false;

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		if (planModeEnabled) {
			ctx.ui.setStatus("plan", ctx.ui.theme.fg("warning", "⏸"));
		} else {
			ctx.ui.setStatus("plan", undefined);
		}
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;

		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
			ctx.ui.notify(`Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
		} else {
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}
		updateStatus(ctx);
	}

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
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
				if (msg.customType === "plan-mode-context") return false;
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
		if (!planModeEnabled) return;

		return {
			message: {
				customType: "plan-mode-context",
				content: `[PLAN MODE ACTIVE]
You are in plan mode — read-only exploration and planning.

Available tools:
- read, bash, grep, find, ls — explore the codebase freely (bash restricted to read-only commands)
- ask_user_question — ask clarifying questions when requirements are ambiguous
- todo — create and manage a task list for your plan

Workflow:
1. Explore the codebase to understand the current state
2. Ask clarifying questions via ask_user_question if needed
3. For complex tasks, use the todo tool to create a structured plan
4. For simple tasks, just confirm your approach briefly

IMPORTANT: When creating multiple tasks, issue ALL todo create calls in parallel in a single response. Do NOT create them one at a time — batch them all at once:
  todo({ action: "create", subject: "Analyze auth module" })
  todo({ action: "create", subject: "Design OAuth2 integration", blockedBy: [1] })
  todo({ action: "create", subject: "Update user model and schema", blockedBy: [2] })

When refining the plan, use:
  todo({ action: "update", id: 2, subject: "Revised description" })   — edit a task
  todo({ action: "update", id: 3, status: "deleted" })                 — remove a task
  todo({ action: "clear" })                                             — remove all tasks and start fresh
  todo({ action: "create", subject: "New task", blockedBy: [1, 2] })   — add a task

You CANNOT use: edit, write. Do NOT attempt to make changes.`,
				display: false,
			},
		};
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
		}

		const entries = ctx.sessionManager.getEntries();
		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: { enabled: boolean } } | undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
		}

		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
		}
		updateStatus(ctx);
	});
}
