/* Billy Financial 3B.2 — in-place, operator-reported reconciliation. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const node=(tag,cls,value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=String(value);
    return el;
  };
  const button=(label,cls,fn)=>{
    const b=node("button",cls,label);b.type="button";
    b.addEventListener("click",fn);return b;
  };
  const money=(minor,currency)=>{
    if(!currency||!Number.isSafeInteger(minor))return "–";
    return new Intl.NumberFormat("en-GB",{
      style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2
    }).format(minor/100);
  };
  const labels={bank_transfer:"Bank transfer",cash:"Cash",
    other:"Other method",on_account:"On account · unpaid"};
  const statusLabels={
    unclassified:"Payment method not recorded",
    on_account:"On account · outstanding",
    partial:"Partially covered",
    covered_reported:"Covered · includes operator-reported payments",
    covered_by_confirmed_pos:"Covered by confirmed POS evidence",
    overallocated:"Conflicting evidence · investigate",
    missing_amount:"Verify financial values first"
  };
  const priorities={partial:0,unclassified:1,on_account:2,overallocated:3,
    missing_amount:4,covered_reported:5,covered_by_confirmed_pos:6};
  let editing=null;
  async function apiAction(route,payload){
    if(!window.BillyAccounts?.active?.())throw Error("Sign in to your Billy team first");
    const api=window.BILLY_AUTH_CONFIG?.apiUrl;
    if(!api)throw Error("Financial service is unavailable");
    const headers=await window.BillyAccounts.sessionHeaders();
    const res=await fetch(api+"/api/vision/"+route,{
      method:"POST",cache:"no-store",
      headers:{"Content-Type":"application/json",...headers},
      body:JSON.stringify(payload)
    });
    const json=await res.json();
    if(!res.ok)throw Error(json.detail||"Financial update was rejected");
    return json;
  }
  async function openSource(id,trigger){
    if(!window.BillyAccounts?.active?.())return;
    trigger.disabled=true;
    try{
      const h=await window.BillyAccounts.sessionHeaders();
      const r=await fetch(window.BILLY_AUTH_CONFIG.apiUrl+
        "/api/vision/assistant-source?record_id="+encodeURIComponent(id),
        {headers:h,cache:"no-store"});
      if(!r.ok)throw Error("Source unavailable");
      const data=await r.json();
      if(data.record)window.BillyDocumentPreview?.open?.(data.record);
    }catch(error){trigger.title=error?.message||"Unable to open source";}
    finally{trigger.disabled=false;}
  }
  function render(data,refresh){
    const host=$("billyFinancialReconciliationList");
    if(!host)return;
    host.replaceChildren();
    const rows=Array.isArray(data?.reconciliation)?data.reconciliation:[];
    if(!rows.length){
      host.append(node("p","billy-financial-empty",
        data?"No approved expenses available for reconciliation":"No data loaded"));
      return;
    }
    const ordered=[...rows].sort((a,b)=>(priorities[a.status]??9)-
      (priorities[b.status]??9));
    for(const entry of ordered.slice(0,150)){
      const row=node("div","billy-financial-attention-item billy-financial-reconcile-row");
      const copy=node("div","billy-financial-attention-copy");
      copy.append(node("strong","",entry.vendor||"Expense"));
      copy.append(node("small","",entry.amount_minor===null?
        "Missing amount / currency":
        money(entry.covered_minor,entry.currency)+" covered · "+
        money(entry.remaining_minor,entry.currency)+" remaining"));
      copy.append(node("small","",statusLabels[entry.status]||"Needs review"));
      const actions=node("div","billy-financial-row-actions");
      actions.append(button("Invoice","billy-financial-subtle",
        event=>void openSource(entry.expense_document_id,event.currentTarget)));
      if(entry.can_review&&entry.remaining_minor>0&&
         entry.status!=="overallocated"){
        actions.append(button("Record","billy-financial-subtle",()=>{
          editing=editing===entry.expense_document_id?null:entry.expense_document_id;
          render(data,refresh);
        }));
      }
      row.append(copy,actions);
      if(entry.allocations?.length){
        const history=node("div","billy-financial-reconcile-history");
        for(const item of entry.allocations){
          const itemRow=node("div","billy-financial-reconcile-history-row");
          itemRow.append(node("span","",
            (labels[item.method]||"Reported")+
            (item.method==="on_account"?"":" · "+money(item.amount_minor,item.currency))));
          if(entry.can_review&&item.can_revoke){
            itemRow.append(button("Undo","billy-financial-subtle",async()=>{
              if(!window.confirm("Revoke this reported payment entry? The audit record remains."))return;
              const control=itemRow.querySelector("button");control.disabled=true;
              try{
                const result=await apiAction("financial-allocation-revoke",{allocation_id:item.id});
                if(result.revoked!==true)throw Error("Could not revoke allocation");
                editing=null;await refresh();
              }catch(error){
                itemRow.append(node("small","billy-financial-match-feedback",error.message));
                control.disabled=false;
              }
            }));
          }
          history.append(itemRow);
        }
        row.append(history);
      }
      if(editing===entry.expense_document_id&&entry.can_review){
        const form=node("form","billy-financial-reconcile-form");
        const methodLabel=node("label","");
        methodLabel.append(node("span","","Payment method"));
        const method=node("select","");
        for(const key of ["bank_transfer","cash","on_account","other"]){
          const option=node("option","",labels[key]);option.value=key;
          method.append(option);
        }
        methodLabel.append(method);
        const amountLabel=node("label","");
        amountLabel.append(node("span","","Amount"));
        const amount=node("input","");
        amount.type="text";amount.inputMode="decimal";
        amount.autocomplete="off";amount.value=(entry.remaining_minor/100).toFixed(2);
        amount.setAttribute("aria-label","Amount covered by the reported payment");
        amountLabel.append(amount);
        method.addEventListener("change",()=>{
          amountLabel.hidden=method.value==="on_account";
        });
        const caption=node("p","",
          "Part payments are allowed. These are operator reports, not independent bank confirmations.");
        const feedback=node("p","billy-financial-match-feedback","");
        feedback.setAttribute("role","status");
        const controls=node("div","billy-financial-proposal-actions");
        const save=node("button","billy-financial-match-confirm","Save");
        save.type="submit";
        controls.append(save,button("Cancel","billy-financial-subtle",()=>{
          editing=null;render(data,refresh);
        }));
        form.append(methodLabel,amountLabel,caption,controls,feedback);
        form.addEventListener("submit",async event=>{
          event.preventDefault();
          const normalized=amount.value.trim().replace(",",".");
          const minor=method.value==="on_account"?0:
            /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized)?
              Math.round(Number(normalized)*100):NaN;
          if(!Number.isSafeInteger(minor)||minor<0||
             (method.value!=="on_account"&&minor<=0)||
             minor>entry.remaining_minor){
            feedback.textContent="Enter a valid amount within the remaining balance.";
            return;
          }
          if(!window.confirm(method.value==="on_account"?
            "Mark this invoice as on account? This does NOT mean it was paid.":
            "Record this operator-reported payment? No bank verification is performed."))return;
          save.disabled=true;feedback.textContent="Saving…";
          try{
            const result=await apiAction("financial-allocation",{
              expense_document_id:entry.expense_document_id,
              method:method.value,amount_minor:minor
            });
            if(result.saved!==true)throw Error("Could not save reported payment");
            editing=null;await refresh();
          }catch(error){
            feedback.textContent=error?.message||"Payment report could not be saved";
            save.disabled=false;
          }
        });
        row.append(form);
      }
      host.append(row);
    }
    if(ordered.length>150){
      host.append(node("p","billy-financial-coverage",
        "Only the first 150 records are shown; full-reconciliation coverage is not guaranteed."));
    }
  }
  window.BillyFinancialReconciliation={render};
})();