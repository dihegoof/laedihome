/** Product codes above their corresponding pallet codes in the supplied reference. */
const palletCodes: Record<string, string> = {
  '92581': '92601',
  '92536': '92597',
  '92670': '92674',
  '92909': '92909',
  '92521': '92592',
  '92520': '92590',
  '92527': '92596',
  '92522': '92594',
};

export function productBoxesPerPallet(table: Record<string, number>, code: string): number | undefined {
  const normalized = code.trim();
  return table[palletCodes[normalized] ?? normalized];
}