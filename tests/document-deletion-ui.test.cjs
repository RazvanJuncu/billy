const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const read=path=>fs.readFileSync(require("node:path").join(__dirname,"..",path),"utf8");
const simple=read("site/simple.js");
const accounts=read("site/accounts.js");
const css=read("site/simple.css");
const backend=read("supabase/functions/billy-vision/index.ts");

test("Uploaded Documents exposes confirmed, accessible delete actions",()=>{
  assert.match(simple,/function makeDeleteButton\(label,onDelete\)/);
  assert.match(simple,/aria-label","Delete "\+label/);
  assert.match(simple,/window\.confirm\("Remove /);
  assert.match(simple,/window\.confirm\(message\)/);
  assert.match(simple,/method:"POST",[\s\S]*?api\+"\/api\/vision\/delete"/);
  assert.match(simple,/record\.created_by===window\.BillyAccounts\?\.userId\?\.\(\)/);
  assert.match(accounts,/userId:\(\)=>user\?\.id\|\|null/);
  assert.match(css,/\.simple-document-row\{/);
  assert.match(css,/\.simple-document-delete\{/);
  assert.match(backend,/async function deleteRecord\(req,principal\)/);
  assert.match(backend,/created_by:"eq\."\+principal\.user_id/);
  assert.match(backend,/method.*DELETE|database\(principal,"DELETE","document_records"/);
});

function mount(opts={}){
  const elements=new Map(),handlers=new Map();
  const make=(id="")=>{
    const callbacks=new Map();
    const node={
      id,children:[],dataset:{},value:"",textContent:"",hidden:false,disabled:false,
      classList:{toggle:()=>false,add:()=>{},remove:()=>{}},
      addEventListener(event,fn){callbacks.set(event,fn);},
      dispatchEvent(event){callbacks.get(event.type)?.(event);return true;},
      click(){return callbacks.get("click")?.({preventDefault(){}});},
      append(...children){this.children.push(...children);},
      appendChild(child){this.children.push(child);return child;},
      replaceChildren(...children){this.children=[...children];},
      setAttribute(){},getAttribute(){return null},
      querySelector(){return null},
      querySelectorAll(){return []}
    };
    return node;
  };
  const element=id=>{if(!elements.has(id))elements.set(id,make(id));return elements.get(id)};
  const doc={
    body:{dataset:{},classList:{toggle:()=>false,add:()=>{},remove:()=>{}}},
    documentElement:{dataset:{}},
    getElementById:element,
    querySelectorAll:()=>[],
    createElement:tag=>make(tag)
  };
  const confirmations=opts.confirmations||[];
  const calls=[],recordList=opts.records||[];
  const win={
    confirm:()=>confirmations.shift()??true,
    BillyApp:{isOnline:()=>true,visionStatus:()=>({online:true}),openFile:()=>calls.push("reopened")},
    BillyAccounts:{
      active:()=>Boolean(opts.cloud),
      userId:()=>opts.userId||null,
      sessionHeaders:async()=>({Authorization:"Bearer token",apikey:"public"}),
      firstName:()=>"",
    },
    BILLY_AUTH_CONFIG:{apiUrl:"https://synthetic.supabase.co/functions/v1/billy-vision"},
    addEventListener:(event,fn)=>handlers.set(event,fn),
  };
  const fetch=async(url,config={})=>{
    calls.push({url,method:config.method||"GET"});
    if(url.endsWith("/api/vision/records"))return {ok:true,json:async()=>({records:recordList})};
    if(url.endsWith("/api/vision/delete")){
      const id=JSON.parse(config.body).record_id;
      const i=recordList.findIndex(r=>r.id===id);
      if(i>=0)recordList.splice(i,1);
      return {ok:true,json:async()=>({deleted:true})};
    }
    throw Error("Unexpected fetch "+url);
  };
  const sandbox={window:win,document:doc,Event,console,Math,fetch,Date,Blob,URL,setTimeout};
  vm.runInNewContext(simple,sandbox);
  return {element,doc,win,calls,emit:(event,detail)=>handlers.get(event)?.({detail})};
}

test("Removing a session file requires confirmation and never calls cloud deletion",async()=>{
  const app=mount({confirmations:[false,true]});
  const file={name:"scratch-fuel-ticket.jpg"};
  app.emit("billy:document-loaded",{file});
  assert.equal(app.win.BillySimple.getState().sessionFiles,1);
  app.win.BillySimple.showScreen("uploaded");
  let list=app.element("simpleDocumentsList");
  assert.equal(list.children[0].className,"simple-document-row");
  const del=list.children[0].children[1];
  assert.equal(del.textContent,"Delete");
  del.click(); // cancel confirmation
  assert.equal(app.win.BillySimple.getState().sessionFiles,1);
  del.click(); // confirm deletion
  assert.equal(app.win.BillySimple.getState().sessionFiles,0);
  assert.ok(!app.calls.some(c=>typeof c==="object"&&c.method==="POST"));
});

test("Cloud Delete is shown only for the author and refreshes records after success",async()=>{
  const creator="11111111-1111-4111-8111-111111111111";
  const records=[
    {id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",created_by:creator,
      document_type:"invoice",state:"extracted",created_at:"2026-11-07T12:00:00Z"},
    {id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      created_by:"22222222-2222-4222-8222-222222222222",
      document_type:"fuel_release",state:"extracted",created_at:"2026-11-07T12:01:00Z"},
  ];
  const app=mount({cloud:true,userId:creator,records,confirmations:[true]});
  app.win.BillySimple.showScreen("uploaded");
  for(let i=0;i<8;i++)await Promise.resolve();
  const children=app.element("simpleDocumentsList").children;
  const owned=children.find(el=>el.className==="simple-document-row");
  assert.ok(owned);
  assert.equal(owned.children[1].textContent,"Delete");
  assert.ok(children.some(el=>el.disabled===true)); // Other author's item has no Delete.
  await owned.children[1].click();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(records.length,1);
  assert.ok(app.calls.some(c=>typeof c==="object"&&c.method==="POST"&&c.url.endsWith("/api/vision/delete")));
});
