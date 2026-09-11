import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";

const appId = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID;
const vapidKey = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY;
const firebaseConfig = {
  apiKey: import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY,
  projectId: import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID,
  appId,
  messagingSenderId: appId?.split(":")[1] ?? "",
};

export type PushStatus = "registered" | "not-configured" | "unsupported" | "open-in-new-tab" | "install-on-iphone" | "denied";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export async function enablePush(userId: string): Promise<PushStatus> {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !appId || !vapidKey || !firebaseConfig.messagingSenderId) return "not-configured";
  if (window.top !== window.self) return "open-in-new-tab";
  if (isIos() && !isStandalone()) return "install-on-iphone";
  if (!("Notification" in window) || !(await isSupported())) return "unsupported";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const query = new URLSearchParams(firebaseConfig).toString();
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`, { scope: "/firebase-cloud-messaging-push-scope" });
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return "denied";
  const { error } = await supabase.from("device_tokens").upsert({
    user_id: userId,
    token,
    enabled: true,
    device_name: `${navigator.platform || "Aparelho"} · ${new Date().toLocaleDateString("pt-BR")}`,
  }, { onConflict: "token" });
  if (error) throw error;
  return "registered";
}

export async function disablePushForThisUser(userId: string) {
  const { error } = await supabase.from("device_tokens").update({ enabled: false }).eq("user_id", userId);
  if (error) throw error;
}