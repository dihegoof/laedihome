import { test } from "node:test";
import assert from "node:assert/strict";
import { sameOfflineIdentity } from "./offline-identity";

test("offline actions cannot transfer between accounts in the same household", () => {
  assert.equal(sameOfflineIdentity({ userId: "a", householdId: "home" }, { userId: "b", householdId: "home" }), false);
});
test("offline actions cannot transfer when a person changes households", () => {
  assert.equal(sameOfflineIdentity({ userId: "a", householdId: "old" }, { userId: "a", householdId: "new" }), false);
});
test("unbound legacy actions are never replayed", () => {
  assert.equal(sameOfflineIdentity(undefined, { userId: "a", householdId: "home" }), false);
});
test("the originating account can replay its own household actions", () => {
  assert.equal(sameOfflineIdentity({ userId: "a", householdId: "home" }, { userId: "a", householdId: "home" }), true);
});