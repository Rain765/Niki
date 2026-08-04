import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSidecarRuntimeEntry } from "../src/runtime-entry.js";

describe("tools-dev sidecar runtime entry", () => {
  it("runs compiled JavaScript in production", () => {
    assert.deepEqual(resolveSidecarRuntimeEntry({
      nodePath: "/node",
      prod: true,
      productionEntryPath: "/repo/dist/sidecar/index.js",
      sourceEntryPath: "/repo/src/sidecar/index.ts",
      stampArgs: ["--stamp", "value"],
      tsxCliPath: "/repo/node_modules/tsx/cli.mjs",
    }), {
      command: "/node",
      args: ["/repo/dist/sidecar/index.js", "--stamp", "value"],
    });
  });

  it("keeps the source + tsx loop in development", () => {
    assert.deepEqual(resolveSidecarRuntimeEntry({
      nodePath: "/node",
      prod: false,
      productionEntryPath: "/repo/dist/sidecar/index.js",
      sourceEntryPath: "/repo/src/sidecar/index.ts",
      stampArgs: ["--stamp", "value"],
      tsxCliPath: "/repo/node_modules/tsx/cli.mjs",
    }), {
      command: "/node",
      args: ["/repo/node_modules/tsx/cli.mjs", "/repo/src/sidecar/index.ts", "--stamp", "value"],
    });
  });
});
