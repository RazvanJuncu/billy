const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const regions=read("site/vision-regions.js");
const review=read("site/vision-review.js");
const css=read("site/vision-regions.css");
const backend=read("billy/handwriting_inference.py");
const api=read("api.py");
const docs=read("SETUP_WINDOWS.md");

test("Gemini + local pretrained TrOCR readings are visibly compared without overwriting data",()=>{
  assert.match(regions,/AI engine: /);
  assert.match(regions,/TrOCR: /);
  assert.match(regions,/Different readings/);
  assert.match(regions,/Models agree/);
  assert.match(regions,/secondOpinion\?\.status === "processed"/);
  assert.match(regions,/Local TrOCR was unavailable/);
  assert.match(review,/secondOpinion:result\.handwriting_second_opinion/);
  assert.match(css,/review-model-status/);
});
test("Local baseline auto-selects Microsoft TrOCR Small without fine-tuning",()=>{
  assert.match(backend,/DEFAULT_PRETRAINED = "microsoft\/trocr-small-handwritten"/);
  assert.match(backend,/chosen_model\(organization_id\)/);
  assert.match(backend,/if active:/);
  assert.match(backend,/MAX_SECOND_OPINIONS = 12/);
  assert.match(backend,/BILLY_HANDWRITING_INFERENCE_ENABLED/);
  assert.match(backend,/local_files_only=local_only/);
  assert.match(backend,/trust_remote_code=False/);
  assert.match(backend,/torch\.inference_mode\(\)/);
  assert.match(backend,/region\["trocr_reading"\] = reading/);
  assert.match(api,/second_opinion, content, filename/);
  assert.match(api,/result\["handwriting_second_opinion"\]/);
  assert.match(docs,/scripts\.smoke_trocr/);
});
