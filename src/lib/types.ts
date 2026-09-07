export type Product = {
  id: string;
  household_id: string;
  name: string;
  category: string | null;
  quantity: number;
  is_essential: boolean;
  is_new: boolean;
  out_of_stock_since: string | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
};

export type Card = {
  id: string;
  household_id: string;
  name: string;
  card_limit: number;
  close_day: number | null;
  due_day: number | null;
  created_at: string;
};

export type FinanceType = "income" | "expense" | "card";

export type Finance = {
  id: string;
  household_id: string;
  description: string;
  value: number;
  type: FinanceType;
  category: string | null;
  date: string | null;
  card_id: string | null;
  total_value: number | null;
  installment_value: number | null;
  total_installments: number | null;
  current_installment: number | null;
  created_at: string;
};

export type DebtProof = { url: string; installment: number; date: string; name?: string };

export type Debt = {
  id: string;
  household_id: string;
  description: string;
  creditor: string | null;
  total_value: number;
  total_installments: number;
  installment_value: number;
  paid_installments: number;
  payment_history: DebtProof[];
  created_at: string;
};

export type HistoryEntry = {
  id: string;
  household_id: string;
  user_name: string;
  action: string;
  target: string | null;
  created_at: string;
};

export type WardrobeType = "blusa" | "calca" | "vestido" | "sapato" | "sobreposicao";

export type WardrobeItem = {
  id: string;
  household_id: string;
  name: string;
  type: WardrobeType;
  color: string | null;
  occasion: string | null;
  image_url: string | null;
  times_used: number;
  last_used: string | null;
  created_at: string;
};

export type WardrobeLook = {
  id: string;
  household_id: string;
  item_ids: string[];
  item_names: string[];
  created_at: string;
};

export const PRODUCT_CATEGORIES = ["Perecível", "Não perecível", "Limpeza", "Bebidas"] as const;

export const FINANCE_CATEGORIES = [
  "Trabalho",
  "Mercado",
  "Casa",
  "Saúde",
  "Transporte",
  "Lazer",
  "Dívidas",
  "Outros",
] as const;

export const WARDROBE_TYPES: { value: WardrobeType; label: string }[] = [
  { value: "blusa", label: "Blusa, Camiseta" },
  { value: "calca", label: "Calça, Shorts e Saia" },
  { value: "vestido", label: "Vestido, Macacão" },
  { value: "sapato", label: "Sapato, Tênis, Sandália" },
  { value: "sobreposicao", label: "Sobreposição" },
];

export const WARDROBE_COLORS = [
  "preto",
  "branco",
  "cinza",
  "azul",
  "jeans",
  "rosa",
  "vermelho",
  "verde",
  "amarelo",
  "laranja",
  "bege",
  "vinho",
  "marrom",
  "nude",
  "multicor",
];
