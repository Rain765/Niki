import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveForegroundRecoveryPlan } from "../src/foreground-recovery.js";

describe("production foreground recovery", () => {
  it("ignores transient IPC misses", () => {
    assert.equal(resolveForegroundRecoveryPlan({ daemonMisses: 2, webMisses: 2 }), null);
  });

  it("restarts only web after three web misses", () => {
    assert.deepEqual(resolveForegroundRecoveryPlan({ daemonMisses: 0, webMisses: 3 }), {
      stop: ["web"],
      start: ["web"],
    });
  });

  it("keeps a healthy web shell online while daemon recovers", () => {
    assert.deepEqual(resolveForegroundRecoveryPlan({ daemonMisses: 3, webMisses: 0 }), {
      stop: ["daemon"],
      start: ["daemon"],
    });
  });

  it("restarts both missing services with web first", () => {
    assert.deepEqual(resolveForegroundRecoveryPlan({ daemonMisses: 3, webMisses: 3 }), {
      stop: ["web", "daemon"],
      start: ["web", "daemon"],
    });
  });
});
