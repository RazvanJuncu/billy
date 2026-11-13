/* Billy extraction profiler. Opt in with ?perf=1; ordinary users see no UI.
   Only transient per-stage duration numbers are kept in this tab. */
(() => {
  "use strict";
  const enabled=(()=>{try{return new URLSearchParams(location.search).get("perf")==="1"}catch{return false}})();
  const history=[];
  let panel=null;
  const round=x=>Number.isFinite(Number(x))?Math.max(0,Math.min(600000,Math.round(Number(x)))):0;
  const fmt=x=>(round(x)/1000).toFixed(2)+"s";
  function box(tag,textValue,styles={}){
    const el=document.createElement(tag);
    if(textValue!=null)el.textContent=String(textValue);
    Object.assign(el.style,styles);
    return el;
  }
  const safe=(value)=>value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  function reportStages(entry){
    const c=safe(entry.client),server=safe(entry.server);
    const s=safe(server.stages_ms);
    const known=[
      ["Authorization (server)",s.authentication_ms],
      ["Read / decode upload",s.file_read_ms],
      ["Parent verification",s.parent_check_ms],
      ["AI classification",s.classification_ms],
      ["Hash",s.hash_ms],
      ["AI extraction",s.extraction_ai_ms],
      ["Parse AI fields",s.parsing_ms],
      ["Checks (parallel wall time)",s.verification_wall_ms],
      ["Validation / normalization",s.validation_ms],
      ["Database write",s.db_write_ms]
    ];
    const recorded=known.reduce((sum,[,ms])=>sum+round(ms),0);
    const serverTotal=round(server.server_total_ms);
    const other=Math.max(0,serverTotal-recorded);
    if(other>15)known.push(["Other server work",other]);
    // Request time includes upload + network + gateway + server. Never
    // mislabel the entire network request as Gemini processing.
    const transit=Math.max(0,round(c.request_ms)-serverTotal);
    const output=[
      ["Browser session headers",c.auth_ms],
      ["PDF preflight",c.preflight_ms],
      ...known,
      ["Transfer / gateway overhead",transit],
      ["Response parsing",c.parse_ms],
      ["Review UI",c.review_ms]
    ].filter(([,ms])=>round(ms)>0);
    return output.map(([label,ms])=>({label,ms:round(ms)}));
  }
  function removePanel(){
    panel?.remove();panel=null;
  }
  function render(){
    if(!enabled||!document.body)return;
    if(!panel){
      panel=box("aside",null,{
        position:"fixed",right:"15px",bottom:"15px",zIndex:"18000",
        width:"min(370px,calc(100vw - 30px))",maxHeight:"min(76dvh,740px)",
        overflowY:"auto",padding:"16px",background:"#181a1c",color:"#f4f4f4",
        border:"1px solid #36393b",borderRadius:"13px",
        fontFamily:"system-ui,-apple-system,sans-serif",
        boxShadow:"0 14px 46px #000a",fontSize:"12px",
        lineHeight:"1.35",fontVariantNumeric:"tabular-nums"
      });
      panel.setAttribute("aria-label","Billy extraction performance diagnostics");
      document.body.append(panel);
    }
    panel.replaceChildren();
    const top=box("div",null,{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px"});
    top.append(box("strong","Billy / Performance",{fontSize:"14px"}));
    const close=box("button","×",{font:"inherit",background:"transparent",
      color:"#ccc",border:"0",cursor:"pointer",fontSize:"20px",padding:"0 3px"});
    close.setAttribute("aria-label","Close diagnostics");
    close.addEventListener("click",removePanel);
    top.append(close);panel.append(top);
    const entry=history[0];
    if(!entry){panel.append(box("p","Process a document to see a breakdown.",{color:"#bbb"}));return;}
    const client=safe(entry.client),server=safe(entry.server);
    panel.append(box("p",entry.outcome+" · total "+fmt(client.total_ms)+" · server "+(server.server_total_ms==null?"not instrumented":fmt(server.server_total_ms)),{
      color:"#c2c5c8",fontSize:"11px",margin:"7px 0 13px"
    }));
    const bars=reportStages(entry);
    const topMs=Math.max(1,...bars.map(x=>x.ms));
    for(const item of bars){
      const row=box("div",null,{margin:"0 0 9px"});
      const head=box("div",null,{display:"flex",justifyContent:"space-between",gap:"8px",marginBottom:"4px"});
      head.append(box("span",item.label,{color:"#dedede"}));
      head.append(box("strong",fmt(item.ms),{whiteSpace:"nowrap"}));
      const track=box("div",null,{height:"5px",borderRadius:"5px",background:"#36383a"});
      const fill=box("div",null,{height:"100%",width:Math.max(1,100*item.ms/topMs)+"%",
        borderRadius:"5px",background:"#f0f0f0"});
      track.append(fill);row.append(head,track);panel.append(row);
    }
    if(!server.server_total_ms){
      panel.append(box("p","Server breakdown unavailable until the updated function is deployed.",
        {color:"#999",fontSize:"11px",marginTop:"12px"}));
    }else{
      const s=safe(server.stages_ms),calls=safe(server.calls);
      const annotations=[
        ["Classifier AI",s.classifier_ai_ms],
        ["Nested geometry AI",s.nested_geometry_ai_ms],
        ["Date visual recheck",s.date_recheck_ms],
        ["Entity verification",s.entity_verification_ms]
      ].filter(([,v])=>round(v)>0).map(([k,v])=>k+" "+fmt(v));
      const callSummary=Object.entries(calls).filter(([,v])=>Number(v)>0)
        .map(([k,v])=>k.replaceAll("_"," ")+": "+Math.min(99,Number(v))).join(" · ");
      if(annotations.length)panel.append(box("p","Includes: "+annotations.join(" · "),
        {color:"#a7a9ab",fontSize:"11px",margin:"13px 0 4px"}));
      if(callSummary)panel.append(box("p",callSummary,
        {color:"#a7a9ab",fontSize:"11px",margin:"4px 0"}));
    }
    panel.append(box("p","Local timing only · AI timings include provider network · no document data stored",
      {fontSize:"10px",color:"#818486",margin:"12px 0 0"}));
  }
  function record(data){
    if(!data||typeof data!=="object")return;
    const entry={
      outcome:typeof data.outcome==="string"?data.outcome.slice(0,30):"complete",
      client:safe(data.client),server:safe(data.server)
    };
    history.unshift(entry);if(history.length>25)history.pop();
    const c=safe(entry.client),s=safe(entry.server);
    console.info("[Billy performance]",entry.outcome,"total",fmt(c.total_ms),
      "server",s.server_total_ms==null?"unknown":fmt(s.server_total_ms),
      "stages (ms)",safe(s.stages_ms));
    if(enabled)render();
  }
  function open(){render();}
  window.BillyPerformance={
    record,open,latest:()=>history[0]||null,
    history:()=>history.slice(),
    breakdown:()=>history[0]?reportStages(history[0]):[]
  };
  if(enabled)document.addEventListener("DOMContentLoaded",render,{once:true});
})();