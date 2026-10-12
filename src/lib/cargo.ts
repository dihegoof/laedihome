import type { Database } from '@/integrations/supabase/types';

export type CargoProduct = Database['public']['Tables']['cargo_products']['Row'];
export type CargoLoad = Database['public']['Tables']['cargo_loads']['Row'] & { cargo_products: CargoProduct[] };
export type CargoHistory = Database['public']['Tables']['cargo_history']['Row'];
export type ProductDraft = { product_code: string; description: string; boxes: string; extra_fields: Record<string, string> };
export type CargoDraft = { scheduled_date: string; load_number: string; origin_center: string; destination_center: string; destination_name: string; carrier: string; plate: string; driver_dt: string; pallets: string; notes: string; products: ProductDraft[]; warnings: string[]; reviewed: boolean; selected: boolean };
export const cargoFields = [
  ['scheduled_date', 'Data prevista'], ['load_number', 'Número da carga'], ['origin_center', 'Centro de origem'], ['destination_center', 'Centro de destino'],
  ['destination_name', 'Nome do destino'], ['carrier', 'Transportadora'], ['plate', 'Placa'], ['driver_dt', 'DT do motorista'], ['pallets', 'Pallets'], ['notes', 'Observações'],
] as const;
export const stages = {
  billing_status: { label: 'Faturamento', options: [['pending', 'Pendente de faturamento'], ['processing', 'Em faturamento'], ['issued', 'Nota emitida'], ['cancelled', 'Cancelada']] },
  cte_status: { label: 'CTe', options: [['waiting', 'Aguardando CTe'], ['requested', 'CTe solicitado'], ['automatic', 'CTe recebido automaticamente'], ['manual', 'CTe recebido manualmente']] },
  print_status: { label: 'Impressão', options: [['pending', 'Impressão pendente'], ['automatic', 'Nota impressa automaticamente'], ['manual', 'Nota impressa manualmente']] },
  operational_status: { label: 'Operação / saída', options: [['pending', 'Pendente'], ['processing', 'Em processamento'], ['awaiting_release', 'Aguardando liberação'], ['released', 'Liberada para saída'], ['departed', 'Saiu para entrega'], ['finished', 'Finalizada'], ['cancelled', 'Cancelada']] },
} as const;
export const cargoIssueOptions = [['none','Sem impedimento'],['waiting_values','Aguardando valor no sistema'],['error','Carga com erro']] as const;
export function cargoDay(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function cargoPeriod(load: {registered_at: string}, now = new Date()): 'today' | 'history' | 'expired' {
  const today = cargoDay(now); const day = cargoDay(new Date(load.registered_at));
  const age = (Date.parse(today+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000;
  return age >= 30 ? 'expired' : age === 0 ? 'today' : 'history';
}
export function billingCompletionPatch() { return {billing_status:'issued',billing_issue:'none'}; }
export function cargoIdentity(d: {driver_dt?: string | null; scheduled_date: string; load_number: string}) { return d.driver_dt?.trim() ? `dt:${d.driver_dt.trim()}` : `${d.scheduled_date}:${d.load_number.trim()}`; }
export type Stage = keyof typeof stages;
export function stageLabel(field: Stage, value: string) { return stages[field].options.find(([key]) => key === value)?.[1] ?? value; }
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string[]> = {
  scheduled_date: ['data', 'dataprevista', 'datacarregamento', 'dataprev', 'datacarga', 'dtprevista'],
  load_number: ['carga', 'numerocarga', 'numerodacarga', 'ncarga', 'nrocarga', 'numcarga', 'remessa'],
  origin_center: ['origem', 'centroorigem', 'centrodeorigem', 'centroexpedidor'],
  destination_center: ['centro', 'centrodestino', 'centrodedestino', 'centrorecebedor'],
  destination_name: ['destino', 'nomedestino', 'nomedodestino', 'descricao destino', 'cliente'],
  carrier: ['transportadora', 'transportador', 'transp'], plate: ['placa', 'placaveiculo', 'placadoveiculo'], driver_dt: ['dt', 'dtdomotorista', 'dtmotorista'],
  pallets: ['pallets', 'paletes', 'pallet', 'qtdpallets', 'totalpallets', 'quantidadetotaldepallets'],
  product_code: ['produto', 'codproduto', 'codigoproduto', 'codigodoproduto', 'codigo', 'material', 'sku'],
  description: ['descricao', 'descricaoproduto', 'descricaodoproduto', 'descricaomaterial'],
  boxes: ['caixas', 'cx', 'qtd', 'quantidade', 'qtdcaixas', 'quantidadecaixas', 'quantidadeemcaixas'], notes: ['observacao', 'observacoes', 'obs'],
};
function headerKey(cell: string) { const n = normalize(cell); return cargoFields.find(([,label]) => normalize(label)===n)?.[0] ?? Object.entries(aliases).find(([, names]) => names.some((a) => normalize(a) === n))?.[0] ?? `extra:${cell.trim()}`; }
export function blankCargo(): CargoDraft { return { scheduled_date: '', load_number: '', origin_center: '', destination_center: '', destination_name: '', carrier: '', plate: '', driver_dt: '', pallets: '', notes: '', products: [], warnings: [], reviewed: false, selected: true }; }
export function numberValue(value: string): number | null {
  const v = value.trim().replace(/\s/g, '');
  if (!/^\d+(?:[.,]\d+)*$/.test(v)) return null;
  const parsed = Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100000000 && Math.abs(parsed * 1000 - Math.round(parsed * 1000)) < 0.00001 ? parsed : null;
}
export function parseDate(value: string) {
  const v = value.trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}
function tokenize(line: string) { return line.replace(/^ +| +$/g,'').split(/\t| *[|;] *| {2,}/).map((v) => v.trim()); }
function spaceRow(line: string, keys: string[]): string[] | null {
  const numeric = '(\\d+(?:[.,]\\d+)*)';
  const parts = keys.map((key) => key === 'scheduled_date' ? '(\\d{2}/\\d{2}/\\d{4}|\\d{4}-\\d{2}-\\d{2})' : ['load_number','origin_center','destination_center','driver_dt','product_code'].includes(key) ? '(\\S+)' : ['pallets','boxes'].includes(key) ? numeric : key === 'plate' ? '([A-Za-z]{3}[- ]?\\d[A-Za-z0-9]\\d{2})' : '(.+?)');
  const match = new RegExp(`^${parts.join('\\s+')}$`).exec(line.trim());
  return match ? match.slice(1) : null;
}
function untitledRow(line: string): Record<string, string> | null {
  // Fixed spreadsheet layout: date, load, origin, destination, name, SKU, description, boxes, pallets.
  const match = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s+(\d+)\s+([A-Za-z0-9]{4})\s+([A-Za-z0-9]{4})\s+(.+?)\s+(\d{5,})\s+(.+?)\s+(\d+(?:[.,]\d+)*)(?:\s+(\d+(?:[.,]\d+)*))?$/.exec(line.trim());
  if (!match) return null;
  const [,scheduled_date,load_number,origin_center,destination_center,destination_name,product_code,description,boxes,pallets] = match;
  const quantity = (value: string) => /^\d{1,3}(?:\.\d{3})+$/.test(value) ? value.replace(/\./g, '') : value;
  return { scheduled_date,load_number,origin_center,destination_center,destination_name,product_code,description,boxes:quantity(boxes),pallets:pallets ? quantity(pallets) : '' };
}
function carrierRow(line: string): Record<string, string> | null {
  const match = /^(?:(\d+(?:[.,]\d+)*)\s+)?(.+?)\s+([A-Za-z]{3}[- ]?\d[A-Za-z0-9]\d{2})\s+(\d+)\s*$/.exec(line.trim());
  if (!match) return null;
  return { pallets:match[1] ?? '',carrier:match[2],plate:match[3].replace(/[- ]/g, '').toUpperCase(),driver_dt:match[4] };
}
export function validateDraft(draft: CargoDraft): string[] {
  const errors: string[] = [];
  if (!parseDate(draft.scheduled_date)) errors.push('Informe uma data prevista válida.');
  if (!draft.load_number.trim()) errors.push('Informe o número da carga.');
  if (draft.pallets && numberValue(draft.pallets) === null) errors.push('Confira o total de pallets.');
  if (!draft.products.length) errors.push('A carga precisa de pelo menos um produto.');
  const seen = new Set<string>();
  draft.products.forEach((p, i) => {
    if (!p.product_code.trim() || !p.description.trim() || numberValue(p.boxes) === null) errors.push(`Confira código, descrição e caixas do produto ${i + 1}.`);
    if (seen.has(p.product_code.trim())) errors.push(`Produto ${p.product_code} repetido: revise antes de importar.`);
    seen.add(p.product_code.trim());
  });
  return errors;
}
function fixedRow(line: string): Record<string,string> | null {
  const cells = tokenize(line).filter(Boolean);
  const quantity = (v: string) => /^\d{1,3}(?:\.\d{3})+$/.test(v) ? v.replace(/\./g,'') : v;
  if (cells.length === 12 && parseDate(cells[0])) {
    const names = ['scheduled_date','load_number','origin_center','destination_center','destination_name','product_code','description','boxes','pallets','carrier','plate','driver_dt'];
    const data = Object.fromEntries(names.map((k,i)=>[k,cells[i]]));
    data.boxes=quantity(data.boxes); data.pallets=quantity(data.pallets);
    return data;
  }
  const suffix = /\s+([A-Za-z]{3}[- ]?\d[A-Za-z0-9]\d{2})\s+(\d+)\s*$/.exec(line);
  if (!suffix || suffix.index === undefined) return null;
  const prefix = line.slice(0,suffix.index);
  const match = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s+(\d+)\s+([A-Za-z0-9]{4})\s+([A-Za-z0-9]{4})\s+(.+?)\s+(\d{5,})\s+(.+?)\s+(\d+(?:[.,]\d+)*)\s+(\d+(?:[.,]\d+)*)\s+(.+)$/.exec(prefix.trim());
  if (!match) return null;
  const [,scheduled_date,load_number,origin_center,destination_center,destination_name,product_code,description,boxes,pallets,carrier] = match;
  return {scheduled_date,load_number,origin_center,destination_center,destination_name,product_code,description,boxes:quantity(boxes),pallets:quantity(pallets),carrier,plate:suffix[1].replace(/[- ]/g,'').toUpperCase(),driver_dt:suffix[2]};
}
export function parseCargoEmail(text: string): { loads: CargoDraft[]; unparsed: string[] } {
  const lines=text.replace(/\r/g,'').replace(/\u00a0/g,' ').split('\n').filter(v=>v.trim());
  const rows: {data:Record<string,string>; fixed:boolean}[]=[];
  const unparsed:string[]=[];
  let keys:string[]=[];
  let previous:typeof rows[number] | undefined;
  for (const line of lines) {
    const cells=tokenize(line);
    const candidate=cells.map(headerKey);
    if (candidate.includes('load_number') && candidate.includes('product_code') && candidate.includes('boxes')) {keys=candidate;previous=undefined;continue;}
    const fixed=!keys.length ? fixedRow(line) : null;
    const untitled=!keys.length ? untitledRow(line):null;
    const values=keys.length ? cells.length===keys.length ? cells:spaceRow(line,keys):null;
    const data=fixed ?? untitled ?? (values ? Object.fromEntries(keys.map((k,i)=>[k,values[i]??''])):null);
    if (data?.load_number && data.product_code) {previous={data,fixed:!!fixed||!!untitled};rows.push(previous);continue;}
    const continuation=carrierRow(line);
    if (continuation && previous?.fixed && !previous.data.driver_dt) {
      for (const [k,v] of Object.entries(continuation)) if(v) previous.data[k]=v;
    } else {unparsed.push(line);previous=undefined;}
  }
  const loads:CargoDraft[]=[];
  for (const {data,fixed} of rows) {
    const date=parseDate(data.scheduled_date??'');
    const identity=cargoIdentity({...data,scheduled_date:date,load_number:data.load_number});
    let draft=loads.find(l=>cargoIdentity(l)===identity);
    if (!draft) {draft={...blankCargo(),...Object.fromEntries(cargoFields.map(([k])=>[k,data[k]??''])),scheduled_date:date,pallets:fixed?'':data.pallets??''};loads.push(draft);}
    for(const [key,label] of cargoFields) {
      if(['notes','pallets'].includes(key)) continue;
      const next=key==='scheduled_date'?date:data[key]??'';
      if(next && draft[key] && next!==draft[key]) draft.warnings.push(`${label} conflitante: “${draft[key]}” / “${next}”.`);
      else if(next) draft[key]=next;
    }
    const product:ProductDraft={product_code:data.product_code,description:data.description??'',boxes:data.boxes??'',extra_fields:Object.fromEntries(Object.entries(data).filter(([k])=>k.startsWith('extra:')).map(([k,v])=>[k.slice(6),v]))};
    if(fixed && data.pallets) product.extra_fields['Pallets do produto']=data.pallets;
    const existing=draft.products.find(p=>p.product_code===product.product_code);
    if(!existing) draft.products.push(product);
    else if(JSON.stringify(existing)!==JSON.stringify(product)) {draft.products.push(product);draft.warnings.push(`Produto ${product.product_code} com informações conflitantes.`);}
    if(fixed) {const amounts=draft.products.map(p=>numberValue(p.extra_fields['Pallets do produto']??''));draft.pallets=amounts.every(v=>v!==null)?String(amounts.reduce<number>((sum,v)=>sum+(v??0),0)):'';}
    else if(data.pallets && draft.pallets!==data.pallets) draft.warnings.push(`Pallets conflitante: “${draft.pallets}” / “${data.pallets}”.`);
  }
  for(const draft of loads) {
    for(const [key,label] of cargoFields) if(key!=='notes' && !draft[key]) draft.warnings.push(`${label} não identificado; confira.`);
    draft.warnings=[...new Set(draft.warnings)];
  }
  return {loads,unparsed};
}
export function cargoDifferences(draft: CargoDraft, existing: CargoLoad): string[] {
  const differences: string[] = [];
  for (const [key,label] of cargoFields) {
    if (draft[key] && (key === 'pallets' ? numberValue(draft[key]) !== existing.pallets : draft[key] !== String(existing[key] ?? ''))) differences.push(`${label}: ${existing[key] ?? '—'} → ${draft[key]}`);
  }
  for (const p of draft.products) {
    const previous = existing.cargo_products.find((old) => old.product_code === p.product_code);
    if (!previous) differences.push(`Novo produto: ${p.product_code} · ${p.description} · ${p.boxes} caixas`);
    else if (previous.description !== p.description || Number(previous.boxes) !== numberValue(p.boxes) || Object.entries(p.extra_fields).some(([k,v]) => (previous.extra_fields as Record<string, unknown>)?.[k] !== v)) differences.push(`Produto ${p.product_code}: ${previous.description} / ${previous.boxes} caixas → ${p.description} / ${p.boxes} caixas`);
  }
  return differences;
}
export function quickCargoImport(text: string, existing: CargoLoad[]) {
  const result = parseCargoEmail(text);
  const ready: CargoDraft[] = [];
  const review: CargoDraft[] = [];
  let unchanged = 0;
  for (const draft of result.loads) {
    const saved = existing.find((load) => cargoIdentity(load) === cargoIdentity(draft));
    if (saved && !cargoDifferences(draft, saved).length && !draft.warnings.length && !validateDraft(draft).length && !result.unparsed.length) { unchanged++; continue; }
    if (saved || draft.warnings.length || validateDraft(draft).length || result.unparsed.length) review.push(draft);
    else ready.push(draft);
  }
  return { ready, review, unchanged, unparsed: result.unparsed };
}
export type CargoFilters = { search: string; date: string; destination: string; center: string; carrier: string; plate: string; dt: string; status: string; pending: boolean };
export const emptyFilters: CargoFilters = { search: '', date: '', destination: '', center: '', carrier: '', plate: '', dt: '', status: '', pending: false };
export function filterCargos(loads: CargoLoad[], filters: CargoFilters) {
  const contains = (value: string | null, query: string) => normalize(value ?? '').includes(normalize(query));
  return loads.filter((l) => contains(l.load_number,filters.search) && (!filters.date || l.scheduled_date === filters.date) && contains(l.destination_name,filters.destination) && contains(`${l.origin_center ?? ''} ${l.destination_center ?? ''}`,filters.center) && contains(l.carrier,filters.carrier) && contains(l.plate,filters.plate) && contains(l.driver_dt,filters.dt) && (!filters.pending || !['finished','cancelled'].includes(l.operational_status)) && (!filters.status || Object.keys(stages).some((key) => `${key}:${l[key as Stage]}` === filters.status)));
}
export function cargoSummary(loads: CargoLoad[]) {
  const active = loads.filter((l) => l.operational_status !== 'cancelled' && l.billing_status !== 'cancelled');
  return [ ['Previstas',loads.length], ['Pendentes de faturamento',active.filter((l) => ['pending','processing'].includes(l.billing_status)).length], ['Nota emitida',active.filter((l) => l.billing_status === 'issued').length], ['Aguardando CTe',active.filter((l) => ['waiting','requested'].includes(l.cte_status)).length], ['Aguardando impressão',active.filter((l) => l.print_status === 'pending').length], ['Liberadas para saída',active.filter((l) => l.operational_status === 'released').length], ['Finalizadas',loads.filter((l) => l.operational_status === 'finished').length] ] as const;
}
export function cargoCsv(loads: CargoLoad[], detailed: boolean) {
  const header = [...cargoFields.map(([,label]) => label), ...Object.values(stages).map((s) => s.label), 'Importada em', 'Total de caixas', ...(detailed ? ['Código','Descrição','Caixas','Outros campos'] : [])];
  const rows = loads.flatMap((l) => {
    const base = [...cargoFields.map(([key]) => l[key] ?? ''), ...Object.keys(stages).map((key) => stageLabel(key as Stage,l[key as Stage])),l.imported_at,l.cargo_products.reduce((sum,p) => sum+Number(p.boxes),0)];
    return detailed ? l.cargo_products.map((p) => [...base,p.product_code,p.description,p.boxes,JSON.stringify(p.extra_fields)]) : [base];
  });
  const escape = (value: unknown) => `"${String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g,'""')}"`;
  return '\uFEFF'+[header,...rows].map((row) => row.map(escape).join(';')).join('\r\n');
}