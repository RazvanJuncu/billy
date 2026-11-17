/* Client-side Piggy HUD PDF export. Reuses the verified HUD response.
   No API requests, exchange-rate conversion or inferred financial values. */
(() => {
  "use strict";
  const CDNS=[
    ["https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.23/pdfmake.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.23/vfs_fonts.min.js"],
    ["https://cdn.jsdelivr.net/npm/pdfmake@0.2.23/build/pdfmake.min.js",
      "https://cdn.jsdelivr.net/npm/pdfmake@0.2.23/build/vfs_fonts.js"]
  ];
  let enginePromise=null;
  const s=x=>x===undefined||x===null?"":String(x);
  const arr=x=>Array.isArray(x)?x:[];
  const n=x=>Number.isSafeInteger(x)?x:0;
  const localized=(lang,ro,en)=>lang==="ro"?ro:en;
  const currency=(minor,code,lang)=>{
    if(!Number.isSafeInteger(minor)||!code)return "—";
    try{return new Intl.NumberFormat(lang==="ro"?"ro-RO":"en-GB",{
      style:"currency",currency:code,minimumFractionDigits:2,
      maximumFractionDigits:2}).format(minor/100);}
    catch{return (minor/100).toFixed(2)+" "+code;}
  };
  const metricValue=(x,code,lang,metric)=>metric==="count"?
    new Intl.NumberFormat(lang==="ro"?"ro-RO":"en-GB").format(n(x)):
    currency(x,code,lang);
  const title=(name,extra="")=>({text:s(name)+(extra?" · "+s(extra):""),
    style:"section",margin:[0,16,0,7]});
  const paragraph=(value,style="note")=>({text:s(value),style,margin:[0,0,0,8]});
  function table(head,entries,widths){
    if(!entries.length)return paragraph("—");
    return {table:{headerRows:1,dontBreakRows:true,widths,
      body:[
        head.map(h=>({text:s(h),style:"tableHead"})),
        ...entries.map((row,i)=>row.map(cell=>({
          ...(cell&&typeof cell==="object"?cell:{text:s(cell)}),
          fillColor:i%2?"#ffffff":"#f5f7f8"
        })))
      ]},
      layout:{
        hLineWidth:i=>i===1?.8:.35,hLineColor:()=>"#dfe4e7",
        vLineWidth:()=>0,paddingTop:()=>6,paddingBottom:()=>6,
        paddingLeft:()=>8,paddingRight:()=>8
      },margin:[0,0,0,10]};
  }
  function summary(out,groups,coverage,lang,legacy){
    const t=(ro,en)=>localized(lang,ro,en);
    if(!groups.length){
      out.push(paragraph(t("Nu există rezultate validate pentru această selecție.",
        "No verified results match this selection.")));
      return;
    }
    out.push(table([t("Monedă","Currency"),t("Total documentat","Documented total"),
      t("Documente","Records")],
      groups.map(g=>[g.currency||"—",currency(g.total_minor,g.currency,lang),
        String(n(legacy?g.documents:g.count))]),["auto","*",70]));
    if(coverage?.partial)out.push(paragraph(t(
      "Total parțial: lipsesc unele date necesare.",
      "Partial total: some required data is unavailable."),"warning"));
    out.push(paragraph(t("Monedele sunt păstrate separat, fără conversii.",
      "Currencies are kept separate, without conversions.")));
  }
  const bar=(value,top)=>({canvas:[
    {type:"rect",x:0,y:0,w:110,h:7,color:"#e1e5e8"},
    {type:"rect",x:0,y:0,w:Math.max(0,110*n(value)/Math.max(1,top)),h:7,
      color:"#6d797f"}
  ]});
  function breakdown(out,items,label,code,metric,lang,showBars){
    const values=arr(items);
    if(!values.length)return;
    const t=(ro,en)=>localized(lang,ro,en);
    out.push(title(label,code));
    const nums=values.map(e=>n(metric==="count"?e.count:e.total_minor));
    const top=Math.max(1,...nums);
    out.push(table(
      [t("Grup","Group"),metric==="count"?t("Număr","Count"):t("Valoare","Amount"),
        ...(showBars?[""]:[])],
      values.map((e,i)=>[
        s(e.label||e.name||t("Neatribuit","Unassigned")),
        metricValue(nums[i],code,lang,metric),
        ...(showBars?[bar(nums[i],top)]:[])
      ]),showBars?["*",115,124]:["*",150]));
  }
  function trend(out,timeline,code,metric,lang){
    const t=(ro,en)=>localized(lang,ro,en),points=arr(timeline);
    out.push(title(t("Evoluție","Trend"),code));
    if(!points.length){out.push(paragraph(t("Nu există puncte pentru grafic.",
      "No dated records available for the chart.")));return;}
    const w=455,h=135,y0=12,y1=125;
    const values=points.map(p=>Math.max(0,n(metric==="count"?p.count:p.total_minor)));
    const top=Math.max(1,...values),coords=values.map((v,i)=>({
      x:5+(points.length===1?.5:i/(points.length-1))*(w-10),
      y:y1-v/top*(y1-y0)
    }));
    const canvas=[
      {type:"line",x1:5,y1:y1,x2:w-5,y2:y1,lineWidth:.75,lineColor:"#ccd3d6"},
      {type:"line",x1:5,y1:y0,x2:w-5,y2:y0,lineWidth:.45,lineColor:"#e4e8eb"}
    ];
    for(let i=1;i<coords.length;i++)canvas.push({
      type:"line",x1:coords[i-1].x,y1:coords[i-1].y,
      x2:coords[i].x,y2:coords[i].y,lineWidth:2,lineColor:"#33434b"
    });
    out.push({canvas,margin:[0,3,0,2]});
    out.push({columns:[
      {text:s(points[0].date),style:"caption"},
      {text:s(points[points.length-1].date),style:"caption",alignment:"right"}
    ],margin:[0,0,0,12]});
    out.push(table([t("Data","Date"),metric==="count"?t("Număr","Count"):
      t("Valoare","Amount")],points.map((p,i)=>[
        s(p.date),metricValue(values[i],code,lang,metric)
      ]),["*",155]));
  }
  function sources(out,result,lang,legacy){
    const t=(ro,en)=>localized(lang,ro,en),docs=arr(result.documents);
    if(!docs.length)return;
    out.push(title(t("Documente justificative","Supporting documents"),
      docs.length+" "+t("afișate","shown")));
    out.push(table([t("Furnizor / Referință","Vendor / Reference"),
      t("Detalii","Details"),t("Sumă","Amount")],
      docs.map(d=>[
        [d.vendor||d.source||t("Neatribuit","Unassigned"),d.reference].filter(Boolean).join(" · "),
        [d.date,d.airport,d.flight_number,d.category,d.card_last4?"•••• "+d.card_last4:null]
          .filter(Boolean).join(" · "),
        currency(d.amount_minor,d.currency,lang)
      ]),["*",156,98]));
    const coverage=result.coverage||{};
    if(n(legacy?coverage.priced_records:coverage.matching_documents)>docs.length)
      out.push(paragraph(t("Lista de surse este un preview. Totalul include și alte înregistrări eligibile.",
        "The source list is a preview. Totals include additional eligible records.")));
  }
  function caveats(out,result,lang){
    const t=(ro,en)=>localized(lang,ro,en);
    const unique=[...new Set(arr(result.notes).filter(x=>typeof x==="string"&&x.trim()))];
    if(!unique.length)unique.push(t(
      "Asocierea completă cu zborurile necesită date operaționale verificate.",
      "Complete flight linking requires verified operational data."));
    out.push(title(t("Surse și limitări","Evidence & limitations")));
    unique.forEach(note=>out.push(paragraph("• "+note)));
  }
  function legacy(out,result,lang){
    const t=(ro,en)=>localized(lang,ro,en),f=result.filter||{},c=result.coverage||{};
    const filters=[f.aircraft_registration,f.flight_number,f.start_date&&(
      f.start_date===f.end_date?f.start_date:f.start_date+" – "+(f.end_date||"")),
      f.expense_category,f.vendor_name].filter(Boolean);
    out.push(title(t("Filtre","Filters")));
    out.push(paragraph(filters.join(" · ")||t("Documente aprobate Billy","Approved Billy documents")));
    out.push(title(t("Rezumat","Summary")));
    const groups=arr(result.groups);
    summary(out,groups,c,lang,true);
    out.push(paragraph(n(c.matched_records)+" "+t("documente asociate","matched records")+
      " · "+n(c.priced_records)+" "+t("cu valoare validată","with verified value")+
      (n(c.duplicate_records_excluded)?" · "+n(c.duplicate_records_excluded)+
        " "+t("duplicate excluse","duplicates excluded"):"")));
    for(const group of groups){
      breakdown(out,group.categories,t("Categorii","Categories"),group.currency,"money",lang,true);
      breakdown(out,group.vendors,t("Furnizori","Vendors"),group.currency,"money",lang,true);
    }
    const ops=result.operations||{};
    const context=[...arr(ops.airports),...arr(ops.flight_numbers)];
    if(context.length){out.push(title(t("Context operațional","Operational context")));
      out.push(paragraph(context.join(" · ")));}
    sources(out,result,lang,true);
    caveats(out,result,lang);
  }
  function analytics(out,result,lang){
    const t=(ro,en)=>localized(lang,ro,en),p=result.plan||{};
    const filter=[p.start_date&&(p.start_date===p.end_date?p.start_date:
      p.start_date+" – "+(p.end_date||"")),p.aircraft,p.flight_number,p.airport,
      p.destination_airport&&t("Destinație ","Destination ")+p.destination_airport,
      p.vendor,p.category,p.card_currency,p.card_last4&&"•••• "+p.card_last4].filter(Boolean);
    out.push(title(t("Filtre","Filters")));
    out.push(paragraph(filter.join(" · ")||t("Fără filtre suplimentare","No additional filters")));
    if(result.blocked){out.push(title(t("Date insuficiente","Insufficient verified data")));
      caveats(out,result,lang);return;}
    const metric=p.metric==="count"?"count":"money",groups=arr(result.groups);
    out.push(title(t("Rezumat","Summary")));
    summary(out,groups,result.coverage,lang,false);
    const dims={vendor:["Furnizori","Vendors"],category:["Categorii","Categories"],
      airport:["Aeroporturi","Airports"],aircraft:["Aeronave","Aircraft"],
      card:["Carduri","Cards"],month:["Luni","Months"],day:["Zile","Days"],
      currency:["Monede","Currencies"],none:["Total","Total"]};
    for(const group of groups){
      if(p.compare_previous&&Number.isSafeInteger(group.previous_total_minor))
        out.push(paragraph(t("Perioada precedentă: ","Previous period: ")+
          currency(group.previous_total_minor,group.currency,lang)+
          (Number.isFinite(group.change_percent)?
            " · "+(group.change_percent>0?"+":"")+group.change_percent.toFixed(2)+"%":"")));
      if(result.visualization==="line")trend(out,group.timeline,group.currency,metric,lang);
      else{
        const dimension=dims[p.group_by]||dims.none;
        breakdown(out,group.breakdown,t(dimension[0],dimension[1]),
          group.currency,metric,lang,result.visualization==="bar");
      }
    }
    sources(out,result,lang,false);
    caveats(out,result,lang);
  }
  function buildDocument(result,question,when=new Date()){
    if(!result?.understood)throw new Error("No verified HUD report available");
    const lang=result.language==="ro"?"ro":"en",t=(ro,en)=>localized(lang,ro,en);
    const heading=result.analytics===true?
      (result.plan?.kind==="card_spending"?t("Cheltuieli pe carduri","Card spending"):
        t("Analiză financiară","Financial analysis")):t("Cheltuieli","Expenses");
    const timestamp=new Intl.DateTimeFormat(lang==="ro"?"ro-RO":"en-GB",{
      dateStyle:"medium",timeStyle:"short"}).format(when);
    const body=[
      {text:"BILLYDPI   /   PIGGYBANK",style:"eyebrow",margin:[0,0,0,7]},
      {text:heading,style:"big",margin:[0,0,0,5]},
      {text:t("Generat la ","Generated ")+timestamp,style:"caption",margin:[0,0,0,16]},
      {text:s(question),style:"question",margin:[0,0,0,13]}
    ];
    if(result.analytics===true)analytics(body,result,lang);
    else legacy(body,result,lang);
    body.push(paragraph(t(
      "Acest raport reflectă datele disponibile în Piggy HUD la momentul exportului. Nu înlocuiește reconcilierea contabilă.",
      "This report reflects the data available in Piggy HUD at export time. It is not an accounting reconciliation.")));
    return {
      pageSize:"A4",pageMargins:[42,48,42,47],
      info:{title:"Piggybank - "+heading,author:"BillyDPI",creator:"BillyDPI"},
      defaultStyle:{font:"Roboto",fontSize:9,lineHeight:1.2,color:"#1d272c"},
      styles:{
        eyebrow:{fontSize:9,bold:true,color:"#718087",characterSpacing:.7},
        big:{fontSize:23,bold:true,color:"#111a1e"},
        section:{fontSize:12,bold:true,color:"#111a1e"},
        question:{fontSize:11,color:"#414d53"},
        caption:{fontSize:8,color:"#757f84"},
        note:{fontSize:8.5,color:"#626e74",lineHeight:1.25},
        warning:{fontSize:9,bold:true,color:"#7c5833"},
        tableHead:{fontSize:8,bold:true,color:"#526169"}
      },
      footer:(page,pages)=>({columns:[
        {text:"BillyDPI  ·  Piggybank",style:"caption"},
        {text:page+" / "+pages,style:"caption",alignment:"right"}
      ],margin:[42,0,42,0]}),
      content:body
    };
  }
  const addScript=url=>new Promise((resolve,reject)=>{
    const node=document.createElement("script");
    node.src=url;node.async=true;node.crossOrigin="anonymous";
    node.referrerPolicy="no-referrer";
    node.onload=resolve;node.onerror=()=>{
      node.remove();reject(new Error("PDF engine could not be loaded"));};
    document.head.appendChild(node);
  });
  async function getEngine(){
    if(window.pdfMake?.createPdf&&window.pdfMake?.vfs)return window.pdfMake;
    if(enginePromise)return enginePromise;
    enginePromise=(async()=>{
      let lastError;
      for(const [core,fonts] of CDNS){
        try{
          if(!window.pdfMake?.createPdf)await addScript(core);
          if(!window.pdfMake?.vfs)await addScript(fonts);
          if(window.pdfMake?.createPdf&&window.pdfMake?.vfs)return window.pdfMake;
        }catch(e){lastError=e;}
      }
      throw lastError||new Error("PDF engine unavailable");
    })().catch(e=>{enginePromise=null;throw e;});
    return enginePromise;
  }
  async function download(result,question){
    if(!result?.understood)throw new Error("No report to export");
    const engine=await getEngine();
    const blob=await new Promise((resolve,reject)=>{
      try{engine.createPdf(buildDocument(result,question)).getBlob(resolve);}
      catch(e){reject(e);}
    });
    if(!blob)throw new Error("PDF generation did not return a file");
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download="Billy-Piggybank-Report-"+
      new Date().toISOString().slice(0,10)+".pdf";
    link.hidden=true;document.body.appendChild(link);
    try{link.click();}finally{
      link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    return link.download;
  }
  window.PiggyPDFExport={buildDocument,download};
})();
