import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type OffProduct = { product_name?: string; brands?: string; image_front_url?: string; image_url?: string };

/** Busca fotos reais de produtos (com marca) no catálogo aberto Open Food Facts. Sem IA. */
export const searchProductImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    url.searchParams.set("search_terms", data.query);
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "24");
    url.searchParams.set("fields", "product_name,brands,image_front_url,image_url");
    const res = await fetch(url, { headers: { "User-Agent": "NossaCasa/1.0 (app familiar)" } });
    if (!res.ok) throw new Error(`Busca de fotos indisponível (${res.status})`);
    const json = (await res.json()) as { products?: OffProduct[] };
    const seen = new Set<string>();
    const results: { url: string; label: string }[] = [];
    for (const p of json.products ?? []) {
      const img = p.image_front_url || p.image_url;
      if (!img || !img.startsWith("https://") || seen.has(img)) continue;
      seen.add(img);
      results.push({ url: img, label: [p.product_name, p.brands].filter(Boolean).join(" · ") });
      if (results.length >= 12) break;
    }
    return results;
  });
