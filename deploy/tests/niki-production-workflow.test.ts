import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const workflowPath = path.join(
  repoRoot,
  ".github/workflows/niki-production-deploy.yml",
);

test("production deploy is gated to validated main commits on the Mac runner", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /workflow_run:\s*[\s\S]*workflows: \[ci\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.doesNotMatch(workflow, /\bpull_request\s*:/);
  assert.match(workflow, /github\.repository == 'Rain765\/Niki'/);
  assert.match(workflow, /NIKI_PRODUCTION_AUTO_DEPLOY == 'true'/);
  assert.match(
    workflow,
    /runs-on: \[self-hosted, macOS, ARM64, niki-production\]/,
  );
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /current_main.*TARGET_SHA/s);
});

test("production deploy fails closed around history, storage and public checks", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /storage-policy\.ts/);
  assert.match(workflow, /node "\$storage_policy" preflight/);
  assert.match(workflow, /git cat-file -e "\$live_sha\^\{commit\}"/);
  assert.match(
    workflow,
    /git merge-base --is-ancestor "\$live_sha" "\$TARGET_SHA"/,
  );
  assert.match(workflow, /niki-auth\/deploy\.zsh/);
  assert.match(workflow, /niki-work-app\.pages\.dev\/api\/version/);
  assert.match(workflow, /niki-work-app\.pages\.dev/);
  assert.match(workflow, /\/api\/health/);
  assert.match(workflow, /\/api\/auth\/config/);
  assert.match(workflow, /auth\?\.provider !== "feishu"/);
});
