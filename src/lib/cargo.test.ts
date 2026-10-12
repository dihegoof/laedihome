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
  test('recognizes the supplied headerless spreadsheet with wrapped pallets and carrier lines',() => {
    const text = `12/10/2026  5  B0AC  BFBP  Francisco Beltrão  92521  CRYSTAL 1,5L SEM GÁS 06UN  896
8  Ritmo  GCV2E09  106831798
12/10/2026  5  B0AC  BFBP  Francisco Beltrão  92522  CRYSTAL 500ML COM GÁS 12UN  1.344
8  Ritmo  GCV2E09  106831798
12/10/2026  5  B0AC  BFBP  Francisco Beltrão  92527  CRYSTAL 500ML SEM GÁS 12UN  336
2  Ritmo  GCV2E09  106831798
12/10/2026  5  B0AC  BFBP  Francisco Beltrão  92581  CRYSTAL 05L C/2 CP  896
8  Ritmo  GCV2E09  106831798
12/10/2026  15  B0AC  BFCM  CD Bauru  92522  CRYSTAL 500ML COM GÁS 12UN  4.368  26
Ritmo  QOH7691  106832728
12/10/2026  1  B0AC  BAAF  Campo Grande  92521  CRYSTAL 1,5L SEM GÁS 06UN  2.912  26
Ghelere  GHE0D11  106831794`;
    const {loads,unparsed} = parseCargoEmail(text);
    assert.deepEqual(unparsed,[]);
    assert.deepEqual(loads.map((l) => l.load_number),['5','15','1']);
    assert.equal(loads[0].destination_name,'Francisco Beltrão');
    assert.deepEqual(loads[0].products.map((p) => p.boxes),['896','1344','336','896']);
    assert.equal(loads[0].carrier,'Ritmo');
    assert.equal(loads[0].plate,'GCV2E09');
    assert.equal(loads[0].driver_dt,'106831798');
    assert.ok(loads[0].warnings.some((w) => w.includes('Pallets conflitante')));
    assert.equal(loads[1].products[0].boxes,'4368');
    assert.equal(loads[1].pallets,'26');
    assert.equal(loads[2].products[0].boxes,'2912');
    assert.equal(loads[2].carrier,'Ghelere');
    assert.equal(loads[2].plate,'GHE0D11');
    assert.deepEqual(loads.map(validateDraft),[[],[],[]]);
  });
  test('accepts untitled spreadsheet tabs and multiword carrier names',() => {
    const result = parseCargoEmail('12/10/2026\t15\tB0AC\tBFCM\tCD Bauru\t92522\tCRYSTAL 500ML COM GÁS 12UN\t4.368\t26\n\t\t\tRitmo Transportes\tQOH-7691\t106832728');
    assert.equal(result.loads[0].carrier,'Ritmo Transportes');
    assert.equal(result.loads[0].products[0].boxes,'4368');
    assert.deepEqual(result.unparsed,[]);
  });
  test('does not attach a stray carrier line after unrecognized data',() => {
    const result = parseCargoEmail('12/10/2026 15 B0AC BFCM CD Bauru 92522 CRYSTAL 500ML 4368 26\nlinha incompleta\nOutra QOH7691 106832728');
    assert.equal(result.loads[0].carrier,'');
    assert.equal(result.unparsed.length,2);
  });
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
  test('filters CTe independently of invoice status',() => {const issued=saved();const received={...saved(),id:'received',cte_status:'manual'};const result=filterCargos([issued,received],{...emptyFilters,status:'cte_status:waiting'});assert.deepEqual(result.map((l)=>l.id),['one']);});
});