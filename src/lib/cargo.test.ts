import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cargoCsv, cargoDifferences, cargoSummary, emptyFilters, filterCargos, parseCargoEmail, parseDate, validateDraft, type CargoLoad } from './cargo';

const header='Data\tCarga\tOrigem\tCentro\tDestino\tTransportadora\tPlaca\tDT\tPallets\tCódigo\tDescrição\tCaixas';
const row=(cargo='100',code='200',boxes='30',pallets='12') => `12/10/2026\t${cargo}\t1000\t2000\tSão Paulo\tTransportes\tABC1D23\t400\t${pallets}\t${code}\tCoca Cola 2L\t${boxes}`;
function saved():CargoLoad {
  const d=parseCargoEmail(header+'\n'+row()).loads[0];
  return {...d,id:'one',household_id:'home',pallets:12,billing_status:'issued',cte_status:'waiting',print_status:'pending',operational_status:'pending',imported_at:'2026-10-12T12:00:00Z',updated_at:'2026-10-12T12:00:00Z',created_by:null,cargo_products:d.products.map((p) => ({...p,id:p.product_code,load_id:'one',boxes:Number(p.boxes)}))};
}
describe('Cargo import and workflow rules',() => {
  test('imports a single product without inventing values',() => {const result=parseCargoEmail(header+'\n'+row());assert.equal(result.loads.length,1);assert.equal(result.loads[0].products[0].boxes,'30');assert.deepEqual(validateDraft(result.loads[0]),[]);});
  test('groups products and does not sum repeated pallet totals',() => {const result=parseCargoEmail(header+'\n'+row()+'\n'+row('100','201','40'));assert.equal(result.loads.length,1);assert.equal(result.loads[0].products.length,2);assert.equal(result.loads[0].pallets,'12');});
  test('keeps different cargo numbers separate',() => {assert.equal(parseCargoEmail(header+'\n'+row()+'\n'+row('101')).loads.length,2);});
  test('deduplicates identical product rows',() => {assert.equal(parseCargoEmail(header+'\n'+row()+'\n'+row()).loads[0].products.length,1);});
  test('flags conflicting pallet totals without adding them',() => {const d=parseCargoEmail(header+'\n'+row()+'\n'+row('100','201','40','14')).loads[0];assert.ok(d.warnings.some((w) => w.includes('conflitante')));assert.equal(d.pallets,'12');});
  test('rejects missing quantities and impossible dates',() => {const d=parseCargoEmail(header+'\n'+row('100','200','')).loads[0];assert.ok(validateDraft(d).length>0);assert.equal(parseDate('31/02/2026'),'');});
  test('supports irregular whitespace in table rows',() => {const text=header.replaceAll('\t','  ')+'\n'+row().replaceAll('\t','   ');assert.equal(parseCargoEmail(text).loads[0].products.length,1);});
  test('detects new products on reimport without changing workflow',() => {const l=saved();const d=parseCargoEmail(header+'\n'+row()+'\n'+row('100','201','40')).loads[0];assert.ok(cargoDifferences(d,l).some((v) => v.includes('Novo produto: 201')));assert.equal(l.billing_status,'issued');assert.equal(l.cte_status,'waiting');});
  test('issued invoice may still await CTe and printing',() => {const counts=Object.fromEntries(cargoSummary([saved()]));assert.equal(counts['Nota emitida'],1);assert.equal(counts['Aguardando CTe'],1);assert.equal(counts['Aguardando impressão'],1);assert.equal(counts['Finalizadas'],0);});
  test('export includes only matching loads and their products',() => {const one=saved();const two={...saved(),id:'two',load_number:'101',destination_name:'Santos'};const result=filterCargos([one,two],{...emptyFilters,search:'101'});assert.deepEqual(result.map((l) => l.id),['two']);const csv=cargoCsv(result,true);assert.ok(csv.includes('Santos'));assert.ok(!csv.includes('São Paulo'));assert.ok(csv.includes('Coca Cola 2L'));});
  test('CTe, printing and vehicle departure remain independent',() => {const load=saved();const received={...load,cte_status:'manual'};assert.equal(received.billing_status,'issued');assert.equal(received.print_status,'pending');const printed={...received,print_status:'manual'};assert.equal(printed.operational_status,'pending');const departed={...printed,operational_status:'departed'};assert.equal(departed.billing_status,'issued');assert.equal(departed.cte_status,'manual');assert.equal(departed.print_status,'manual');});
});