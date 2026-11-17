const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const personaSource=read("site/piggy-persona.js");
const client=read("site/intelligence-assistant.js");
const html=read("site/index.html");
const css=read("site/intelligence-assistant.css");
const sw=read("site/sw.js");
function loadPersona(){
  const sandbox={window:{}};
  vm.runInNewContext(personaSource,sandbox,{filename:"piggy-persona.js"});
  return sandbox.window.PiggyPersona;
}
test("Piggy speaks in natural, distinct Romanian and English pig-related voices",()=>{
  const pig=loadPersona();
  assert.equal(pig.defaultLanguage("ro-RO"),"ro");
  assert.equal(pig.defaultLanguage("en-US"),"en");
  assert.equal(pig.detect("Acum arată-mi evoluția pe zile.","en"),"ro");
  assert.equal(pig.detect("Show me the spending by card.","ro"),"en");
  assert.equal(pig.detect("Cheltuieli pe furnizori.","en"),"ro");
  assert.equal(pig.detect("Care sunt facturile noastre?","en"),"ro");
  assert.match(pig.get("welcomeTitle","en"),/ears/i);
  assert.match(pig.get("welcomeSubtitle","en"),/snout/i);
  assert.match(pig.get("welcomeSubtitle","ro"),/rât/i);
  assert.match(pig.get("input","ro"),/Piggy/);
  for(const language of ["en","ro"]){
    for(const line of ["hello","loading","report","answer"]){
      const first=pig.next(line,language);
      const second=pig.next(line,language);
      assert.ok(first.length>12);
      assert.notEqual(first,second,line+" in "+language+" does not rotate");
    }
    assert.ok(pig.get("blocked",language).length>15);
    assert.ok(pig.get("hudUnavailable",language).length>15);
  }
});
test("Piggy handles casual greetings locally without mistaking real financial questions",()=>{
  const pig=loadPersona();
  for(const txt of ["Hi!","Hey Piggy","Hello","Oink!","Salut, Piggy!","Bună","Groh-groh"])
    assert.equal(pig.isGreeting(txt),true,txt);
  for(const txt of ["How much was spent?","Câți bani am cheltuit?","Show spending by card",
    "Piggy, show expenses","Acum pe furnizori"])
    assert.equal(pig.isGreeting(txt),false,txt);
});
test("Starter and contextual suggestions always have real bilingual requests",()=>{
  const pig=loadPersona();
  for(const lang of ["en","ro"]){
    const prompts=pig.prompts(lang);
    assert.equal(prompts.length,2);
    for(const item of prompts){
      assert.ok(item.label.length>4);
      assert.ok(item.question.length>15);
      assert.equal(pig.detect(item.question,lang),lang);
    }
    const active={analytics:true,blocked:false,plan:{
      group_by:"vendor",start_date:"2026-10-19",end_date:"2026-11-17",
      compare_previous:false
    }};
    const actions=pig.followups(active,lang);
    assert.equal(actions.length,2);
    assert.match(actions[0].question,lang==="ro"?/evoluția pe zile/:/daily trend/);
    assert.match(actions[1].question,lang==="ro"?/perioada precedentă/:/previous period/);
    const grouped=pig.followups({...active,plan:{...active.plan,group_by:"day"}},lang);
    assert.match(grouped[0].question,lang==="ro"?/furnizori/:/vendor/);
    assert.equal(pig.followups({...active,blocked:true},lang).length,0);
    assert.equal(pig.followups({...active,plan:{...active.plan,start_date:null}},lang).length,1);
  }
});

