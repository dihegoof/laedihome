import type { Persister } from "@tanstack/react-query-persist-client";
import { openDB } from "idb";
import { supabase } from "@/integrations/supabase/client";
import { sameOfflineIdentity, type OfflineIdentity } from "./offline-identity";

let identity: OfflineIdentity | null = null;
export function setOfflineIdentity(next: OfflineIdentity | null) { identity = next; }

const DB_NAME = "nossa-casa-offline";
const STORE_CACHE = "query-cache";
const STORE_QUEUE = "mutation-queue";

type PendingMutation = {
  identity?: OfflineIdentity;
  id: string;
  table: "products" | "cards" | "finances" | "debts" | "goals" | "history" | "wardrobe_items" | "wardrobe_looks" | "appointments";
  operation: "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
  rowId?: string;
  createdAt: number;
};

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_CACHE)) database.createObjectStore(STORE_CACHE);
      if (!database.objectStoreNames.contains(STORE_QUEUE)) database.createObjectStore(STORE_QUEUE, { keyPath: "id" });
    },
  });
}

export const queryPersister: Persister = {
  persistClient: async (client) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) await (await db()).put(STORE_CACHE, client, `client:${data.session.user.id}`);
  },
  restoreClient: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session ? (await db()).get(STORE_CACHE, `client:${data.session.user.id}`) : undefined;
  },
  removeClient: async () => (await db()).clear(STORE_CACHE),
};

export async function queueOfflineMutation(mutation: Omit<PendingMutation, "id" | "createdAt">) {
  if (!identity) throw new Error("Entre na sua casa antes de salvar sem conexão.");
  const item: PendingMutation = { ...mutation, identity: { ...identity }, id: crypto.randomUUID(), createdAt: Date.now() };
  if (item.operation === "insert") item.payload = { ...item.payload, client_mutation_id: item.id };
  await (await db()).put(STORE_QUEUE, item);
  window.dispatchEvent(new CustomEvent("offline-queue-change"));
  return item;
}

export async function pendingMutationCount() {
  const items = (await (await db()).getAll(STORE_QUEUE)) as PendingMutation[];
  return items.filter((item) => sameOfflineIdentity(item.identity, identity)).length;
}

let flushing = false;
export async function flushOfflineMutations() {
  if (!navigator.onLine || !identity || flushing) return 0;
  const owner = { ...identity };
  flushing = true;
  try {
  const database = await db();
  const items = (await database.getAll(STORE_QUEUE)) as PendingMutation[];
  let done = 0;
  for (const item of items.sort((a, b) => a.createdAt - b.createdAt)) {
    if (!sameOfflineIdentity(owner, identity)) break;
    if (!sameOfflineIdentity(item.identity, owner)) continue;
    let error: { message: string } | null = null;
    if (item.operation === "insert") {
      const result = await supabase.from(item.table).upsert(item.payload as never, { onConflict: "client_mutation_id" });
      error = result.error;
    } else if (item.operation === "update" && item.rowId) {
      const result = await supabase.from(item.table).update(item.payload as never).eq("id", item.rowId).eq("household_id", owner.householdId);
      error = result.error;
    } else if (item.operation === "delete" && item.rowId) {
      const result = await supabase.from(item.table).delete().eq("id", item.rowId).eq("household_id", owner.householdId);
      error = result.error;
    }
    if (error) break;
    await database.delete(STORE_QUEUE, item.id);
    done += 1;
  }
  return done;
  } finally { flushing = false; }
}