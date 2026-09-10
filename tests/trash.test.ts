import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, lstat, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
test("native Trash helper rejects wrong identity then moves only synthetic test file", async () => {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "voltra-trash-test-")),
  );
  const file = path.join(root, "voltra-synthetic-test.txt");
  await writeFile(file, "Disposable Voltra test fixture");
  const st = await lstat(file);
  const run = promisify(execFile),
    helper = path.resolve(".local/trash-helper");
  await assert.rejects(() => run(helper, [file, String(st.dev), "0"]));
  assert.equal((await lstat(file)).ino, st.ino);
  await run(helper, [file, String(st.dev), String(st.ino)]);
  await assert.rejects(() => lstat(file), { code: "ENOENT" });
});
