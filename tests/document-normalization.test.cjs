const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const edge=fs.readFileSync(path.join(__dirname,"..","supabase/functions/billy-vision/index.ts"),"utf8");
function normalizer(){
  const a=edge.indexOf("// Billy Normalization Engine 1.0");
  const b=edge.indexOf("function validate(doc,type",a);
  assert.ok(a>0&&b>a,"Normalization engine block exists");
  const sandbox={};
  vm.runInNewContext(edge.slice(a,b)+"\nthis.convert=normalizeDocument;this.number=canonicalNumber;this.currency=canonicalCurrency;this.date=canonicalDate;this.unit=canonicalUnit;this.register=canonicalRegistration;",sandbox);
  return sandbox;
}
const parsed=n=>normalizer().number(n);
test("Amounts: European, US, spacing and ambiguous thousand separators",()=>{
  assert.equal(parsed("1.234,56").value,1234.56);
  assert.equal(parsed("1,234.56").value,1234.56);
  assert.equal(parsed("1 500,00").value,1500);
  assert.equal(parsed("CHF 714.91").value,714.91);
  assert.equal(parsed("0,800").value,0.8);
  assert.equal(parsed("-1.234,56").value,-1234.56);
  assert.equal(parsed("1.234.567").value,1234567);
  assert.equal(parsed("1,500").status,"ambiguous");
  assert.equal(parsed("1.500").status,"ambiguous");
  assert.equal(parsed("12,34,56").status,"invalid");
  assert.equal(parsed("12abc34").status,"invalid");
});
test("Romanian registrations use YR-XXX; foreign registrations are not transformed into Romanian",()=>{
  const c=normalizer();
  for(const text of ["YRWNT","YR WNT","yr-wnt","YR—WNT"])
    assert.equal(c.register(text).value,"YR-WNT",text);
  assert.equal(c.register("YR-NKA").value,"YR-NKA");
  assert.equal(c.register("N722BD").value,"N722BD");
  assert.equal(c.register("D-ABCD").value,"D-ABCD");
  assert.equal(c.register("YRABCD").status,"ambiguous");
  assert.equal(c.register("WNT").value,null,"do not guess the country prefix");
});
test("Currencies are ISO and dates are unambiguous calendar dates",()=>{
  const c=normalizer();
  assert.equal(c.currency("lei").value,"RON");
  assert.equal(c.currency("eur").value,"EUR");
  assert.equal(c.currency("CHF").value,"CHF");
  assert.equal(c.currency("$").status,"ambiguous");
  assert.equal(c.date("10.11.2026").value,"2026-11-10");
  assert.equal(c.date("2026-11-10").value,"2026-11-10");
  assert.equal(c.date("10-Nov-2026").value,"2026-11-10");
  assert.equal(c.date("11/10/2026").status,"ambiguous");
  assert.equal(c.date("29.02.2025").status,"invalid");
});
test("Normalization preserves raw evidence and creates typed inventory values",()=>{
  const c=normalizer();
  const original={supplier_name:"CAT Air Service AG",aircraft_registration:"YRWNT",
    airport_icao:"lszh",currency:"CHF",grand_total:"714,91",
    issue_date:"10.11.2026",lines:[{description:"Travel fare",quantity:"2",
      unit_price:"100,00",net_amount:"200,00",vat_rate:"8,1%",vat_amount:"16,20"}]};
  const saved=JSON.stringify(original);
  const norm=c.convert(original,"invoice","handling_invoice");
  assert.equal(JSON.stringify(original),saved,"must never mutate source strings");
  assert.equal(norm.values.aircraft_registration,"YR-WNT");
  assert.equal(norm.values.airport_icao,"LSZH");
  assert.equal(norm.values.currency,"CHF");
  assert.equal(norm.values.grand_total,714.91);
  assert.equal(norm.values.issue_date,"2026-11-10");
  assert.equal(norm.amounts.grand_total.currency,"CHF");
  assert.equal(norm.line_items[0].values.unit_price.value,100);
  assert.equal(norm.line_items[0].values.vat_rate,8.1);
  assert.equal(norm.fields.grand_total.raw,"714,91");
  assert.equal(norm.status,"ready");
});
test("Fuel quantities convert with explicit units, but mass requires density",()=>{
  const c=normalizer();
  assert.equal(c.unit("litres").value,"L");
  assert.equal(c.unit("gal").status,"ambiguous");
  const fuel={aircraft_registration:"yr-wnt",delivered_quantity:"1500",
    quantity_unit:"Litres",delivery_date:"2026-11-10",fuel_density:"0,800 kg/L"};
  const normalized=c.convert(fuel,"fuel_release","fuel_release");
  assert.equal(normalized.fuel.litres,1500);
  assert.equal(normalized.fuel.kilograms,1200);
  assert.equal(normalized.fuel.metric_tonnes,1.2);
  const noDensity=c.convert({...fuel,fuel_density:"0,800"},"fuel_release","fuel_release");
  assert.equal(noDensity.fuel.litres,1500);
  assert.equal(noDensity.fuel.kilograms,null);
  assert.ok(noDensity.issues.some(i=>i.field_path==="fuel_density"));
  const gallons=c.convert({fuel_quantity:"100",fuel_unit:"US gal"},"invoice","fuel_invoice");
  assert.equal(gallons.fuel.litres,378.541178);
  assert.equal(gallons.fuel.kilograms,null);
  const ambiguous=c.convert({fuel_quantity:"1,500",fuel_unit:"L"},"invoice","fuel_invoice");
  assert.equal(ambiguous.fuel.quantity,null);
  assert.ok(ambiguous.issues.some(i=>i.field_path==="fuel_quantity"));
});
test("Normalization is recalculated after approval and stored as metadata, not OCR overwrite",()=>{
  assert.match(edge,/const normalized=normalizeDocument\(fields,type,profile\)/);
  assert.match(edge,/normalization:\{version:NORMALIZATION_VERSION,extracted:normalized\}/);
  assert.match(edge,/const approvedNormalized=normalizeDocument\(checked,data.document_type/);
  assert.match(edge,/approved:approvedNormalized/);
  assert.match(edge,/normalized_data:approvedNormalized/);
  assert.match(edge,/reviewed_data:checked/);
  assert.match(edge,/extracted_data:fields/);
});
