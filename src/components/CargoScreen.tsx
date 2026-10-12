import { Suspense, useEffect, useState } from 'react';
import { useQueryClient, useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, Download, FileText, Filter, Pencil, Plus, Search, Trash2, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, EmptyState, Field, Pill, Spinner } from '@/components/kit';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { billingCompletionPatch, cargoDay, cargoIdentity, cargoIssueOptions, cargoPeriod, cargoCsv, cargoDifferences, cargoFields, cargoSummary, emptyFilters, filterCargos, numberValue, quickCargoImport, stageLabel, stages, validateDraft, type CargoDraft, type CargoHistory, type CargoLoad, type Stage } from '@/lib/cargo';
import type { Json } from '@/integrations/supabase/types';

const dateLabel = (v: string) => new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR');
const timeLabel = (v: string) => new Date(v).toLocaleString('pt-BR');
function errorMessage(error: unknown) { return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Não foi possível salvar. Tente novamente.'; }
export function CargoScreen() {
  return <Suspense fallback={<EmptyState><Spinner /> Carregando cargas...</EmptyState>}><CargoContent /></Suspense>;
}
function CargoContent() {
  const { profile } = useAuth();
  const household = profile?.household_id;
  const qc = useQueryClient();
  const [text,setText] = useState('');
  const [drafts,setDrafts] = useState<CargoDraft[]>([]);
  const [unparsed,setUnparsed] = useState<string[]>([]);
  const [ack,setAck] = useState(false);
  const [busy,setBusy] = useState(false);
  const [pasteOpen,setPasteOpen] = useState(false);
  const [filters,setFilters] = useState(emptyFilters);
  const [expandedFilters,setExpandedFilters] = useState(false);
  const [sort,setSort] = useState('scheduled_date');
  const [period,setPeriod] = useState<'today'|'history'>('today');
  const [today,setToday] = useState(()=>cargoDay());
  useEffect(()=>{const timer=window.setInterval(()=>setToday(cargoDay()),60_000);return ()=>window.clearInterval(timer);},[]);
  const [selected,setSelected] = useState<string | null>(null);
  const { data: loads } = useSuspenseQuery({
    queryKey: ['cargo_loads',household],
    staleTime: 30_000,
    queryFn: async () => {
      if (!household) return [];
      const { data,error } = await supabase.from('cargo_loads').select('*,cargo_products(*)').eq('household_id',household).order('scheduled_date',{ascending:false});
      if (error) throw error;
      return (data ?? []) as CargoLoad[];
    },
  });
  useEffect(() => {
    if (!household) return;
    const channel = supabase.channel(`cargo-${household}`);
    for (const table of ['cargo_loads','cargo_products','cargo_history']) channel.on('postgres_changes',{event:'*',schema:'public',table},() => {
      void qc.invalidateQueries({queryKey:['cargo_loads',household]});
      void qc.invalidateQueries({queryKey:['cargo_history',household]});
    });
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  },[household,qc]);
  async function refresh() { await Promise.all([qc.invalidateQueries({queryKey:['cargo_loads',household]}),qc.invalidateQueries({queryKey:['cargo_history',household]})]); }
  async function run(action: () => Promise<void>) {
    if (!navigator.onLine) { toast.error('Conecte à internet para salvar as cargas.'); return; }
    setBusy(true);
    try { await action(); await refresh(); } catch (error) { toast.error(errorMessage(error)); await refresh(); } finally { setBusy(false); }
  }
  const matching = (draft: CargoDraft) => loads.find((l) => cargoIdentity(l) === cargoIdentity(draft));
  const selectedDrafts = drafts.filter((d) => d.selected);
  const duplicateKeys = selectedDrafts.some((d,i) => selectedDrafts.some((other,j) => i!==j && cargoIdentity(d) === cargoIdentity(other)));
  const canImport = !!household && selectedDrafts.length > 0 && !duplicateKeys && selectedDrafts.every((d) => !validateDraft(d).length && d.reviewed) && (!unparsed.length || ack);
  async function saveDrafts(items: CargoDraft[]) {
    const payload = items.map((d) => {
      const existing = matching(d);
      return { ...Object.fromEntries(cargoFields.map(([key]) => [key,key === 'pallets' ? d.pallets ? numberValue(d.pallets) : null : d[key].trim()])), products:d.products.map((p) => ({...p,boxes:numberValue(p.boxes)})),confirm_update:!!existing,expected_updated_at:existing?.updated_at ?? null };
    });
    const { error } = await supabase.rpc('import_cargo_loads',{_loads:payload as Json});
    if (error) throw error;
  }
  async function pasteLoads(value: string) {
    if (busy || !household || !value.trim()) return;
    setText(value); setAck(false);
    const result = quickCargoImport(value,loads);
    setDrafts(result.review); setUnparsed(result.unparsed);
    if (!result.ready.length && !result.review.length && !result.unchanged) { toast.error('Não identifiquei as cargas. Confira se as linhas completas foram copiadas.'); return; }
    if (result.ready.length) await run(async () => {
      try { await saveDrafts(result.ready); }
      catch (error) { setDrafts([...result.ready,...result.review]); throw error; }
      setPeriod('today'); setFilters(emptyFilters);
      if (!result.review.length && !result.unparsed.length) { setText(''); setPasteOpen(false); }
      toast.success(`${result.ready.length} cargas adicionadas.`);
    });
    else if (result.unchanged && !result.review.length) { setText(''); setPasteOpen(false); toast.success('Essas cargas já estão na lista.'); }
  }
  async function importLoads() {
    if (!canImport) return;
    await run(async () => {
      await saveDrafts(selectedDrafts);
      setDrafts([]); setUnparsed([]); setText(''); setPasteOpen(false); toast.success('Cargas importadas.');
    });
  }
  const visible = filterCargos(loads.filter(l=>cargoPeriod(l,new Date(today+'T12:00:00Z'))===period),filters).sort((a,b) => {
    const value = (l: CargoLoad) => sort === 'load_number' ? l.load_number : sort === 'destination_name' ? l.destination_name ?? '' : sort === 'status' ? stageLabel('operational_status',l.operational_status) : l.scheduled_date;
    return value(a).localeCompare(value(b),'pt-BR',{numeric:true});
  });
  function exportCsv(detailed: boolean) {
    const url = URL.createObjectURL(new Blob([cargoCsv(visible,detailed)],{type:'text/csv;charset=utf-8;'}));
    const anchor = document.createElement('a'); anchor.href=url; anchor.download=`cargas-${detailed?'detalhadas':'resumo'}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  const selectedLoad = loads.find((l) => l.id === selected);
  function openLoad(id: string | null) { setSelected(id); window.scrollTo({top:0}); }
  if (selectedLoad) return <><div className="sticky top-16 z-20 border-b border-border bg-background py-2"><select className="field" aria-label="Trocar carga" value={selectedLoad.id} onChange={e=>openLoad(e.target.value)}>{(visible.some(l=>l.id===selectedLoad.id)?visible:[selectedLoad,...visible]).map(l=><option key={l.id} value={l.id}>Carga {l.load_number} · {l.destination_name} · DT {l.driver_dt}</option>)}</select></div><CargoDetails key={selectedLoad.id} load={selectedLoad} busy={busy} onBack={() => openLoad(null)} onSave={(patch,note) => run(async () => {
    const {error} = await supabase.rpc('update_cargo_load',{_id:selectedLoad.id,_patch:patch as Json,_expected_updated_at:selectedLoad.updated_at,_note:note});
    if (error) throw error;
    toast.success('Carga atualizada.');
  })} /></>;
  return <div className="space-y-5">
    <div className="flex items-center gap-2"><Truck className="h-6 w-6 text-primary" /><h2 className="text-xl">Controle de Cargas</h2></div>
    <div className="flex gap-2"><Button size="sm" variant={period==='today'?'primary':'outline'} onClick={()=>{setPeriod('today');setFilters(emptyFilters);}}>Cargas de hoje</Button><Button size="sm" variant={period==='history'?'primary':'outline'} onClick={()=>{setPeriod('history');setFilters(emptyFilters);}}>Histórico · 30 dias</Button></div>
    {period==='today' && <section className="space-y-3">
      {!!loads.length && !pasteOpen && !drafts.length && !text && <Button size="sm" variant="outline" onClick={()=>setPasteOpen(true)}><Plus className="h-4 w-4" />Colar novas cargas</Button>}
      {(!loads.length || pasteOpen || !!drafts.length || !!text) && <>
      <Field label="Cole aqui os dados da planilha ou e-mail"><textarea className="field min-h-20 resize-y" disabled={busy} value={text} onPaste={e=>{e.preventDefault();const target=e.currentTarget;const value=target.value.slice(0,target.selectionStart)+e.clipboardData.getData('text')+target.value.slice(target.selectionEnd);void pasteLoads(value);}} onChange={(e) => {setText(e.target.value);setDrafts([]);setUnparsed([]);setAck(false);}} /></Field>
      <div className="flex flex-wrap gap-2">
        {busy ? <span className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Salvando cargas...</span> : !drafts.length && !!text.trim() && <Button size="sm" onClick={()=>void pasteLoads(text)}><Plus className="h-4 w-4" />Adicionar cargas</Button>}
        {!!drafts.length && <Button size="sm" variant="outline" disabled={!canImport || busy} onClick={() => void importLoads()}><Check className="h-4 w-4" />Salvar cargas revisadas</Button>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => {setText('');setDrafts([]);setUnparsed([]);setAck(false);}}><X className="h-4 w-4" />Limpar texto</Button>
      </div>
      {!!unparsed.length && <details className="border-l-2 border-warning pl-3 text-sm"><summary className="cursor-pointer text-warning-foreground">{unparsed.length} linhas não interpretadas</summary><pre className="my-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{unparsed.join('\n')}</pre>{!!drafts.length && <label className="flex items-start gap-2"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />Conferi as linhas não interpretadas e confirmo que não faltam produtos na prévia.</label>}</details>}
      {duplicateKeys && <p className="text-sm text-destructive">Existem duas cargas selecionadas com o mesmo DT ou identificação. Corrija a prévia.</p>}
      {drafts.map((draft,i) => <CargoPreview key={i} draft={draft} existing={matching(draft)} onChange={(next) => setDrafts((old) => old.map((d,index) => index === i ? {...next,reviewed:false} : d))} onReview={(reviewed) => setDrafts((old) => old.map((d,index) => index === i ? {...d,reviewed} : d))} />)}
      </>}
    </section>}
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg">{period==='today'?'Cargas de hoje':'Histórico temporário'}</h3><div className="flex gap-2"><Button size="icon" variant="outline" title="Exportar resumo CSV" aria-label="Exportar resumo CSV" disabled={!visible.length} onClick={() => exportCsv(false)}><Download className="h-4 w-4" /></Button><Button size="icon" variant="outline" title="Exportar produtos CSV" aria-label="Exportar produtos CSV" disabled={!visible.length} onClick={() => exportCsv(true)}><FileText className="h-4 w-4" /></Button></div></div>
      <details><summary className="cursor-pointer text-sm text-muted-foreground">Resumo · {visible.length} cargas</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{cargoSummary(visible).map(([label,count]) => <div key={label} className="border-l-2 border-primary pl-3 py-1"><p className="text-2xl font-semibold tabular-nums">{count}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div></details>
      <div className="grid grid-cols-[1fr_auto] gap-2"><input className="field min-w-0" aria-label="Busca por número da carga" placeholder="Número da carga" value={filters.search} onChange={(e) => setFilters({...filters,search:e.target.value})} /><Button size="icon" variant="outline" title="Filtros" aria-label="Filtros" onClick={() => setExpandedFilters(!expandedFilters)}><Filter className="h-4 w-4" /></Button></div>
      {expandedFilters && <div className="grid grid-cols-2 gap-3">
        <Field label="Data prevista"><input className="field" type="date" value={filters.date} onChange={(e) => setFilters({...filters,date:e.target.value})} /></Field>
        {([['destination','Destino'],['center','Centro'],['carrier','Transportadora'],['plate','Placa'],['dt','DT']] as const).map(([key,label]) => <Field key={key} label={label}><input className="field" value={filters[key]} onChange={(e) => setFilters({...filters,[key]:e.target.value})} /></Field>)}
        <Field label="Status"><select className="field" value={filters.status} onChange={(e) => setFilters({...filters,status:e.target.value})}><option value="">Todos</option>{Object.entries(stages).map(([key,s]) => <optgroup key={key} label={s.label}>{s.options.map(([value,label]) => <option key={value} value={`${key}:${value}`}>{label}</option>)}</optgroup>)}</select></Field>
        <Button size="sm" variant="ghost" onClick={() => setFilters(emptyFilters)}>Limpar filtros</Button>
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.pending} onChange={(e) => setFilters({...filters,pending:e.target.checked})} />Somente pendentes</label><select className="field max-w-44" aria-label="Ordenar cargas" value={sort} onChange={(e) => setSort(e.target.value)}><option value="scheduled_date">Data prevista</option><option value="load_number">Número da carga</option><option value="destination_name">Destino</option><option value="status">Status</option></select></div>
      {!visible.length && <EmptyState>{loads.length ? 'Nenhuma carga corresponde aos filtros.' : 'Nenhuma carga cadastrada.'}</EmptyState>}
      {visible.map((load) => <Button key={load.id} variant="outline" aria-label={`Abrir carga ${load.load_number}`} onClick={()=>openLoad(load.id)} className="h-auto w-full flex-col items-stretch gap-2 whitespace-normal p-3 text-left font-normal">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="break-words font-semibold text-lg">Carga {load.load_number}</h4><p className="text-sm text-muted-foreground">{dateLabel(load.scheduled_date)} · {load.destination_name ?? 'Destino não informado'}</p></div><ChevronDown className="h-4 w-4 shrink-0" /></div>
        <p className="text-xs text-muted-foreground">DT {load.driver_dt??'—'} · {load.carrier ?? 'Transportadora não informada'} · {load.plate ?? 'Sem placa'} · {load.pallets ?? '—'} pallets · {load.cargo_products.length} produtos</p>
        <div className="flex flex-wrap gap-1.5">{(Object.keys(stages) as Stage[]).map((key) => <Pill key={key} tone={['issued','automatic','manual','finished'].includes(load[key])?'success':'muted'}>{stageLabel(key,load[key])}</Pill>)}</div>
        {load.billing_issue!=='none' && <Pill tone="accent">{cargoIssueOptions.find(([v])=>v===load.billing_issue)?.[1]}</Pill>}
        {load.operational_status==='finished' && <p className="text-sm font-semibold">{load.departure_confirmed?'Finalizada com saída':'Finalizada sem saída'}</p>}
        {!!load.notes && <p className="whitespace-pre-wrap break-words text-sm">{load.notes}</p>}
      </Button>)}
    </section>
  </div>;
}
function CargoPreview({draft,existing,onChange,onReview}: {draft:CargoDraft;existing?:CargoLoad;onChange:(d:CargoDraft)=>void;onReview:(v:boolean)=>void}) {
  const errors=validateDraft(draft);
  const differences=existing?cargoDifferences(draft,existing):[];
  return <article className="surface p-3 space-y-3">
    <label className="flex gap-2 items-center font-semibold"><input type="checkbox" checked={draft.selected} onChange={(e) => onChange({...draft,selected:e.target.checked})} />Carga {draft.load_number || 'não identificada'} {existing && <Pill tone="accent">Já cadastrada</Pill>}</label>
    <details><summary className="cursor-pointer text-sm">{draft.destination_name} · DT {draft.driver_dt||'—'} · {draft.products.length} produtos · {draft.pallets||'—'} pallets</summary><div className="mt-3 grid grid-cols-2 gap-2">{cargoFields.map(([key,label]) => <Field key={key} label={label}><input className={`field ${!draft[key]&&key!=='notes'?'border-warning':''}`} type={key==='scheduled_date'?'date':'text'} value={draft[key]} onChange={(e) => onChange({...draft,[key]:e.target.value})} /></Field>)}</div>
    <div className="space-y-2">{draft.products.map((p,i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 border-b border-border pb-2"><Field label="Código"><input className="field" value={p.product_code} onChange={(e) => onChange({...draft,products:draft.products.map((v,index) => index===i?{...v,product_code:e.target.value}:v)})} /></Field><Field label="Caixas"><input className="field" inputMode="decimal" value={p.boxes} onChange={(e) => onChange({...draft,products:draft.products.map((v,index) => index===i?{...v,boxes:e.target.value}:v)})} /></Field><Button variant="ghost" size="icon" title="Remover produto da prévia" aria-label={`Remover produto ${i+1}`} onClick={() => onChange({...draft,products:draft.products.filter((_,index) => index!==i)})}><Trash2 className="h-4 w-4" /></Button><div className="col-span-3"><Field label="Descrição"><input className="field" value={p.description} onChange={(e) => onChange({...draft,products:draft.products.map((v,index) => index===i?{...v,description:e.target.value}:v)})} /></Field>{Object.entries(p.extra_fields).map(([key,value]) => <Field key={key} label={key}><input className="field" value={value} onChange={(e) => onChange({...draft,products:draft.products.map((v,index) => index===i?{...v,extra_fields:{...v.extra_fields,[key]:e.target.value}}:v)})} /></Field>)}</div></div>)}</div>
    <Button size="sm" variant="ghost" onClick={() => onChange({...draft,products:[...draft.products,{product_code:'',description:'',boxes:'',extra_fields:{}}]})}><Plus className="h-4 w-4" />Adicionar produto à prévia</Button></details>
    {(draft.warnings.length>0 || errors.length>0) && <ul className="space-y-1 text-xs text-destructive">{[...draft.warnings,...errors].map((w,i) => <li key={i}>{w}</li>)}</ul>}
    {existing && <div className="text-sm space-y-1"><p className="font-semibold">Diferenças da importação</p>{differences.length?differences.map((d,i) => <p key={i} className="break-words text-muted-foreground">{d}</p>):<p className="text-muted-foreground">Nenhuma diferença identificada.</p>}</div>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.reviewed} onChange={(e) => onReview(e.target.checked)} />{existing?'Conferi as diferenças e autorizo atualizar os dados e produtos importados, preservando as etapas e o histórico.':'Conferi os dados, as quantidades e os campos não identificados.'}</label>
  </article>;
}
function CargoDetails({load,busy,onBack,onSave}:{load:CargoLoad;busy:boolean;onBack:()=>void;onSave:(patch:Record<string,unknown>,note:string)=>Promise<void>}) {
  const [edit,setEdit]=useState(false);
  const [general,setGeneral]=useState<Record<string,string>>({});
  const [patch,setPatch]=useState<Record<string,string>>({});
  const [note,setNote]=useState('');
  const [observations,setObservations]=useState(load.notes);
  const {data:history=[],isError} = useQuery({queryKey:['cargo_history',load.household_id,load.id],queryFn:async () => {const {data,error}=await supabase.from('cargo_history').select('*').eq('household_id',load.household_id).eq('load_id',load.id).order('changed_at',{ascending:false});if(error) throw error;return (data??[]) as CargoHistory[];}});
  useEffect(() => {setPatch({});setObservations(load.notes);setGeneral(Object.fromEntries(cargoFields.map(([key]) => [key,String(load[key]??'')])));},[load]);
  function historyValue(field:string,value:Json|null) {
    if(value===null) return '—';
    if(field in stages && typeof value==='string') return stageLabel(field as Stage,value);
    if(field.startsWith('product:') && typeof value==='object' && !Array.isArray(value)) return `${value.product_code ?? ''} · ${value.description ?? ''} · ${value.boxes ?? ''} caixas`;
    return typeof value === 'object' ? 'Carga importada' : String(value);
  }
  return <div className="space-y-5">
    <div className="flex items-center gap-2"><Button size="icon" variant="outline" title="Voltar às cargas" aria-label="Voltar às cargas" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button><div><h2 className="text-xl break-words">Espelho · Carga {load.load_number}</h2><p className="text-sm text-muted-foreground">DT {load.driver_dt??'—'} · {load.destination_name}</p></div></div>
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2"><Pill tone={load.billing_status==='issued'?'success':'muted'}>{stageLabel('billing_status',load.billing_status)}</Pill>{load.billing_issue!=='none' && <Pill tone="accent">{cargoIssueOptions.find(([v])=>v===load.billing_issue)?.[1]}</Pill>}</div>
      <div className="flex flex-wrap gap-2">
        {load.billing_status!=='issued' && load.billing_status!=='cancelled' && <><Button size="sm" disabled={busy} onClick={()=>void onSave({billing_status:'processing',billing_issue:'none'},'Faturamento iniciado')}><FileText className="h-4 w-4" />{load.billing_issue!=='none'?'Retomar faturamento':'Iniciar faturamento'}</Button><Button size="sm" disabled={busy} onClick={()=>{if(window.confirm(`Finalizar faturamento e marcar a nota da carga ${load.load_number} como emitida?`)) void onSave(billingCompletionPatch(),'Faturamento finalizado: nota emitida');}}><Check className="h-4 w-4" />Finalizar faturamento</Button></>}
      </div>
      <Field label="Observações da carga"><textarea className="field min-h-24" value={observations} onChange={e=>setObservations(e.target.value)} /></Field><Button size="sm" variant="outline" disabled={busy||observations===load.notes} onClick={()=>void onSave({notes:observations},'Observações do espelho atualizadas')}>Salvar observações</Button>
    </section>
    <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-lg">Dados gerais</h3><Button size="icon" variant="ghost" title="Editar dados gerais" aria-label="Editar dados gerais" onClick={() => setEdit(!edit)}><Pencil className="h-4 w-4" /></Button></div><div className="grid grid-cols-2 gap-3">{cargoFields.map(([key,label]) => edit?<Field key={key} label={label}><input className="field" type={key==='scheduled_date'?'date':'text'} value={general[key]??''} onChange={(e) => setGeneral({...general,[key]:e.target.value})} /></Field>:<div key={key} className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="break-words text-sm font-medium">{key==='scheduled_date'?dateLabel(load.scheduled_date):load[key]??'—'}</p></div>)}</div>{edit && <Button size="sm" disabled={busy} onClick={() => {if(!general.load_number?.trim() || !general.scheduled_date || (general.pallets && numberValue(general.pallets)===null)) return toast.error('Confira data, carga e pallets.');void onSave({...general,pallets:general.pallets?numberValue(general.pallets):null},note);}}><Check className="h-4 w-4" />Salvar dados</Button>}<p className="text-xs text-muted-foreground">Importada em {timeLabel(load.imported_at)} · Atualizada em {timeLabel(load.updated_at)}</p></section>
    <section className="space-y-3 border-t border-border pt-4"><h3 className="text-lg">Produtos da carga</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2 pr-3">Código</th><th className="pr-3">Descrição</th><th className="text-right">Caixas</th></tr></thead><tbody>{load.cargo_products.map((p) => <tr key={p.id} className="border-t border-border"><td className="py-2 pr-3 align-top">{p.product_code}</td><td className="py-2 pr-3"><p className="break-words">{p.description}</p>{p.extra_fields && typeof p.extra_fields==='object' && !Array.isArray(p.extra_fields) && Object.entries(p.extra_fields).map(([k,v]) => <p key={k} className="text-xs text-muted-foreground">{k}: {String(v)}</p>)}</td><td className="text-right align-top py-2 tabular-nums">{Number(p.boxes).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div><p className="text-sm font-semibold">Total: {load.cargo_products.reduce((sum,p) => sum+Number(p.boxes),0).toLocaleString('pt-BR')} caixas · {load.pallets??'—'} pallets</p></section>
    <section className="space-y-3 border-t border-border pt-4"><h3 className="text-lg">Acompanhamento</h3><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{(Object.keys(stages) as Stage[]).map((key) => <Field key={key} label={stages[key].label}><select className="field" value={patch[key]??load[key]} onChange={(e) => setPatch({...patch,[key]:e.target.value})}>{stages[key].options.map(([v,label]) => <option key={v} value={v}>{label}</option>)}</select></Field>)}</div><Field label="Impedimento no faturamento"><select className="field" value={patch.billing_issue??load.billing_issue} onChange={e=>setPatch({...patch,billing_issue:e.target.value})}>{cargoIssueOptions.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></Field><Field label="Saída da carga"><select className="field" value={patch.departure_confirmed??String(load.departure_confirmed)} onChange={e=>setPatch({...patch,departure_confirmed:e.target.value})}><option value="false">Sem saída</option><option value="true">Com saída</option></select></Field><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void onSave({operational_status:'finished',departure_confirmed:false},'Finalizada sem saída')}>Finalizada sem saída</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void onSave({operational_status:'finished',departure_confirmed:true},'Finalizada com saída')}>Finalizada com saída</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void onSave({print_status:'manual'},'Impressão confirmada; CTe preservado')}>Marcar impressa</Button></div><Field label="Observação da atualização"><textarea className="field" value={note} onChange={(e) => setNote(e.target.value)} /></Field><Button size="sm" disabled={busy || !Object.keys(patch).length} onClick={() => void onSave({...patch,...('departure_confirmed' in patch?{departure_confirmed:patch.departure_confirmed==='true'}:{})},note)}><Check className="h-4 w-4" />Confirmar etapas</Button></section>
    <section className="space-y-3 border-t border-border pt-4"><h3 className="text-lg">Histórico de movimentações</h3>{isError && <p className="text-sm text-destructive">Não consegui carregar o histórico.</p>}{history.map((h) => <div key={h.id} className="border-l-2 border-primary pl-3"><p className="text-sm font-semibold">{h.field==='import'?'Importação':h.field.startsWith('product:')?'Produto atualizado':h.field in stages?stages[h.field as Stage].label:cargoFields.find(([key]) => key===h.field)?.[1]??h.field}</p><p className="text-xs break-words text-muted-foreground">{historyValue(h.field,h.old_value)} → {historyValue(h.field,h.new_value)}</p><p className="text-xs text-muted-foreground">{timeLabel(h.changed_at)} · {h.user_name}</p>{h.note && <p className="text-xs break-words">{h.note}</p>}</div>)}</section>
  </div>;
}