// Not a full test suite — just enough to catch the two mistakes that
// actually shipped: 0.1.0's cordis.patch.yml pointing at a package name
// that no longer matched package.json, and any future drift between the
// model catalogs and their CLI-flag lookup tables.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function section(name, fn) {
	fn();
	console.log(`ok - ${name}`);
}

section("package.json name matches cordis.patch.yml's insert entry", () => {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
	const match = patch.match(/name:\s*['"]?([^'"\n]+)['"]?/);
	assert.ok(match, "cordis.patch.yml must declare a 'name:' field");
	assert.equal(
		match[1].trim(),
		pkg.name,
		`cordis.patch.yml references '${match[1].trim()}' but package.json name is '${pkg.name}' ` +
			"— this exact drift is what shipped as a real bug in 0.1.0",
	);
});

section("package.json declares dsh.bundle.patch pointing at cordis.patch.yml", () => {
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	assert.equal(pkg.dsh?.bundle?.patch, "./cordis.patch.yml");
});

const mod = await import("../lib/index.js");

section("module exports the shape cordis expects", () => {
	assert.equal(typeof mod.default, "function", "default export must be the apply function");
	assert.deepEqual(mod.inject, ["llm"]);
	assert.deepEqual(mod.default.inject, ["llm"], "apply.inject must also be set (both forms are checked in practice)");
	assert.equal(mod.name, "llm-subscription");
});

section("every listed Claude model has a CLAUDE_MODEL_FLAG entry", () => {
	for (const { id } of mod.MODELS.claude) {
		assert.ok(id in mod.CLAUDE_MODEL_FLAG, `MODELS.claude has '${id}' but CLAUDE_MODEL_FLAG doesn't`);
	}
	for (const id of Object.keys(mod.CLAUDE_MODEL_FLAG)) {
		assert.ok(mod.MODELS.claude.some((m) => m.id === id), `CLAUDE_MODEL_FLAG has '${id}' but MODELS.claude doesn't list it`);
	}
});

section("every listed Gemini model has a GEMINI_MODEL_FLAG entry", () => {
	for (const { id } of mod.MODELS.gemini) {
		assert.ok(id in mod.GEMINI_MODEL_FLAG, `MODELS.gemini has '${id}' but GEMINI_MODEL_FLAG doesn't`);
	}
	for (const id of Object.keys(mod.GEMINI_MODEL_FLAG)) {
		assert.ok(mod.MODELS.gemini.some((m) => m.id === id), `GEMINI_MODEL_FLAG has '${id}' but MODELS.gemini doesn't list it`);
	}
});

console.log("\nsmoke test passed");