class El{
  constructor(tag="div",cls=""){
    this.tag=tag;this.className=cls;this.children=[];this.attributes={};
    this.textContent="";this.handlers={};this.hidden=false;this.style={};
    const classes=new Set(cls.split(/\s+/).filter(Boolean));
    this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),
      contains:name=>classes.has(name)};
  }
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(event,fn){this.handlers[event]=fn;}
  focus(){}
  contains(){return false;}
  closest(){return null;}
  querySelector(selector){
    if(selector==="strong")return this.children.find(c=>c.tag==="strong")||null;
    if(selector==="span")return this.children.find(c=>c.tag==="span")||null;
    const name=selector.startsWith(".")?selector.slice(1):selector;
    if(this.className.split(/\s+/).includes(name))return this;
    for(const child of this.children){
      const match=child?.querySelector?.(selector);if(match)return match;
    }
    return null;
  }
}
function app(language){
  const nodes={};
  for(const id of ["billyAssistantLaunch","billyAssistantPanel","billyAssistantDock",
    "billyAssistantForm","billyAssistantInput","billyAssistantFeed",
    "billyAssistantClose","billyAssistantStatus","billyAssistantSend",
    "billyAssistantSuggestions"])nodes[id]=new El("div");
  const title=new El("strong"),subtitle=new El("span");
  const welcome=new El("div","billy-ai-welcome");
  welcome.append(title,subtitle,nodes.billyAssistantSuggestions);
  nodes.billyAssistantPanel.append(welcome);
  nodes.billyAssistantFeed.append(welcome);
  let fetchCalls=0;
  const hud={show:()=>true,hide:()=>{},active:()=>false};
  const win={BillyAccounts:{active:()=>true,sessionHeaders:async()=>({Authorization:"mock"})},
    BILLY_AUTH_CONFIG:{apiUrl:"/local"},PiggybankHUD:hud,
    addEventListener:()=>{}};
  const doc={getElementById:id=>nodes[id]||null,
    createElement:tag=>new El(tag),
    addEventListener:()=>{},body:{dataset:{billyScreen:"home"}}};
  const context={window:win,document:doc,navigator:{language},
    MutationObserver:class{observe(){}},
    Intl,Number,JSON,console,
    fetch:async url=>{
      fetchCalls++;
      if(!String(url).endsWith("/api/vision/analytics"))throw Error("Unexpected legacy API call");
      return {ok:true,json:async()=>({understood:true,analytics:true,language:"ro",
        blocked:false,plan:{group_by:"vendor",start_date:"2026-11-11",
          end_date:"2026-11-17",compare_previous:false},
        groups:[],coverage:{matching_documents:0},documents:[],notes:[]})};
    }};
  vm.runInNewContext(personaSource,context);
  vm.runInNewContext(client,context);
  return {nodes,title,subtitle,win,welcome,get fetchCalls(){return fetchCalls}};
}
test("Real chat UI localizes welcome, replies to hello without APIs and renders real prompt chips",async()=>{
  const en=app("en-US");
  assert.match(en.title.textContent,/ears/);
  assert.match(en.subtitle.textContent,/snout/);
  assert.equal(en.nodes.billyAssistantSuggestions.children.length,2);
  assert.equal(en.nodes.billyAssistantInput.placeholder,"Ask Piggy anything…");
  await en.win.Piggybank.ask("Hi Piggy");
  assert.equal(en.fetchCalls,0);
  assert.equal(en.welcome.hidden,true);
  assert.ok(en.nodes.billyAssistantFeed.children.length>=3);
  const ro=app("ro-RO");
  assert.match(ro.title.textContent,/urechi/);
  assert.match(ro.subtitle.textContent,/rât/);
  await ro.win.Piggybank.ask("Salut, Piggy!");
  assert.equal(ro.fetchCalls,0);
  assert.match(ro.nodes.billyAssistantFeed.children.at(-1).children[0].textContent,/Groh|Oink/);
});
test("Chat reports use Piggy's voice but keep source-backed HUD results and clickable follow-ups",async()=>{
  const a=app("en-US");
  await a.win.Piggybank.ask("Grupează cheltuielile pe furnizori în ultimele 7 zile.");
  assert.equal(a.fetchCalls,1);
  const message=a.nodes.billyAssistantFeed.children.at(-1);
  const notice=message.children[0];
  const text=notice.children[0].textContent;
  assert.match(text,/rât|Groh|Oink|scormonit/);
  assert.match(text,/HUD/);
  const buttons=notice.children.filter(c=>c.tag==="button");
  assert.equal(buttons.length,1);
  const actions=notice.children.find(c=>c.className==="billy-ai-quick-actions");
  assert.ok(actions);
  assert.equal(actions.children.length,2);
  assert.match(actions.children[0].textContent,/Pe zile/);
  assert.equal(typeof actions.children[0].handlers.click,"function");
  assert.equal(a.nodes.billyAssistantPanel.classList.contains("is-sniffing"),false);
});
test("Persona stays inside chat; HUD calculations and evidence remain untouched",()=>{
  assert.doesNotMatch(read("site/piggy-analytics-hud.js"),/PiggyPersona|Oink!|Groh-groh!/);
  assert.doesNotMatch(read("site/piggybank-hud.js"),/PiggyPersona|Oink!|Groh-groh!/);
  assert.doesNotMatch(read("supabase/functions/billy-vision/index.ts"),/PiggyPersona|Groh-groh!/);
  assert.match(client,/const piggy=window\.PiggyPersona/);
  assert.match(client,/result\.blocked\?piggyCopy\("blocked"/);
  assert.match(client,/panel\.classList\.add\("is-sniffing"\)/);
  assert.match(client,/panel\.classList\.remove\("is-sniffing"\)/);
  assert.match(html,/piggy-persona\.js\?v=1\.0\.0/);
  assert.match(html,/intelligence-assistant\.js\?v=0\.5\.0/);
  assert.match(html,/intelligence-assistant\.css\?v=0\.5\.0/);
  assert.match(css,/@keyframes billy-piggy-snuffle/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(sw,/v125-piggy-personality/);
  assert.match(sw,/\.\/piggy-persona\.js/);
  assert.doesNotMatch(personaSource,/\.innerHTML\s*=|localStorage|sessionStorage|fetch\(/);
});
