const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const review=read("site/vision-review.js");
const app=read("site/app.js");
const api=read("api.py");
const collector=read("billy/handwriting_data.py");
const trainer=read("billy/handwriting_train.py");
const worker=read("billy/handwriting_worker.py");
const inference=read("billy/handwriting_inference.py");

test("Submit & Learn is explicit, optional, and always keeps the normal approval",()=>{
  assert.match(review,/handwriting_training_capture_enabled === true/);
  assert.match(review,/Submit & Learn/);
  assert.match(review,/Submit only · don't train/);
  assert.match(review,/api\+"\/api\/vision\/approve"/);
  assert.match(review,/api\+"\/api\/handwriting\/examples"/);
  assert.match(review,/form\.append\("training_consent","true"\)/);
  assert.match(review,/if\(allowTraining && trainingEligible\)/);
  assert.match(review,/Review saved, but handwriting sample collection failed/);
  assert.doesNotMatch(review,/autoTrainNow|training\.start\(/);
});
test("Sample collection is authentication-scoped, source-hash-bound and off by default",()=>{
  assert.match(api,/Depends\(require_member\)/);
  assert.match(api,/async def add_handwriting_examples/);
  assert.match(api,/training_consent: bool = Form\(False\)/);
  assert.match(api,/capture_enabled\(\)/);
  assert.match(collector,/BILLY_HANDWRITING_CAPTURE_ENABLED/);
  assert.match(collector,/stored_hash != source_hash/);
  assert.match(collector,/a\.approved_by=\?/);
  assert.match(collector,/e\.organization_id=\?/);
  assert.match(collector,/before == after/);
  assert.match(collector,/MAX_CROPS_PER_DOCUMENT = 80/);
  assert.doesNotMatch(collector,/eval\(|exec\(/);
});
test("TrOCR training evaluates a document-level holdout and gates deployment",()=>{
  assert.match(trainer,/BASE_MODEL = "microsoft\/trocr-base-handwritten"/);
  assert.match(trainer,/split_by_document/);
  assert.match(trainer,/character_error_rate/);
  assert.match(trainer,/numeric_ok/);
  assert.match(trainer,/better = improvement >= min_improvement and numeric_ok/);
  assert.match(trainer,/if promote and better/);
  assert.match(trainer,/active\.json/);
  assert.match(worker,/BILLY_HANDWRITING_AUTOTRAIN_ENABLED/);
  assert.match(worker,/\.training\.lock/);
  assert.match(worker,/min_new/);
});
test("Pretrained baseline or promoted team checkpoint supplies an optional TrOCR second opinion",()=>{
  assert.match(inference,/BILLY_HANDWRITING_INFERENCE_ENABLED/);
  assert.match(inference,/active_model_path/);
  assert.match(inference,/local_files_only=local_only/);
  assert.match(inference,/DEFAULT_PRETRAINED = "microsoft\/trocr-small-handwritten"/);
  assert.match(inference,/MAX_SECOND_OPINIONS = 12/);
  assert.match(inference,/handwriting_disagreement/);
  assert.doesNotMatch(inference,/setattr\(result,/);
});
