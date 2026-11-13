const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","site/piggybank-hud.js"),"utf8");
function mount(){
  class Element{
    constructor(tag){
      this.tag=tag;this.children=[];this.attributes={};this.handlers={};
      this.style={};this.textContent="";this.hidden=true;this.scrollTop=0;
      const set=new Set();
      this.classList={add:key=>set.add(key),remove:key=>set.delete(key),contains:key=>set.has(key)};
    }
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(...nodes){this.children=nodes}
    setAttribute(key,value){this.attributes[key]=value}
    addEventListener(key,handler){this.handlers[key]=handler}
    click(){this.handlers.click?.({target:this})}
    querySelector(q){return q===".piggybank-hud-kicker"?headingKicker:null}
  }
  const ids=Object.fromEntries([
    "piggybankHud","piggybankHudBackdrop","piggybankHudClose",
    "piggybankHudTitle","piggybankHudContent","billyAssistantInput",
    "billyAssistantPanel"].map(id=>[id,new Element("div")]));
  const headingKicker=new Element("span");
  const body=new Element("body");
  let opened=[];
  const win={BillyIntelligenceAssistant:{openSource:(id)=>{opened.push(id)}}};
  const document={
    getElementById:id=>ids[id]||null,
    createElement:tag=>new Element(tag),
    createTextNode:value=>{const e=new Element("text");e.textContent=value;return e;},
    createDocumentFragment:()=>new Element("fragment"),
    body
  };
  const sandbox={document,window:win,MutationObserver:class{observe(){}},Intl,Number};
  vm.runInNewContext(source,sandbox,{filename:"piggybank-hud.js"});
  return {ids,body,win,opened,Element};
}
function allText(el){
  if(!el)return "";
  return [el.textContent||"",...(el.children||[]).map(allText)].join(" ");
}
function find(el,pred){
  if(!el)return null;
  if(pred(el))return el;
  for(const child of el.children||[]){
    const found=find(child,pred);
    if(found)return found;
  }
  return null;
}
const answer={
  understood:true,language:"en",
  filter:{intent:"costs",aircraft_registration:"YR-WNT"},
  groups:[
    {currency:"EUR",total_minor:27893,documents:1,
      categories:[{name:"handling",total_minor:27893,documents:1}],
      vendors:[{name:"Handler A",total_minor:27893,documents:1}]},
    {currency:"USD",total_minor:12900,documents:1,
      categories:[{name:"fuel",total_minor:12900,documents:1}],
      vendors:[{name:"Fuel Provider",total_minor:12900,documents:1}]}
  ],
  coverage:{matched_records:3,priced_records:2,without_valid_amount:1,
    duplicate_records_excluded:0,skylegs_connected:false,mission_verified:false},
  operations:{airports:["LSZH"],flight_numbers:["MYJ832"]},
  documents:[{id:"source-1",vendor:"Handler A",reference:"INV-01",date:"2026-11-12",
    category:"handling",airport:"LSZH",amount_minor:27893,currency:"EUR"}],
  notes:["Skylegs is not connected yet; mission totals cannot be verified."]
};
test("Finance HUD shows independently calculated per-currency totals and document evidence",()=>{
  const {ids,body,win}=mount();
  assert.equal(win.PiggybankHUD.active(),false);
  assert.equal(win.PiggybankHUD.show(answer,"How much did YR-WNT cost?"),true);
  assert.equal(ids.piggybankHud.hidden,false);
  assert.equal(ids.piggybankHudBackdrop.hidden,false);
  assert.equal(body.classList.contains("piggybank-hud-active"),true);
  const rendered=allText(ids.piggybankHudContent);
  assert.match(rendered,/How much did YR-WNT cost\?/);
  assert.match(rendered,/€278\.93/);
  assert.match(rendered,/\$129\.00/);
  assert.match(rendered,/handling/);
  assert.match(rendered,/Fuel Provider/);
  assert.match(rendered,/INV-01/);
  assert.match(rendered,/Skylegs is not connected/);
  assert.doesNotMatch(rendered,/€407\.93/,"EUR and USD must not be silently added");
});
test("Clicking an evidence source closes HUD and hands off to authorized preview",()=>{
  const {ids,win,opened}=mount();
  win.PiggybankHUD.show(answer,"Expenses?");
  const btn=find(ids.piggybankHudContent,el=>el.tag==="button"&&
    el.textContent==="Open");
  assert.ok(btn,"Source preview button is present");
  btn.click();
  assert.equal(win.PiggybankHUD.active(),false);
  assert.deepEqual(opened,["source-1"]);
});
test("Backdrop and close controls dismiss HUD without destroying the chat",()=>{
  const {ids,body,win}=mount();
  win.PiggybankHUD.show(answer,"Expenses?");
  ids.piggybankHudBackdrop.click();
  assert.equal(win.PiggybankHUD.active(),false);
  assert.equal(body.classList.contains("piggybank-hud-active"),false);
  win.PiggybankHUD.show(answer,"Expenses?");
  ids.piggybankHudClose.click();
  assert.equal(ids.piggybankHud.hidden,true);
  assert.equal(ids.piggybankHudBackdrop.hidden,true);
});
