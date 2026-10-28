import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button, Field, Modal } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { blankCargo, cargoDay, type CargoDraft, type CargoLoad } from "@/lib/cargo";

/**
 * Produtos da planilha de faturamento.
 * boxesPerPallet: caixas por pallet. Quando for null, você digita as caixas à mão.
 * Ajuste os valores aqui se algum estiver diferente da planilha.
 */
const MB_PRODUCTS: { code: string; name: string; palletId: string; boxesPerPallet: number | null }[] = [
  { code: "92527", name: "CRYSTAL 500ML SEM GÁS 12UN", palletId: "92596", boxesPerPallet: 168 },
  { code: "92522", name: "CRYSTAL 500ML COM GÁS 12UN", palletId: "92594", boxesPerPallet: 168 },
  { code: "92521", name: "CRYSTAL 1,5L SEM GÁS", palletId: "92592", boxesPerPallet: null },
  { code: "92520", name: "CRYSTAL 1,5L COM GÁS", palletId: "92590", boxesPerPallet: null },
  { code: "92670", name: "CRYSTAL PK 1,5L", palletId: "92674", boxesPerPallet: null },
  { code: "92536", name: "CRYSTAL COPO", palletId: "92597", boxesPerPallet: 50 },
  { code: "92909", name: "CRYSTAL COPO 200", palletId: "92909", boxesPerPallet: null },
  { code: "92581", name: "CRYSTAL 5 LITROS", palletId: "92601", boxesPerPallet: null },
];

type Line = { pallets: string; boxes: string };

const toNumber = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function McImportModal({
  open,
  onClose,
  existing,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  existing: CargoLoad[];
  onDone: () => void;
}) {
  const [dt, setDt] = useState("");
  const [date, setDate] = useState(cargoDay());
  const [destination, setDestination] = useState("MB - CD Osasco");
  const [carrier, setCarrier] = useState("");
  const [plate, setPlate] = useState("");
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [busy, setBusy] = useState(false);

  function setPallets(code: string, value: string, factor: number | null) {
    const pallets = value.replace(/[^\d]/g, "");
    setLines((prev) => ({
      ...prev,
      [code]: {
        pallets,
        // calcula as caixas sozinho quando sabe quantas cabem no pallet
        boxes: factor && pallets ? String(Number(pallets) * factor) : prev[code]?.boxes ?? "",
      },
    }));
  }

  function setBoxes(code: string, value: string) {
    setLines((prev) => ({
      ...prev,
      [code]: { pallets: prev[code]?.pallets ?? "", boxes: value.replace(/[^\d]/g, "") },
    }));
  }

  const chosen = useMemo(
    () => MB_PRODUCTS.filter((p) => toNumber(lines[p.code]?.pallets ?? "") > 0),
    [lines],
  );
  const totalPallets = chosen.reduce((s, p) => s + toNumber(lines[p.code].pallets), 0);
  const totalBoxes = chosen.reduce((s, p) => s + toNumber(lines[p.code].boxes), 0);

  const dtClean = dt.replace(/\D/g, "");
  const duplicate = !!dtClean && existing.some((l) => (l.driver_dt ?? "").trim() === dtClean);
  const missingBoxes = chosen.some((p) => toNumber(lines[p.code].boxes) <= 0);
  const canSave = !!dtClean && !duplicate && chosen.length > 0 && !missingBoxes && !busy;

  function reset() {
    setDt("");
    setCarrier("");
    setPlate("");
    setLines({});
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      const draft: CargoDraft = {
        ...blankCargo(),
        scheduled_date: date,
        load_number: "MB",
        origin_center: "B0AC",
        destination_center: "MB",
        destination_name: destination.trim() || "MB",
        carrier: carrier.trim(),
        plate: plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
        driver_dt: dtClean,
        pallets: String(totalPallets),
        notes: "Faturamento MB",
        products: chosen.map((p) => ({
          product_code: p.code,
          description: p.name,
          boxes: String(toNumber(lines[p.code].boxes)),
          extra_fields: {
            "Pallets do produto": String(toNumber(lines[p.code].pallets)),
            "ID do pallet": p.palletId,
          },
        })),
      };

      const payload = [
        {
          ...draft,
          products: draft.products.map((p) => ({ ...p, boxes: Number(p.boxes) })),
          pallets: totalPallets,
          confirm_update: false,
          expected_updated_at: null,
        },
      ];

      const { error } = await supabase.rpc("import_cargo_loads", { _loads: payload as never });
      if (error) throw error;

      toast.success(`Carga MB importada · DT ${dtClean}`);
      reset();
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui importar a carga MB");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar carga MB">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="DT">
            <input
              className="field"
              inputMode="numeric"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
              placeholder="106875705"
              autoFocus
            />
          </Field>
          <Field label="Data da carga">
            <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Transportadora">
            <input className="field" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Ciclon" />
          </Field>
          <Field label="Placa">
            <input className="field" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="EJW7E94" />
          </Field>
        </div>

        <Field label="Destino">
          <input className="field" value={destination} onChange={(e) => setDestination(e.target.value)} />
        </Field>

        {duplicate && <p className="text-xs text-destructive">Já existe uma carga com esse DT.</p>}

        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
            Produtos — preencha os pallets só do que vai
          </p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {MB_PRODUCTS.map((p) => {
              const line = lines[p.code];
              const active = toNumber(line?.pallets ?? "") > 0;
              return (
                <div
                  key={p.code}
                  className={`grid grid-cols-[1fr_64px_80px] items-center gap-2 px-2 py-1.5 ${active ? "bg-primary-soft" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.code} · pallet {p.palletId}
                      {p.boxesPerPallet ? ` · ${p.boxesPerPallet} cx/plt` : ""}
                    </p>
                  </div>
                  <input
                    className="field h-9 px-2 text-center text-sm"
                    inputMode="numeric"
                    placeholder="plt"
                    value={line?.pallets ?? ""}
                    onChange={(e) => setPallets(p.code, e.target.value, p.boxesPerPallet)}
                  />
                  <input
                    className="field h-9 px-2 text-center text-sm"
                    inputMode="numeric"
                    placeholder="caixas"
                    value={line?.boxes ?? ""}
                    disabled={!active}
                    onChange={(e) => setBoxes(p.code, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[13px]">
          <strong>{totalPallets}</strong> pallets · <strong>{totalBoxes.toLocaleString("pt-BR")}</strong> caixas
          {missingBoxes && <span className="text-destructive"> · falta informar as caixas</span>}
        </p>

        <Button className="w-full" disabled={!canSave} onClick={() => void save()}>
          <Check className="h-4 w-4" /> {busy ? "Importando..." : "Importar carga MB"}
        </Button>
      </div>
    </Modal>
  );
}
