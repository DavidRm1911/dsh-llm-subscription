/**
 * Native DSH LLM adapter for Claude Code / Antigravity CLI subscriptions.
 * Same seam as @deepseek-ai/dsh-llm-deepseek (registerAdapter, LlmAdapter),
 * confirmed by reading that package's compiled source directly. Reasoning
 * effort is exposed via LlmModelReasoningInfo — the *existing*
 * conversation.input.model composer seat already renders whatever an
 * adapter declares there, so this needed no new client-ui plugin, just the
 * right shape on resolveModel()/prepareCall().
 *
 * No streaming deltas (the underlying CLIs don't expose token-by-token
 * output in headless mode — a whole response arrives as one text-delta), no
 * image support, no credential handling (there's no credential to handle).
 */

import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { join, delimiter } from "node:path";
import { promisify } from "node:util";
import { LlmAdapter, LlmError } from "@deepseek-ai/dsh-llm";

const run = promisify(execFile);

// Checked once at module load — a stale PATH after this won't be noticed
// until the profile restarts, same as any other plugin's startup checks.
function which(bin) {
	for (const dir of (process.env.PATH ?? "").split(delimiter)) {
		if (!dir) continue;
		const candidate = join(dir, bin);
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			// not here — keep looking
		}
	}
	return null;
}

const CLI_FOR_PROVIDER = { claude: "claude", gemini: "agy" };
const AVAILABLE = Object.fromEntries(
	Object.entries(CLI_FOR_PROVIDER).map(([provider, bin]) => [provider, which(bin) !== null]),
);

const REASONING = {
	claude: {
		efforts: [
			{ id: "low", name: "Low" },
			{ id: "medium", name: "Medium" },
			{ id: "high", name: "High" },
			{ id: "xhigh", name: "Extra high" },
			{ id: "max", name: "Max" },
		],
		defaultEffort: "medium",
	},
	// Gemini's tier is already baked into the model name (Low/Medium/High are
	// separate listed models below) — a second effort control would just
	// duplicate that choice, so gemini has no `reasoning` entry.
};

const MODELS = {
	claude: [
		{ id: "claude", name: "Claude (default)" },
		{ id: "haiku", name: "Claude Haiku" },
		{ id: "sonnet", name: "Claude Sonnet" },
		{ id: "opus", name: "Claude Opus" },
		{ id: "fable", name: "Claude Fable" },
	],
	gemini: [
		{ id: "gemini-flash-low", name: "Gemini 3.5 Flash (Low)" },
		{ id: "gemini-flash-medium", name: "Gemini 3.5 Flash (Medium)" },
		{ id: "gemini-flash-high", name: "Gemini 3.5 Flash (High)" },
		{ id: "gemini-pro-low", name: "Gemini 3.1 Pro (Low)" },
		{ id: "gemini-pro-high", name: "Gemini 3.1 Pro (High)" },
	],
};

// claude's own --model flag, or nothing for the bare "claude" default
const CLAUDE_MODEL_FLAG = { claude: null, haiku: "haiku", sonnet: "sonnet", opus: "opus", fable: "fable" };

// agy's own --model flag — the real string agy expects, per `agy models`
const GEMINI_MODEL_FLAG = {
	"gemini-flash-low": "Gemini 3.5 Flash (Low)",
	"gemini-flash-medium": "Gemini 3.5 Flash (Medium)",
	"gemini-flash-high": "Gemini 3.5 Flash (High)",
	"gemini-pro-low": "Gemini 3.1 Pro (Low)",
	"gemini-pro-high": "Gemini 3.1 Pro (High)",
};

function flattenMessages(messages) {
	return messages
		.map((m) => {
			const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
			return `${m.role === "user" ? "User" : "Assistant"}: ${text}`;
		})
		.join("\n\n");
}

function modelInfoFor(provider, model) {
	return {
		provider,
		id: model,
		name: model,
		inputModalities: ["text"],
		context: { contextWindow: 200000 },
		reasoning: REASONING[provider],
	};
}

// Wraps a CLI subprocess call so every failure mode (missing binary — should
// already be filtered by AVAILABLE, but this is the last line of defense if
// PATH changed after startup — timeout, non-JSON output, non-zero exit)
// surfaces as a real LlmError with a stable code instead of a raw stack
// trace or an uncaught rejection.
async function runCli(bin, args, provider, { timeout }) {
	let stdout;
	try {
		({ stdout } = await run(bin, args, { timeout }));
	} catch (cause) {
		if (cause?.code === "ENOENT") {
			throw new LlmError(`llm-subscription: \`${bin}\` was on PATH at startup but is missing now`, "MISSING_CLI", { cause });
		}
		if (cause?.killed || cause?.signal === "SIGTERM") {
			throw new LlmError(`llm-subscription: \`${bin}\` timed out after ${timeout}ms`, "TIMEOUT", { cause });
		}
		throw new LlmError(`llm-subscription: \`${bin}\` exited with an error`, "PROVIDER_ERROR", { cause });
	}
	try {
		return JSON.parse(stdout);
	} catch (cause) {
		throw new LlmError(
			`llm-subscription: \`${bin}\` returned non-JSON output: ${stdout.slice(0, 200)}`,
			"INVALID_RESPONSE",
			{ cause },
		);
	}
}

