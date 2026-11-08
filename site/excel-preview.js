/* Read-only spreadsheet preview for approved CSV exports. No external Excel write. */
(() => {
  "use strict";
  const make=(tag,cls,text)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  function columnLetter(index){
    let n=index+1, letters="";
    while(n>0){n--;letters=String.fromCharCode(65+n%26)+letters;n=Math.floor(n/26);}
    return letters;
  }
  function render(container,sheet){
    if(!container)return;
    container.replaceChildren();
    if(!sheet||!Array.isArray(sheet.columns)||!sheet.columns.length||
       !Array.isArray(sheet.rows)){
      container.hidden=true;
      return;
    }
    container.hidden=false;
    const heading=make("div","excel-preview-heading");
    const title=make("h3","excel-preview-title","Excel Preview");
    const subtitle=make("p","excel-preview-subtitle",
      "Approved values · Same column order and rows as Export CSV");
    heading.append(title,subtitle);
    container.append(heading);
    const viewport=make("div","excel-preview-scroll");
    viewport.tabIndex=0;
    viewport.setAttribute("role","region");
    viewport.setAttribute("aria-label","Excel-compatible approved document preview, scroll horizontally");
    const table=make("table","excel-preview-table");
    const caption=make("caption","excel-preview-caption",
      "Approved values arranged as an Excel-compatible CSV spreadsheet");
    table.append(caption);
    const thead=make("thead");
    const top=make("tr");
    const corner=make("th","excel-preview-row-number excel-preview-corner","");
    corner.scope="col";
    top.append(corner);
    sheet.columns.forEach((col,i)=>{
      const th=make("th","excel-preview-column-letter",columnLetter(i));
      th.scope="col";
      th.title=col.label||col.key;
      top.append(th);
    });
    thead.append(top);
    table.append(thead);
    const tbody=make("tbody");
    const headerRow=make("tr","excel-preview-header-row");
    const headerNumber=make("th","excel-preview-row-number","1");
    headerNumber.scope="row";
    headerRow.append(headerNumber);
    sheet.columns.forEach(col=>{
      const th=make("th","excel-preview-field-name",String(col.key||""));
      th.scope="col";
      th.title=col.label||col.key||"";
      headerRow.append(th);
    });
    tbody.append(headerRow);
    sheet.rows.forEach((row,index)=>{
      const tr=make("tr");
      const count=make("th","excel-preview-row-number",String(index+2));
      count.scope="row";
      tr.append(count);
      sheet.columns.forEach((col,colIndex)=>{
        const value=row?.[colIndex];
        const cell=make("td","excel-preview-data-cell",value==null?"":String(value));
        if(value!==null&&value!==undefined)cell.title=String(value);
        if(value===null||value===undefined||value==="")cell.classList.add("excel-preview-blank");
        tr.append(cell);
      });
      tbody.append(tr);
    });
    table.append(tbody);
    viewport.append(table);
    container.append(viewport);
  }
  window.BillyExcelPreview={render,columnLetter};
})();
