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
import { promisify } from "node:util";
import { LlmAdapter } from "@deepseek-ai/dsh-llm";

const run = promisify(execFile);

const PROVIDERS = ["claude", "gemini"];

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
		const { stdout } = await run("claude", args, { timeout: 120_000 });
		const data = JSON.parse(stdout);
		if (data.is_error) throw new Error(`claude CLI reported an error: ${data.result}`);
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

	async runGemini(prompt, system, model) {
		const fullPrompt = system ? `System: ${system}\n\n${prompt}` : prompt;
		const modelFlag = GEMINI_MODEL_FLAG[model] ?? "Gemini 3.5 Flash (Medium)";
		const args = ["-p", fullPrompt, "--model", modelFlag, "--output-format", "json", "--disable-slash-commands"];
		const { stdout } = await run("agy", args, { timeout: 330_000 });
		const data = JSON.parse(stdout);
		if (data.status !== "SUCCESS") throw new Error(`agy CLI reported failure: ${JSON.stringify(data)}`);
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
	const adapter = new SubscriptionAdapter();
	for (const provider of PROVIDERS) {
		ctx.llm.registerConfigurableProviders([
			{ provider, displayName: provider === "claude" ? "Claude (subscription)" : "Gemini (subscription)", settingsNs: `llm-subscription-${provider}`, settingsPath: [] },
		]);
	}
	ctx.llm.registerAdapter(PROVIDERS, adapter);
}

apply.inject = ["llm"];

export default apply;