class SubscriptionAdapter extends LlmAdapter {
	providerInfo(provider) {
		return { id: provider, name: provider === "claude" ? "Claude (subscription)" : "Gemini (subscription)" };
	}

	listModels(provider) {
		return Promise.resolve((MODELS[provider] ?? []).map((m) => modelInfoFor(provider, m.id)));
	}

	resolveModel(provider, model, _signal) {
		return Promise.resolve(modelInfoFor(provider, model));
	}

	prepareCall(provider, model, _signal) {
		return Promise.resolve({
			model: modelInfoFor(provider, model),
			stream: (options) => this.stream(options),
		});
	}

	async *stream(options) {
		const prompt = flattenMessages(options.messages);
		const effort = options.reasoningEffort;
		const { text, inputTokens, outputTokens } =
			options.provider === "claude"
				? await this.runClaude(prompt, options.system, effort, options.model)
				: await this.runGemini(prompt, options.system, options.model);

		yield { type: "block-start", index: 0, blockType: "text" };
		yield { type: "text-delta", index: 0, text };
		yield { type: "block-end", index: 0, block: { type: "text", text } };
		yield { type: "usage", usage: { inputTokens, outputTokens } };
		yield { type: "finish", reason: { kind: "stop" } };
	}

	async runClaude(prompt, system, effort, model) {
		const args = ["-p", prompt, "--output-format", "json", "--tools", "", "--strict-mcp-config"];
		if (system) args.push("--system-prompt", system);
		if (effort) args.push("--effort", effort);
		const modelFlag = CLAUDE_MODEL_FLAG[model];
		if (modelFlag) args.push("--model", modelFlag);

		const data = await runCli("claude", args, "claude", { timeout: 120_000 });
		if (data.is_error) throw new LlmError(`claude CLI reported an error: ${data.result}`, "PROVIDER_ERROR");

		// --model only accepts an alias (sonnet/opus/haiku) — the CLI's own
		// modelUsage breakdown has the real, dated model id(s) that served the
		// request. Claude Code also uses a small internal model for auxiliary
		// work (session titling etc.); that shows up here too, so pick the
		// entry with the most output tokens — the one that actually wrote the
		// visible response — rather than listing every model touched.
		const usage = Object.entries(data.modelUsage ?? {});
		const mainModel = usage.sort((a, b) => (b[1]?.outputTokens ?? 0) - (a[1]?.outputTokens ?? 0))[0]?.[0];
		const text = mainModel ? `${data.result ?? ""}\n\n---\n_via ${mainModel}_` : data.result ?? "";
		return {
			text,
			inputTokens: data.usage?.input_tokens ?? 0,
			outputTokens: data.usage?.output_tokens ?? 0,
		};
	}

	// Unlike claude, agy has no flag to isolate a headless call from its own
	// built-in tools — verified empirically: asked to list its tools, it
	// reports its full native set (run_command, write_to_file, etc.) even
	// here. Not a code fix available on our end; we never parse or act on
	// structured tool-call output from agy, only the plain response text, so
	// there's no execution path for that — but the model's own awareness of
	// those tools can still shape how it answers. Documented, not silently
	// ignored.
	async runGemini(prompt, system, model) {
		const fullPrompt = system ? `System: ${system}\n\n${prompt}` : prompt;
		const modelFlag = GEMINI_MODEL_FLAG[model] ?? "Gemini 3.5 Flash (Medium)";
		const args = ["-p", fullPrompt, "--model", modelFlag, "--output-format", "json", "--disable-slash-commands"];

		const data = await runCli("agy", args, "gemini", { timeout: 330_000 });
		if (data.status !== "SUCCESS") {
			throw new LlmError(`agy CLI reported failure: ${JSON.stringify(data)}`, "PROVIDER_ERROR");
		}
		return {
			text: (data.response ?? "").replace(/\n$/, ""),
			inputTokens: data.usage?.input_tokens ?? 0,
			outputTokens: data.usage?.output_tokens ?? 0,
		};
	}
}

export const inject = ["llm"];

export const name = "llm-subscription";

function apply(ctx) {
	const providers = Object.keys(CLI_FOR_PROVIDER).filter((p) => AVAILABLE[p]);
	if (providers.length === 0) {
		ctx.logger?.warn?.(
			"llm-subscription: neither `claude` nor `agy` found on PATH at startup — no providers registered",
		);
		return;
	}

	const adapter = new SubscriptionAdapter();
	for (const provider of providers) {
		ctx.llm.registerConfigurableProviders([
			{
				provider,
				displayName: provider === "claude" ? "Claude (subscription)" : "Gemini (subscription)",
				settingsNs: `llm-subscription-${provider}`,
				settingsPath: [],
			},
		]);
	}
	ctx.llm.registerAdapter(providers, adapter);
}

apply.inject = ["llm"];

export default apply;
