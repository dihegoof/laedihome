export type OfflineIdentity = { userId: string; householdId: string };

export function sameOfflineIdentity(a: OfflineIdentity | null | undefined, b: OfflineIdentity | null | undefined) {
  return Boolean(a && b && a.userId === b.userId && a.householdId === b.householdId);
}