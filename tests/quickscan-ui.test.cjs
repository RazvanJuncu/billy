const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = p => fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const html = read("site/index.html");
const js = read("site/quickscan.js");
const css = read("site/quickscan.css");

function harness() {
  const elements = new Map();
  let cameraOpened = 0;
  const openedFiles = [];
  const shownScreens = [];
  const make = () => ({
    hidden:false,disabled:false,textContent:"",value:"",children:[],
    listeners:{},className:"",
    classList:{toggle(){},remove(){},add(){}},
    addEventListener(type,handler){this.listeners[type]=handler;},
    emit(type,payload){return this.listeners[type]?.(payload||{target:this});},
    append(...nodes){this.children.push(...nodes);},
    appendChild(node){this.children.push(node);},
    replaceChildren(...nodes){this.children=nodes;},
    setAttribute(){},
  });
  const get = id => {
    if (!elements.has(id)) elements.set(id,make());
    return elements.get(id);
  };
  const PDFDocument={
    async create(){
      return {
        async embedJpg(){return {width:100,height:120};},
        async embedPng(){return {width:100,height:120};},
        addPage(){return {drawImage(){}};},
        async copyPages(_,indices){return indices.map(i=>({page:i}));},
        async save(){return new Uint8Array([37,80,68,70,45,49,46,55]);},
      };
    },
    async load(){return {getPageCount(){return 3;}};},
  };
  const window={
    PDFLib:{PDFDocument},
    confirm(){return true;},
    BillyAccounts:{active:()=>true},
    BillyScanner:{startCamera(){cameraOpened++;},editFile(){},close(){}},
    BillyApp:{openFile(file){openedFiles.push(file);},isOnline:()=>false},
    BillySimple:{showScreen(name){shownScreens.push(name);}},
  };
  const context={
    window,document:{
      getElementById:get,
      createElement:make,
      addEventListener(){},
    },
    URL:{createObjectURL:()=> "blob:quickscan-test",revokeObjectURL(){}},
    File:class {
      constructor(parts,name,options){
        this.name=name;this.type=options.type;
        this.size=parts.reduce((total,part)=>total+part.length,0);
      }
    },
    Image:class {},
    Uint8Array,console,
  };
  vm.runInNewContext(js,context,{filename:"site/quickscan.js"});
  return {
    window,get,openedFiles,shownScreens,
    cameraCount:()=>cameraOpened,
  };
}

test("QuickScan is loaded with mobile/desktop layout and import hooks",()=>{
  for(const id of ["quickscanSession","quickscanPages","quickscanAddCamera",
    "quickscanImportInput","quickscanFinish","quickscanCameraImport","quickscanCancel"]){
    assert.match(html,new RegExp('id="'+id+'"'),id);
  }
  assert.match(js,/pdf-lib@1\.17\.1\/dist\/pdf-lib\.min\.js/);
  assert.doesNotMatch(html,/src="https:\/\/cdn\.jsdelivr\.net\/npm\/pdf-lib/);
  assert.ok(html.indexOf('src="./quickscan.js')<html.indexOf('src="./simple.js'));
  assert.ok(html.indexOf('src="./scanner.js')<html.indexOf('src="./quickscan.js'));
  assert.match(css,/#quickscanSession\[hidden\]/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(read("site/sw.js"),/"\.\/quickscan\.js"/);
  assert.match(read("site/sw.js"),/"\.\/quickscan\.css"/);
});

test("QuickScan starts in camera and collects pages without loading each into the app",()=>{
  const h=harness();
  h.window.BillyQuickScan.begin();
  assert.equal(h.cameraCount(),1);
  assert.equal(h.window.BillyQuickScan.isActive(),true);
  assert.equal(h.window.BillyQuickScan.acceptPage({name:"a.jpg",type:"image/jpeg",size:400}),true);
  assert.equal(h.window.BillyQuickScan.acceptPage({name:"b.jpg",type:"image/jpeg",size:500}),true);
  assert.equal(h.window.BillyQuickScan.getCount(),2);
  assert.equal(h.openedFiles.length,0);
  assert.match(h.get("quickscanCount").textContent,/2 pages captured/);
});

test("QuickScan can import PDF pages, reorder them and remove a page",async()=>{
  const h=harness();
  h.window.BillyQuickScan.begin();
  const control=h.get("quickscanImportInput");
  control.files=[{name:"invoice.pdf",type:"application/pdf",size:2000,
    arrayBuffer:async()=>new Uint8Array([37,80,68,70]).buffer}];
  await control.emit("change",{target:control});
  assert.equal(h.window.BillyQuickScan.getCount(),3);
  const first=h.get("quickscanPages").children[0];
  const remove=first.children[2].children[2];
  remove.emit("click");
  assert.equal(h.window.BillyQuickScan.getCount(),2);
  assert.equal(h.get("quickscanFinish").disabled,false);
});

test("QuickScan combines two photos into one PDF instead of making separate drafts",async()=>{
  const h=harness();
  h.window.BillyQuickScan.begin();
  const photo=name=>({name,type:"image/jpeg",size:500,
    arrayBuffer:async()=>new Uint8Array([255,216,0]).buffer});
  h.window.BillyQuickScan.acceptPage(photo("first.jpg"));
  h.window.BillyQuickScan.acceptPage(photo("second.jpg"));
  await h.get("quickscanFinish").emit("click");
  assert.equal(h.openedFiles.length,1);
  assert.match(h.openedFiles[0].name,/^billy-quickscan-\d+\.pdf$/);
  assert.equal(h.openedFiles[0].type,"application/pdf");
  assert.equal(h.window.BillyQuickScan.isActive(),false);
  assert.equal(h.window.BillyQuickScan.getCount(),0);
  assert.deepEqual(h.shownScreens,["type"]);
});

test("A one-page capture remains a single photo without unnecessary PDF conversion",async()=>{
  const h=harness();
  h.window.BillyQuickScan.begin();
  const file={name:"one.jpg",type:"image/jpeg",size:250};
  h.window.BillyQuickScan.acceptPage(file);
  await h.get("quickscanFinish").emit("click");
  assert.equal(h.openedFiles[0],file);
});

test("QuickScan never pretends to upload to company storage",()=>{
  assert.doesNotMatch(js,/\/api\/upload|company_excel|storage\.from\(/);
  assert.match(js,/MAX_DOCUMENT_BYTES = 10 \* 1024 \* 1024/);
  assert.match(js,/MAX_PAGES = 30/);
  assert.match(js,/PDFDocument/);
  assert.match(js,/copyPages/);
  assert.match(js,/revokeObjectURL/);
});
