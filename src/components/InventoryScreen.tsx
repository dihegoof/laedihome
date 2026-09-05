import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  ClipboardList,
  Copy,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, EmptyState, Field, Modal, Pill, Spinner } from "@/components/kit";
import { StoredImage } from "@/components/StoredImage";
import { useInvalidate, useProducts, logHistory } from "@/lib/data";
import { PRODUCT_CATEGORIES, type Product } from "@/lib/types";
import { compressImage, fileToDataUrl, uploadFile } from "@/lib/storage";
import { daysSince, qty } from "@/lib/format";
import { parseReceipt, parseReceiptImage } from "@/lib/ai.functions";

type Draft = {
  id?: string;
  name: string;
  category: string;
  quantity: string;
  is_essential: boolean;
  image_url: string | null;
};

const emptyDraft: Draft = {
  name: "",
  category: PRODUCT_CATEGORIES[0],
  quantity: "1",
  is_essential: false,
  image_url: null,
};

export function InventoryScreen({ userName }: { userName: string }) {
  const { data: products = [], isLoading } = useProducts();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("todos");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (category !== "todos" && p.category !== category) return false;
      if (onlyMissing && Number(p.quantity) > 0) return false;
      return true;
    });
  }, [products, search, category, onlyMissing]);

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      const key = p.category || "Sem categoria";
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const missing = products.filter((p) => Number(p.quantity) <= 0);

  async function changeQuantity(product: Product, delta: number) {
    const next = Math.max(0, Number((Number(product.quantity) + delta).toFixed(3)));
    const patch = {
      quantity: next,
      is_new: false,
      out_of_stock_since:
        next > 0 ? null : (product.out_of_stock_since ?? new Date().toISOString()),
    };
    const { error } = await supabase.from("products").update(patch).eq("id", product.id);

    if (error) return toast.error(error.message);
    void invalidate("products");
    void logHistory(userName, next === 0 ? "acabou o produto" : `alterou quantidade para ${qty(next)}`, product.name);
  }

  async function toggleEssential(product: Product) {
    await supabase.from("products").update({ is_essential: !product.is_essential }).eq("id", product.id);
    void invalidate("products");
  }

  async function remove(product: Product) {
    if (!confirm(`Excluir "${product.name}"?`)) return;
    await supabase.from("products").delete().eq("id", product.id);
    void invalidate("products");
    void logHistory(userName, "excluiu produto", product.name);
    toast.success("Produto excluído");
  }

  function copyMissing() {
    if (!missing.length) return toast.info("Nada faltando por aqui 🎉");
    const text = `🛒 Lista de compras\n\n${missing
      .map((p) => `• ${p.name}${p.is_essential ? " (essencial)" : ""}`)
      .join("\n")}`;
    void navigator.clipboard.writeText(text);
    toast.success("Lista copiada!");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Itens" value={String(products.length)} tone="primary" />
        <StatCard label="Faltando" value={String(missing.length)} tone="danger" />
        <StatCard
          label="Essenciais"
          value={String(products.filter((p) => p.is_essential).length)}
          tone="accent"
        />
      </div>

      <div className="surface p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="field pl-9"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {["todos", ...PRODUCT_CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                category === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {c === "todos" ? "Todos" : c}
            </button>
          ))}
          <button
            onClick={() => setOnlyMissing((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              onlyMissing ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            Só faltando
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDraft({ ...emptyDraft })}>
            <Plus className="h-4 w-4" /> Novo produto
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Sparkles className="h-4 w-4" /> Importar nota
          </Button>
          <Button size="sm" variant="outline" onClick={copyMissing}>
            <Copy className="h-4 w-4" /> Copiar lista
          </Button>
        </div>
      </div>

      {isLoading && <EmptyState>Carregando despensa...</EmptyState>}
      {!isLoading && !filtered.length && (
        <EmptyState>
          <Package className="mx-auto mb-2 h-6 w-6" />
          Nenhum produto encontrado.
        </EmptyState>
      )}

      {grouped.map(([cat, items]) => (
        <section key={cat} className="space-y-2">
          <h3 className="px-1 text-sm font-semibold text-muted-foreground">
            {cat} <span className="text-xs font-normal">({items.length})</span>
          </h3>
          <div className="grid gap-2">
            {items.map((p) => (
              <article key={p.id} className="surface flex items-center gap-3 p-3">
                <StoredImage
                  bucket="product-images"
                  path={p.image_url}
                  alt={p.name}
                  className="h-14 w-14 shrink-0 rounded-xl"
                  fallback={<Package className="h-5 w-5" />}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate font-semibold">{p.name}</p>
                    {p.is_essential && <Pill tone="accent">essencial</Pill>}
                    {p.is_new && <Pill tone="primary">novo</Pill>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {Number(p.quantity) > 0 ? (
                      <>Em casa: {qty(Number(p.quantity))}</>
                    ) : (
                      <span className="text-destructive">
                        Acabou{p.out_of_stock_since ? ` há ${daysSince(p.out_of_stock_since)} dia(s)` : ""}
                      </span>
                    )}
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <Button size="icon" variant="outline" onClick={() => void changeQuantity(p, -1)}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-10 text-center text-sm font-semibold">{qty(Number(p.quantity))}</span>
                    <Button size="icon" variant="soft" onClick={() => void changeQuantity(p, 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                    <div className="ml-auto flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Essencial"
                        onClick={() => void toggleEssential(p)}
                      >
                        <Star className={`h-4 w-4 ${p.is_essential ? "fill-accent text-accent" : ""}`} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Editar"
                        onClick={() =>
                          setDraft({
                            id: p.id,
                            name: p.name,
                            category: p.category ?? PRODUCT_CATEGORIES[0],
                            quantity: String(p.quantity),
                            is_essential: p.is_essential,
                            image_url: p.image_url,
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => void remove(p)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <ProductModal
        draft={draft}
        onClose={() => setDraft(null)}
        userName={userName}
        onSaved={() => void invalidate("products")}
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        products={products}
        userName={userName}
        onSaved={() => {
          void invalidate("products");
          void invalidate("finances");
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "danger" | "accent";
}) {
  const tones = {
    primary: "text-primary",
    danger: "text-destructive",
    accent: "text-accent",
  } as const;
  return (
    <div className="surface px-3 py-3 text-center">
      <p className={`text-2xl font-bold ${tones[tone]}`}>{value}</p>
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
    </div>
  );
}

function ProductModal({
  draft,
  onClose,
  onSaved,
  userName,
}: {
  draft: Draft | null;
  onClose: () => void;
  onSaved: () => void;
  userName: string;
}) {
  const [local, setLocal] = useState<Draft | null>(draft);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    setLocal(draft);
    setPreview(null);
  }, [draft]);


  async function pickImage(file: File) {
    setBusy(true);
    try {
      const blob = await compressImage(file, 800);
      setPreview(await fileToDataUrl(blob));
      const path = await uploadFile("product-images", blob);
      setLocal((l) => (l ? { ...l, image_url: path } : l));
      toast.success("Foto anexada");
    } catch {
      toast.error("Não consegui enviar a foto");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!local) return;
    if (!local.name.trim()) return toast.error("Informe o nome do produto");
    setBusy(true);
    const quantity = Number(local.quantity.replace(",", ".")) || 0;
    const payload = {
      name: local.name.trim(),
      category: local.category,
      quantity,
      is_essential: local.is_essential,
      image_url: local.image_url,
      out_of_stock_since: quantity > 0 ? null : new Date().toISOString(),
    };
    const { error } = local.id
      ? await supabase.from("products").update(payload).eq("id", local.id)
      : await supabase.from("products").insert({ ...payload, is_new: true });
    setBusy(false);
    if (error) return toast.error(error.message);
    void logHistory(userName, local.id ? "editou produto" : "adicionou produto", payload.name);
    toast.success(local.id ? "Produto atualizado" : "Produto adicionado");
    onSaved();
    onClose();
  }

  return (
    <Modal
      open={!!local}
      onClose={onClose}
      title={local?.id ? "Editar produto" : "Novo produto"}
      footer={
        <>
          <Button className="flex-1" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner /> : "Salvar"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </>
      }
    >
      {local && (
        <>
          <Field label="Nome">
            <input
              className="field"
              value={local.name}
              onChange={(e) => setLocal({ ...local, name: e.target.value })}
              placeholder="Ex.: Arroz"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria">
              <select
                className="field"
                value={local.category}
                onChange={(e) => setLocal({ ...local, category: e.target.value })}
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Quantidade">
              <input
                className="field"
                inputMode="decimal"
                value={local.quantity}
                onChange={(e) => setLocal({ ...local, quantity: e.target.value })}
                placeholder="1 ou 0,5"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 py-1 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-primary)]"
              checked={local.is_essential}
              onChange={(e) => setLocal({ ...local, is_essential: e.target.checked })}
            />
            Produto essencial
          </label>

          <div className="flex items-center gap-3">
            {preview ? (
              <img src={preview} alt="Prévia" className="h-16 w-16 rounded-xl object-cover" />
            ) : (
              <StoredImage
                bucket="product-images"
                path={local.image_url}
                alt="Foto"
                className="h-16 w-16 rounded-xl"
              />
            )}
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Camera className="h-4 w-4" /> Foto
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickImage(f);
                e.target.value = "";
              }}
            />
          </div>
        </>
      )}
    </Modal>
  );
}

function ImportModal({
  open,
  onClose,
  products,
  onSaved,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onSaved: () => void;
  userName: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<{ name: string; quantity: number }[]>([]);
  const [total, setTotal] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(fn: () => Promise<{ items: { name: string; quantity: number }[]; total: number }>) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.items.length) throw new Error("Nenhum item encontrado na nota");
      setItems(res.items);
      setTotal(res.total);
      toast.success(`${res.items.length} itens encontrados`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler a nota");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    setBusy(true);
    try {
      for (const item of items) {
        const existing = products.find((p) => p.name.toLowerCase() === item.name.toLowerCase());
        if (existing) {
          await supabase
            .from("products")
            .update({
              quantity: Number(existing.quantity) + item.quantity,
              out_of_stock_since: null,
              is_new: false,
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("products").insert({
            name: item.name,
            quantity: item.quantity,
            category: "Não perecível",
            is_new: true,
          });
        }
      }
      if (total > 0) {
        await supabase.from("finances").insert({
          description: "Compra de mercado (nota importada)",
          value: total,
          type: "expense",
          category: "Mercado",
          date: new Date().toISOString().slice(0, 10),
        });
      }
      void logHistory(userName, `importou nota com ${items.length} itens`);
      toast.success("Nota importada!");
      setItems([]);
      setText("");
      setTotal(0);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar nota fiscal"
      footer={
        items.length ? (
          <>
            <Button className="flex-1" onClick={() => void confirmImport()} disabled={busy}>
              {busy ? <Spinner /> : "Adicionar à despensa"}
            </Button>
            <Button variant="outline" onClick={() => setItems([])}>
              Refazer
            </Button>
          </>
        ) : undefined
      }
    >
      {!items.length ? (
        <>
          <Field label="Cole o texto da nota">
            <textarea
              className="field min-h-32"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cole aqui o conteúdo do cupom fiscal..."
            />
          </Field>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={busy || text.trim().length < 3}
              onClick={() => void run(() => parseReceipt({ data: { text } }))}
            >
              {busy ? <Spinner /> : <Sparkles className="h-4 w-4" />} Ler texto
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4" /> Foto
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const blob = await compressImage(f, 1400, 0.9);
              const dataUrl = await fileToDataUrl(blob);
              void run(() => parseReceiptImage({ data: { imageDataUrl: dataUrl } }));
            }}
          />
          <p className="text-xs text-muted-foreground">
            <ClipboardList className="mr-1 inline h-3 w-3" />A IA identifica os produtos e o valor total da
            compra.
          </p>
        </>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="field flex-1"
                value={item.name}
                onChange={(e) =>
                  setItems(items.map((it, j) => (i === j ? { ...it, name: e.target.value } : it)))
                }
              />
              <input
                className="field w-20"
                inputMode="decimal"
                value={item.quantity}
                onChange={(e) =>
                  setItems(
                    items.map((it, j) =>
                      i === j ? { ...it, quantity: Number(e.target.value.replace(",", ".")) || 0 } : it,
                    ),
                  )
                }
              />
              <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Field label="Valor total da compra (R$)">
            <input
              className="field"
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(Number(e.target.value.replace(",", ".")) || 0)}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
