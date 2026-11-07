const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const get=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const html=get("site/index.html"),accounts=get("site/accounts.js"),app=get("site/app.js");
test("accounts gate is shown before the workspace and fail-closed without config",()=>{
  assert.ok(html.indexOf('id="authGate"')<html.indexOf('id="studioApp"'));
  assert.match(html,/class="auth-locked"/);
  assert.match(accounts,/if\(!ready\|\|!window.supabase\?\.createClient\)/);
  assert.match(accounts,/setAttribute\("inert"/);
  assert.match(get("site/account-config.js"),/sb_publishable_/);
  assert.match(get("site/account-config.js"),/ookafdnvavohfopxfxpf\.supabase\.co/);
});
test("email signup, login, reset and membership owner approval are wired",()=>{
  for(const phrase of ["auth.signUp","auth.signInWithPassword","auth.resetPasswordForEmail",
    "auth.updateUser","auth.signOut","organization_join_requests","organization_memberships","billy:account-ready"]){
    assert.ok(accounts.includes(phrase),phrase);
  }
  assert.match(accounts,/role:"operator"/);
});
test("AI uses the bearer token and active team, not a key in browser",()=>{
  assert.match(accounts,/sessionHeaders:async/);
  assert.match(accounts,/X-Billy-Organization/);
  assert.match(app,/BillyAccounts.sessionHeaders/);
  assert.match(app,/document_type/);
  assert.match(html,/value="fuel_release"/);
});
test("camera, perspective, invoice, fuel release and review preserve source links",()=>{
  for(const name of ["scanOpenCamera","documentType","sourcePreview","scannerOverlay","accountPanel",
    "railCamera","filePicker","accountSubmit"]){
    assert.match(html,new RegExp('id="'+name+'"'));
  }
  assert.match(get("site/vision-review.js"),/handwritten_entries/);
  assert.match(get("site/vision-review.js"),/Submit corrections/);
  assert.match(get("site/sw.js"),/accounts.js/);
});
