import { test } from "node:test";
import assert from "node:assert/strict";
import { canTrash, validateSelection } from "../lib/safety";
test("protect roots and ancestors of workspace", () => {
  const cwd = "/Users/test/Documents/app",
    home = "/Users/test";
  for (const p of [
    "/",
    home,
    "/System",
    "/Users/test/Documents",
    cwd,
    "/Users/test/Library/Caches",
    "/Users/test/.ssh/id_rsa",
  ])
    assert.equal(canTrash(p, cwd, home), false, p);
  assert.equal(canTrash("/Users/test/Downloads/a.zip", cwd, home), true);
  assert.equal(canTrash("/Users/test2/a", cwd, home), false);
});
test("reject overlapping or duplicate selection", () => {
  assert.throws(() => validateSelection(["/a", "/a/b"]));
  assert.throws(() => validateSelection(["/a", "/a"]));
  assert.throws(() => validateSelection([]));
  assert.doesNotThrow(() => validateSelection(["/a", "/ab"]));
});
