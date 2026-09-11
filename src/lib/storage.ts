import { supabase } from "@/integrations/supabase/client";

export type BucketName = "product-images" | "wardrobe" | "debt-proofs" | "appointments";

/** Uploads a file and returns the stored object path. */
export async function uploadFile(bucket: BucketName, file: File | Blob, ext = "jpg") {
  if (!navigator.onLine) throw new Error("Fotos e áudios precisam de conexão para serem enviados.");
  const { data: householdId, error: householdError } = await supabase.rpc("current_household");
  if (householdError || !householdId) throw new Error("Não consegui identificar sua casa.");
  const path = `${householdId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

const cache = new Map<string, { url: string; expires: number }>();

export async function getSignedUrl(bucket: BucketName, path: string | null) {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 6);
  if (error || !data?.signedUrl) return null;
  cache.set(key, { url: data.signedUrl, expires: Date.now() + 1000 * 60 * 60 * 5 });
  return data.signedUrl;
}

/** Downscales an image file to keep uploads light. */
export function compressImage(file: File, maxSize = 1000, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
