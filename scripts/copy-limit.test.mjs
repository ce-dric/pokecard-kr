import assert from "node:assert/strict";
import test from "node:test";
import { exceedsCopyLimit } from "./copy-limit.mjs";

const basicEnergy = (id) => id === 3;

test("basic energy copies do not block a deck remap", () => {
  assert.equal(exceedsCopyLimit([3, 3, 3, 3, 3, 10, 10], basicEnergy), false);
  assert.equal(exceedsCopyLimit([3, 3, 3, 3, 3], basicEnergy), false);
});

test("five copies of a printed card still block a deck remap", () => {
  assert.equal(exceedsCopyLimit([10, 10, 10, 10, 10, 3], basicEnergy), true);
  assert.equal(exceedsCopyLimit([10, 11, 12, 13], basicEnergy), false);
});
