import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const commandSchema = z.object({ transcript: z.string().min(3).max(2000) });
export type AssistantCommand = {
  action: "add_product" | "change_product_quantity" | "add_finance" | "add_appointment" | "add_debt" | "add_goal" | "unknown";
  summary: string;
  payload: Record<string, string | number | boolean | null>;
};

export const understandAssistantCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => commandSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) throw new Error("Assistente indisponível");
    const today = new Date().toISOString();
    const response = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: `Hoje é ${today}. Interprete este comando doméstico em português: ${JSON.stringify(data.transcript)}. Retorne apenas JSON: {"action":"add_product|change_product_quantity|add_finance|add_appointment|add_debt|add_goal|unknown","summary":"frase curta para confirmação","payload":{}}. Para produto use name,quantity,category,is_essential. Para quantidade use name,quantity. Para finança use description,value,type (income ou expense),category,date YYYY-MM-DD. Para compromisso use title,scheduled_at ISO. Para dívida use description,creditor,total_value,total_installments. Para meta use name,description,target_value.` }],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) throw new Error(`Não consegui interpretar (${response.status})`);
    const json = await response.json() as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Não entendi o comando");
    return JSON.parse(raw.replace(/```json/g, "").replace(/```/g, "").trim()) as AssistantCommand;
  });