/* Billy approved-data preview: document details ONCE, followed by item rows.
   Text-only DOM rendering; never interpret content extracted from documents as HTML. */
(() => {
  "use strict";
  const make=(tag,cls,text)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  function display(value){return value===null||value===undefined?"":String(value);}
  function renderTable(parent,{title,columns,rows,kind}){
    const section=make("section","excel-preview-section excel-preview-"+kind);
    const heading=make("div","excel-preview-section-heading");
    heading.append(make("h4","excel-preview-section-title",title));
    if(kind==="entries")heading.append(make("span","excel-preview-section-count",
      rows.length+" "+(rows.length===1?"entry":"entries")));
    section.append(heading);
    const viewport=make("div","excel-preview-scroll excel-preview-"+kind+"-scroll");
    viewport.tabIndex=0;
    viewport.setAttribute("role","region");
    viewport.setAttribute("aria-label",title+" table; scroll to inspect all fields");
    const table=make("table","excel-preview-table");
    table.append(make("caption","excel-preview-caption",title));
    const head=make("thead"),headRow=make("tr");
    columns.forEach(column=>{
      const th=make("th","excel-preview-field-name",column.label||column.key);
      th.scope="col";
      headRow.append(th);
    });
    head.append(headRow);table.append(head);
    const body=make("tbody");
    rows.forEach(row=>{
      const tr=make("tr");
      columns.forEach((column,i)=>{
        const val=display(row?.[i]);
        const cell=make("td","excel-preview-data-cell",val);
        if(!val)cell.classList.add("excel-preview-blank");
        else cell.title=val;
        tr.append(cell);
      });
      body.append(tr);
    });
    table.append(body);viewport.append(table);section.append(viewport);
    parent.append(section);
  }
  function render(container,sheet){
    if(!container)return;
    container.replaceChildren();
    if(!sheet||!Array.isArray(sheet.details)||!sheet.entries||
       !Array.isArray(sheet.entries.columns)||!Array.isArray(sheet.entries.rows)){
      container.hidden=true;return;
    }
    container.hidden=false;
    const heading=make("div","excel-preview-heading");
    heading.append(
      make("h3","excel-preview-title","Excel Preview"),
      make("p","excel-preview-subtitle","Document details once · Individual entries below")
    );
    container.append(heading);
    renderTable(container,{
      title:"Document details",kind:"details",
      columns:[{key:"label",label:"Field"},{key:"value",label:"Value"}],
      rows:sheet.details.map(field=>[field.label,field.value])
    });
    if(sheet.entries.rows.length){
      renderTable(container,{
        title:sheet.entries.title,kind:"entries",
        columns:sheet.entries.columns,rows:sheet.entries.rows
      });
    }
  }
  window.BillyExcelPreview={render};
})();
