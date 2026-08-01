import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { rotateLogFile } from "../src/log-retention.js";

describe("tools-dev log retention", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ));
  });

  it("rotates oversized logs and keeps only the configured archives", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tools-dev-log-retention-"));
    roots.push(root);
    const logPath = path.join(root, "latest.log");

    await writeFile(logPath, "first oversized log");
    await rotateLogFile(logPath, { maxBytes: 4, retention: 2 });
    await writeFile(logPath, "second oversized log");
    await rotateLogFile(logPath, { maxBytes: 4, retention: 2 });
    await writeFile(logPath, "third oversized log");
    await rotateLogFile(logPath, { maxBytes: 4, retention: 2 });

    assert.deepEqual((await readdir(root)).sort(), [
      "latest.log.1",
      "latest.log.2",
    ]);
    assert.equal(await readFile(`${logPath}.1`, "utf8"), "third oversized log");
    assert.equal(await readFile(`${logPath}.2`, "utf8"), "second oversized log");
  });

  it("leaves a log below the size threshold untouched", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tools-dev-log-retention-"));
    roots.push(root);
    const logPath = path.join(root, "latest.log");
    await writeFile(logPath, "ok");

    await rotateLogFile(logPath, { maxBytes: 10, retention: 2 });

    assert.equal((await stat(logPath)).size, 2);
    assert.deepEqual(await readdir(root), ["latest.log"]);
  });
});
