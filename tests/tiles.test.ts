import { test } from "node:test";
import assert from "node:assert/strict";
import { tileWeight } from "../lib/tiles";
test("readable mode keeps tiny file clickable even against a terabyte; exact mode preserves the ratio", () => {
  const large = 1e12,
    small = 1024;
  assert.ok(
    tileWeight(small, large, true) / tileWeight(large, large, true) >= 0.15,
  );
  assert.equal(
    tileWeight(small, large, false) / tileWeight(large, large, false),
    small / large,
  );
});
