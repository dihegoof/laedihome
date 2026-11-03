import { useState } from "react";
import { toast } from "sonner";
import { Globe } from "lucide-react";
import { Button, Modal, Spinner } from "@/components/kit";
import { searchProductImages } from "@/lib/product-images.functions";

/** Botão que busca fotos reais do produto pelo nome/marca e deixa escolher uma. */
export function PhotoSearch({ query, onPick }: { query: string; onPick: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<{ url: string; label: string }[]>([]);

  async function search(q: string) {
    if (q.trim().length < 2) return toast.error("Digite o nome do produto");
    setBusy(true);
    try {
      const found = await searchProductImages({ data: { query: q.trim() } });
      setItems(found);
      if (!found.length) toast.error("Nenhuma foto encontrada. Tente nome + marca.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui buscar fotos");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setTerm(query);
          setItems([]);
          setOpen(true);
          void search(query);
        }}
      >
        <Globe className="h-4 w-4" /> Buscar foto
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Foto real do produto">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search(term);
          }}
        >
          <input className="field flex-1" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Nome e marca" />
          <Button type="submit" disabled={busy}>{busy ? <Spinner /> : "Buscar"}</Button>
        </form>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {items.map((i) => (
            <button
              key={i.url}
              type="button"
              title={i.label}
              className="overflow-hidden rounded-xl border border-border bg-card"
              onClick={() => {
                onPick(i.url);
                setOpen(false);
                toast.success("Foto escolhida");
              }}
            >
              <img src={i.url} alt={i.label} loading="lazy" className="aspect-square w-full object-contain" />
              <span className="line-clamp-2 block p-1 text-[10px] text-muted-foreground">{i.label}</span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
