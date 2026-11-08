const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const html=read("site/index.html");
const simple=read("site/simple.js");
const review=read("site/vision-review.js");
const preview=read("site/excel-preview.js");
const css=read("site/excel-preview.css");
const sw=read("site/sw.js");

test("Approved export shows Excel preview using exactly the same data source as CSV",()=>{
  assert.match(html,/id="simpleExcelPreview"[^>]*hidden/);
  assert.match(html,/Excel Preview|excel-preview\.js\?v=/);
  assert.match(html,/excel-preview\.css\?v=/);
  assert.ok(html.indexOf("vision-review.js")<html.indexOf("excel-preview.js"));
  assert.ok(html.indexOf("excel-preview.js")<html.indexOf("simple.js"));
  assert.match(review,/function getApprovedSpreadsheetData\(\)/);
  assert.match(review,/if\(!approved\|\|!draft\)return null/);
  assert.match(review,/const sheet=getApprovedSpreadsheetData\(\)/);
  assert.match(review,/sheet\.columns\.map\(column=>column\.key\),\.\.\.sheet\.rows/);
  assert.match(review,/getApprovedSpreadsheetData\};/);
  assert.match(simple,/exportable\?window\.BillyReview\?\.getApprovedSpreadsheetData\?\.\(\):null/);
  assert.match(simple,/window\.BillyExcelPreview\?\.render\(\$\("simpleExcelPreview"\),sheet\)/);
  assert.match(html,/Upload to company Excel/);
  assert.match(html,/Not connected/);
  assert.match(sw,/"\.\/excel-preview\.js"/);
  assert.match(sw,/"\.\/excel-preview\.css"/);
  assert.match(sw,/excel-preview\\\.js\|excel-preview\\\.css/);
  assert.doesNotMatch(preview,/fetch\(|XMLHttpRequest|innerHTML/);
  assert.match(css,/overflow:auto/);
});

function node(tag){
  const el={
    tagName:tag.toUpperCase(),className:"",textContent:"",children:[],
    hidden:false,attrs:{},title:"",
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=[...children];},
    setAttribute(name,value){this.attrs[name]=value;},
  };
  el.classList={add(cls){el.className+=" "+cls;}};
  return el;
}
function boot(){
  const window={};
  const document={createElement:tag=>node(tag)};
  vm.runInNewContext(preview,{window,document,console});
  return window.BillyExcelPreview;
}
test("Spreadsheet renders column letters, first-row CSV headers, approved rows, and blanks",()=>{
  const ui=boot(),root=node("section");
  assert.equal(ui.columnLetter(0),"A");
  assert.equal(ui.columnLetter(25),"Z");
  assert.equal(ui.columnLetter(26),"AA");
  assert.equal(ui.columnLetter(51),"AZ");
  const sheet={
    documentType:"fuel_release",
    columns:[
      {key:"release_number",label:"Release #"},
      {key:"aircraft_registration",label:"Registration"},
      {key:"delivered_quantity",label:"Delivered fuel"}
    ],
    rows:[
      ["M 04569","1719P","14"],
      ["M 04569","1719P",null]
    ]
  };
  ui.render(root,sheet);
  assert.equal(root.hidden,false);
  assert.equal(root.children[0].children[0].textContent,"Excel Preview");
  const viewport=root.children[1];
  assert.equal(viewport.attrs.role,"region");
  assert.equal(viewport.tabIndex,0);
  const table=viewport.children[0];
  const letterRow=table.children[1].children[0];
  assert.equal(letterRow.children[1].textContent,"A");
  assert.equal(letterRow.children[2].textContent,"B");
  assert.equal(letterRow.children[3].textContent,"C");
  const tbody=table.children[2];
  assert.equal(tbody.children[0].children[0].textContent,"1");
  assert.equal(tbody.children[0].children[1].textContent,"release_number");
  assert.equal(tbody.children[0].children[3].textContent,"delivered_quantity");
  assert.equal(tbody.children[1].children[0].textContent,"2");
  assert.equal(tbody.children[1].children[1].textContent,"M 04569");
  assert.equal(tbody.children[1].children[3].textContent,"14");
  assert.equal(tbody.children[2].children[0].textContent,"3");
  assert.equal(tbody.children[2].children[3].textContent,"");
  assert.match(tbody.children[2].children[3].className,/excel-preview-blank/);
  ui.render(root,null);
  assert.equal(root.hidden,true);
  assert.equal(root.children.length,0);
});

test("Preview displays untrusted document values as text only",()=>{
  const ui=boot(),root=node("section");
  const payload='<img src=x onerror=alert(1)>';
  ui.render(root,{columns:[{key:"description",label:"Description"}],rows:[[payload]]});
  assert.equal(root.children[1].children[0].children[2].children[1].children[1].textContent,payload);
  assert.doesNotMatch(preview,/innerHTML|insertAdjacentHTML/);
});
