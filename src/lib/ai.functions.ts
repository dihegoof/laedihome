import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callGateway(body: unknown) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IA indisponível no momento.");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Muitas requisições de IA. Tente de novo em instantes.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados.");
  if (!res.ok) throw new Error(`Erro da IA (${res.status})`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("A IA não retornou resposta");
  return JSON.parse(content.replace(/```json/g, "").replace(/```/g, "").trim());
}

/** Analyses a clothing photo and returns name/type/color/occasion. */
export const analyzeGarment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ imageDataUrl: z.string().min(20), occasionHint: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const prompt = `Você é um assistente de armário inteligente. Analise a peça de roupa na imagem e retorne APENAS JSON válido no formato:
{"name":"nome curto da peça","type":"tipo","color":"cor predominante","occasion":"ocasião ideal"}

Tipos válidos: blusa, calca, vestido, sapato, sobreposicao
Cores válidas: preto, branco, cinza, azul, bege, rosa, vermelho, verde, amarelo, laranja, vinho, marrom, nude, jeans, multicor
Ocasiões válidas: casual, trabalho, festa, praia, academia
Se a peça tiver múltiplas cores predominantes, use "multicor".
${data.occasionHint ? `Dica do usuário: ocasião desejada é "${data.occasionHint}".` : ""}`;

    const result = (await callGateway({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: data.imageDataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    })) as { name?: string; type?: string; color?: string; occasion?: string };

    return {
      name: result.name || "Peça sem nome",
      type: result.type || "blusa",
      color: result.color || "preto",
      occasion: result.occasion || "casual",
    };
  });

/** Extracts items + total from raw receipt text. */
export const parseReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(3) }).parse(d))
  .handler(async ({ data }) => {
    const prompt = `Você é um extrator de notas fiscais. Retorne APENAS JSON válido.
Formato: {"items":[{"name":"Arroz","quantity":2}],"total":0}
Regras:
- Simplifique nomes (sem marcas, códigos, peso ou volume).
- Quantidades podem ser fracionadas (produtos por peso).
- total é o valor total da compra em número.

Texto da nota:
${data.text}`;

    const result = (await callGateway({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    })) as { items?: { name: string; quantity: number }[]; total?: number };

    return {
      items: (result.items ?? []).map((i) => ({
        name: String(i.name ?? "").trim(),
        quantity: Number(i.quantity) || 1,
      })),
      total: Number(result.total) || 0,
    };
  });

/** Reads a receipt photo directly (OCR + extraction in one step). */
export const parseReceiptImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ imageDataUrl: z.string().min(20) }).parse(d))
  .handler(async ({ data }) => {
    const prompt = `Leia esta nota fiscal / cupom e retorne APENAS JSON válido.
Formato: {"items":[{"name":"Arroz","quantity":2}],"total":0}
Simplifique nomes (sem marcas, códigos, peso ou volume). Quantidades podem ser fracionadas.`;

    const result = (await callGateway({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: data.imageDataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    })) as { items?: { name: string; quantity: number }[]; total?: number };

    return {
      items: (result.items ?? []).map((i) => ({
        name: String(i.name ?? "").trim(),
        quantity: Number(i.quantity) || 1,
      })),
      total: Number(result.total) || 0,
    };
  });
