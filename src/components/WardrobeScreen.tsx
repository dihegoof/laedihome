import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Plus, Shirt, Sparkles, Trash2, UserPlus, Users, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, EmptyState, Field, Modal, Pill, Spinner } from "@/components/kit";
import { StoredImage } from "@/components/StoredImage";
import {
  logHistory,
  useInvalidate,
  useWardrobeItems,
  useWardrobeLooks,
  useWardrobeOwners,
} from "@/lib/data";
import {
  WARDROBE_COLORS,
  WARDROBE_TYPES,
  type WardrobeItem,
  type WardrobeOwner,
  type WardrobeType,
} from "@/lib/types";
import { compressImage, fileToDataUrl, uploadFile } from "@/lib/storage";
import { analyzeGarment } from "@/lib/ai.functions";

const OCCASIONS = ["casual", "trabalho", "festa", "praia", "academia"];
const NEUTRALS = ["preto", "branco", "cinza", "bege", "jeans", "nude", "marrom"];

const COMBOS: Record<string, string[]> = {
  azul: ["branco", "bege", "cinza", "vinho", "amarelo"],
  rosa: ["branco", "cinza", "jeans", "nude", "vinho"],
  vermelho: ["preto", "branco", "jeans", "bege"],
  verde: ["bege", "branco", "jeans", "marrom"],
  amarelo: ["jeans", "branco", "cinza", "azul"],
  laranja: ["jeans", "branco", "marrom", "bege"],
  vinho: ["preto", "cinza", "rosa", "bege"],
  multicor: NEUTRALS,
};

function colorsMatch(a: string | null, b: string | null) {
  if (!a || !b) return true;
  if (a === b) return true;
  if (NEUTRALS.includes(a) || NEUTRALS.includes(b)) return true;
  return (COMBOS[a] ?? []).includes(b) || (COMBOS[b] ?? []).includes(a);
}

type WTab = "armario" | "montar" | "looks";

