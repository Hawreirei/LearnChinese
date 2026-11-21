// Views are not imported by the unit tests (they need a DOM), so a typo there would only show up in the browser.
// This parses every app module so such errors fail CI.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = (p) => fileURLToPath(new URL(`../../app/js/${p}`, import.meta.url));
const files = [...readdirSync(dir("")).filter((f) => f.endsWith(".js")), ...readdirSync(dir("views")).filter((f) => f.endsWith(".js")).map((f) => `views/${f}`)];

test("every app module parses", () => {
  assert.ok(files.length > 20);
  for (const f of files) {
    try { execFileSync(process.execPath, ["--check", dir(f)], { stdio: "pipe" }); }
    catch (e) { assert.fail(`${f}: ${String(e.stderr).split("\n").slice(0, 5).join("\n")}`); }
  }
});