export function WardrobeScreen({ userName }: { userName: string }) {
  const [tab, setTab] = useState<WTab>("armario");
  const { data: allItems = [] } = useWardrobeItems();
  const { data: owners = [] } = useWardrobeOwners();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const hasUnassigned = allItems.some((i) => !i.owner_id);

  useEffect(() => {
    if (ownerId && owners.some((o) => o.id === ownerId)) return;
    if (ownerId === "none" && hasUnassigned) return;
    setOwnerId(owners[0]?.id ?? (hasUnassigned ? "none" : null));
  }, [owners, ownerId, hasUnassigned]);

  const items = useMemo(
    () => allItems.filter((i) => (ownerId === "none" ? !i.owner_id : i.owner_id === ownerId)),
    [allItems, ownerId],
  );

  return (
    <div className="space-y-4">
      <div className="surface space-y-2 p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Users className="h-3.5 w-3.5" /> Guarda-roupa de
          </p>
          <button
            onClick={() => setPeopleOpen(true)}
            className="flex items-center gap-1 text-xs font-semibold text-primary"
          >
            <UserPlus className="h-3.5 w-3.5" /> Pessoas
          </button>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {owners.map((o) => (
            <button
              key={o.id}
              onClick={() => setOwnerId(o.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                ownerId === o.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {o.name}
            </button>
          ))}
          {hasUnassigned && (
            <button
              onClick={() => setOwnerId("none")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                ownerId === "none" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              Sem pessoa
            </button>
          )}
          {!owners.length && !hasUnassigned && (
            <p className="text-xs text-muted-foreground">Crie uma pessoa para começar.</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["armario", "Armário"],
            ["montar", "Montar look"],
            ["looks", "Meus looks"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              tab === key
                ? "bg-primary text-primary-foreground shadow-soft"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "armario" && (
        <Closet items={items} userName={userName} ownerId={ownerId === "none" ? null : ownerId} owners={owners} />
      )}
      {tab === "montar" && <LookBuilder items={items} userName={userName} />}
      {tab === "looks" && <SavedLooks items={allItems} />}

      <PeopleModal open={peopleOpen} onClose={() => setPeopleOpen(false)} owners={owners} userName={userName} />
    </div>
  );
}

function PeopleModal({
  open,
  onClose,
  owners,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  owners: WardrobeOwner[];
  userName: string;
}) {
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const value = name.trim();
    if (!value) return toast.error("Informe o nome da pessoa");
    if (owners.some((o) => o.name.toLowerCase() === value.toLowerCase()))
      return toast.error("Essa pessoa já existe");
    setBusy(true);
    const { error } = await supabase.from("wardrobe_owners").insert({ name: value });
    setBusy(false);
    if (error) return toast.error(error.message);
    setName("");
    void invalidate("wardrobe_owners");
    void logHistory(userName, "adicionou pessoa no guarda-roupa", value);
  }

  async function remove(owner: WardrobeOwner) {
    if (!confirm(`Remover "${owner.name}"? As roupas dela ficam como "Sem pessoa".`)) return;
    await supabase.from("wardrobe_owners").delete().eq("id", owner.id);
    void invalidate("wardrobe_owners");
    void invalidate("wardrobe_items");
  }

  return (
    <Modal open={open} onClose={onClose} title="Pessoas do guarda-roupa">
      <Field label="Nova pessoa">
        <div className="flex gap-2">
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Dihego"
          />
          <Button onClick={() => void add()} disabled={busy}>
            {busy ? <Spinner /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </Field>
      <div className="space-y-2">
        {owners.map((o) => (
          <div key={o.id} className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2">
            <span className="text-sm font-semibold">{o.name}</span>
            <button onClick={() => void remove(o)} aria-label={`Remover ${o.name}`}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>
          </div>
        ))}
        {!owners.length && <p className="text-sm text-muted-foreground">Nenhuma pessoa cadastrada.</p>}
      </div>
    </Modal>
  );
}

function Closet({
  items,
  userName,
  ownerId,
  owners,
}: {
  items: WardrobeItem[];
  userName: string;
  ownerId: string | null;
  owners: WardrobeOwner[];
}) {
  const invalidate = useInvalidate();
  const [filter, setFilter] = useState<"todos" | WardrobeType>("todos");
  const [open, setOpen] = useState(false);

  const list = items.filter((i) => filter === "todos" || i.type === filter);

  async function remove(item: WardrobeItem) {
    if (!confirm(`Excluir "${item.name}"?`)) return;
    await supabase.from("wardrobe_items").delete().eq("id", item.id);
    void invalidate("wardrobe_items");
    void logHistory(userName, "removeu peça", item.name);
  }

  return (
    <div className="space-y-3">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {[{ value: "todos", label: "Todas" }, ...WARDROBE_TYPES].map((t) => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value as "todos" | WardrobeType)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
              filter === t.value ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Button
        size="sm"
        onClick={() => {
          if (!ownerId) return toast.error("Crie/selecione uma pessoa antes de adicionar peças");
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> Nova peça
      </Button>

      {!list.length && (
        <EmptyState>
          <Shirt className="mx-auto mb-2 h-6 w-6" />
          Nenhuma peça por aqui ainda.
        </EmptyState>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((item) => (
          <article key={item.id} className="surface overflow-hidden">
            <StoredImage
              bucket="wardrobe"
              path={item.image_url}
              alt={item.name}
              className="aspect-square w-full"
              fallback={<Shirt className="h-6 w-6" />}
            />
            <div className="space-y-1 p-2.5">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <div className="flex flex-wrap gap-1">
                {item.color && <Pill>{item.color}</Pill>}
                {item.occasion && <Pill tone="primary">{item.occasion}</Pill>}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground">usada {item.times_used}x</span>
                <button onClick={() => void remove(item)} aria-label="Excluir peça">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <ItemModal
        open={open}
        onClose={() => setOpen(false)}
        userName={userName}
        ownerId={ownerId}
        owners={owners}
      />
    </div>
  );
}

function ItemModal({
  open,
  onClose,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  userName: string;
}) {
  const invalidate = useInvalidate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<WardrobeType>("blusa");
  const [color, setColor] = useState(WARDROBE_COLORS[0]);
  const [occasion, setOccasion] = useState(OCCASIONS[0]);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const blob = await compressImage(file, 900);
      const dataUrl = await fileToDataUrl(blob);
      setPreview(dataUrl);
      const path = await uploadFile("wardrobe", blob);
      setImagePath(path);
      setAnalyzing(true);
      const res = await analyzeGarment({ data: { imageDataUrl: dataUrl } });
      setName(res.name);
      setType(res.type as WardrobeType);
      setColor(res.color);
      setOccasion(res.occasion);
      toast.success("Peça analisada pela IA ✨");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao analisar a peça");
    } finally {
      setAnalyzing(false);
      setBusy(false);
    }
  }

  async function save() {
    if (!name.trim()) return toast.error("Informe o nome da peça");
    setBusy(true);
    const { error } = await supabase.from("wardrobe_items").insert({
      name: name.trim(),
      type,
      color,
      occasion,
      image_url: imagePath,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    void invalidate("wardrobe_items");
    void logHistory(userName, "adicionou peça", name.trim());
    toast.success("Peça adicionada");
    setName("");
    setPreview(null);
    setImagePath(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova peça"
      footer={
        <Button className="flex-1" onClick={() => void save()} disabled={busy}>
          {busy ? <Spinner /> : "Salvar peça"}
        </Button>
      }
    >
      <button
        onClick={() => fileRef.current?.click()}
        className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-secondary/60"
      >
        {preview ? (
          <img src={preview} alt="Prévia da peça" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
            <Camera className="h-5 w-5" />
            Tirar/escolher foto
          </span>
        )}
      </button>
      {analyzing && (
        <p className="flex items-center gap-2 text-sm text-primary">
          <Spinner /> IA analisando a peça...
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void handleFile(f);
        }}
      />

      <Field label="Nome">
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Tipo">
        <select className="field" value={type} onChange={(e) => setType(e.target.value as WardrobeType)}>
          {WARDROBE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cor">
          <select className="field" value={color} onChange={(e) => setColor(e.target.value)}>
            {WARDROBE_COLORS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Ocasião">
          <select className="field" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
            {OCCASIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function LookBuilder({ items, userName }: { items: WardrobeItem[]; userName: string }) {
  const invalidate = useInvalidate();
  const [occasion, setOccasion] = useState<string>("casual");
  const [look, setLook] = useState<WardrobeItem[] | null>(null);
  const [saving, setSaving] = useState(false);

  function pick(list: WardrobeItem[]) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function generate() {
    const pool = items.filter((i) => !i.occasion || i.occasion === occasion);
    const tops = pool.filter((i) => i.type === "blusa");
    const bottoms = pool.filter((i) => i.type === "calca");
    const dresses = pool.filter((i) => i.type === "vestido");
    const shoes = pool.filter((i) => i.type === "sapato");
    const layers = pool.filter((i) => i.type === "sobreposicao");

    const base: WardrobeItem[] = [];
    const useDress = dresses.length > 0 && (tops.length === 0 || bottoms.length === 0 || Math.random() < 0.35);

    if (useDress) {
      base.push(pick(dresses));
    } else {
      if (!tops.length || !bottoms.length) {
        return toast.error("Cadastre ao menos uma blusa e uma calça (ou um vestido) para essa ocasião.");
      }
      const top = pick(tops);
      const matching = bottoms.filter((b) => colorsMatch(top.color, b.color));
      base.push(top, matching.length ? pick(matching) : pick(bottoms));
    }

    if (shoes.length) {
      const matching = shoes.filter((s) => base.every((b) => colorsMatch(b.color, s.color)));
      base.push(matching.length ? pick(matching) : pick(shoes));
    }
    if (layers.length && Math.random() < 0.5) {
      const matching = layers.filter((l) => base.every((b) => colorsMatch(b.color, l.color)));
      if (matching.length) base.push(pick(matching));
    }

    setLook(base);
  }

  async function saveLook() {
    if (!look) return;
    setSaving(true);
    const { error } = await supabase.from("wardrobe_looks").insert({
      item_ids: look.map((i) => i.id),
      item_names: look.map((i) => i.name),
    });
    if (!error) {
      await Promise.all(
        look.map((i) =>
          supabase
            .from("wardrobe_items")
            .update({ times_used: i.times_used + 1, last_used: new Date().toISOString() })
            .eq("id", i.id),
        ),
      );
      void invalidate("wardrobe_looks");
      void invalidate("wardrobe_items");
      void logHistory(userName, "salvou um look", look.map((i) => i.name).join(" + "));
      toast.success("Look salvo!");
    } else {
      toast.error(error.message);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="surface p-4">
        <Field label="Ocasião">
          <select className="field" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
            {OCCASIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Button className="mt-3 w-full" onClick={generate}>
          <Wand2 className="h-4 w-4" /> Montar look
        </Button>
      </div>

      {look && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {look.map((i) => (
              <div key={i.id} className="surface overflow-hidden">
                <StoredImage
                  bucket="wardrobe"
                  path={i.image_url}
                  alt={i.name}
                  className="aspect-square w-full"
                  fallback={<Shirt className="h-6 w-6" />}
                />
                <p className="truncate p-2 text-xs font-semibold">{i.name}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void saveLook()} disabled={saving}>
              {saving ? <Spinner /> : <Sparkles className="h-4 w-4" />} Usar esse look
            </Button>
            <Button variant="outline" onClick={generate}>
              Trocar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SavedLooks({ items }: { items: WardrobeItem[] }) {
  const invalidate = useInvalidate();
  const { data: looks = [] } = useWardrobeLooks();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  async function remove(id: string) {
    await supabase.from("wardrobe_looks").delete().eq("id", id);
    void invalidate("wardrobe_looks");
  }

  if (!looks.length) return <EmptyState>Nenhum look salvo ainda.</EmptyState>;

  return (
    <div className="space-y-3">
      {looks.map((look) => (
        <article key={look.id} className="surface p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{look.item_names.join(" + ")}</p>
            <button onClick={() => void remove(look.id)} aria-label="Excluir look">
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {look.item_ids.map((id) => (
              <StoredImage
                key={id}
                bucket="wardrobe"
                path={byId.get(id)?.image_url ?? null}
                alt={byId.get(id)?.name ?? "peça"}
                className="h-16 w-16 shrink-0 rounded-lg"
                fallback={<Shirt className="h-4 w-4" />}
              />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
