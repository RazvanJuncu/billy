/* Billy Financial Payments 2.0 — source-grounded no-slip classification workflow. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const make=(tag,cls,value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=String(value);
    return el;
  };
  const button=(label,cls,fn)=>{
    const el=make("button",cls,label);el.type="button";
    el.addEventListener("click",fn);return el;
  };
  const money=(minor,currency)=>{
    if(!currency||!Number.isSafeInteger(minor))return "–";
    return new Intl.NumberFormat("en-GB",{
      style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2
    }).format(minor/100);
  };
  const methods={
    bank_transfer:"Bank transfer",cash:"Cash",on_account:"On account · unpaid",
    other:"Another way"
  };
  let editingId=null,activeData=null,activeRefresh=null;
  function groups(data){
    const noSlip=[],paidOnBill=[],classified=[];
    const entries=Array.isArray(data?.reconciliation)?data.reconciliation:[];
    for(const entry of entries){
      // An approved bill remains an expense regardless of payment evidence.
      // POS-covered bills belong in the linked-evidence panel.
      if(Number(entry.proof_minor||0)>0)continue;
      const allocations=Array.isArray(entry.allocations)?entry.allocations:[];
      if(allocations.length)classified.push(entry);
      else if(entry.bill_card_evidence===true)paidOnBill.push(entry);
      else noSlip.push(entry);
    }
    const order=(a,b)=>String(b.date||"").localeCompare(String(a.date||""))||
      String(a.vendor||"").localeCompare(String(b.vendor||""));
    for(const arr of [noSlip,paidOnBill,classified])arr.sort(order);
    return {noSlip,paidOnBill,classified};
  }
  async function apiAction(route,payload){
    if(!window.BillyAccounts?.active?.())throw Error("Sign in to your Billy team");
    const api=window.BILLY_AUTH_CONFIG?.apiUrl;
    if(!api)throw Error("Financial service unavailable");
    const headers=await window.BillyAccounts.sessionHeaders();
    const res=await fetch(api+"/api/vision/"+route,{
      method:"POST",cache:"no-store",
      headers:{"Content-Type":"application/json",...headers},
      body:JSON.stringify(payload)
    });
    let result={};
    try{result=await res.json();}catch{}
    if(!res.ok)throw Error(result.detail||"Financial update rejected");
    return result;
  }
  async function openSource(id,trigger){
    if(!window.BillyAccounts?.active?.())return;
    trigger.disabled=true;
    try{
      const headers=await window.BillyAccounts.sessionHeaders();
      const api=window.BILLY_AUTH_CONFIG?.apiUrl;
      if(!api)throw Error("Financial service unavailable");
      const response=await fetch(api+"/api/vision/assistant-source?record_id="+
        encodeURIComponent(id),{headers,cache:"no-store"});
      if(!response.ok)throw Error("Source unavailable");
      const result=await response.json();
      if(result.record)window.BillyDocumentPreview?.open?.(result.record);
    }catch(err){trigger.title=err?.message||"Source unavailable";}
    finally{trigger.disabled=false;}
  }
  async function save(method,minor,entry,submit,feedback){
    const onAccount=method==="on_account";
    if(!Number.isSafeInteger(minor)||minor<0||
       (!onAccount&&minor===0)||(onAccount&&minor!==0)||
       (entry.remaining_minor!==null&&minor>entry.remaining_minor)){
      feedback.textContent="Amount must fit the remaining invoice balance.";return;
    }
    const confirmed=window.confirm(onAccount?
      "Classify this invoice as ON ACCOUNT? No payment will be marked as received.":
      "Record "+money(minor,entry.currency)+" as "+methods[method]+
      "? This is an operator report, NOT bank verification.");
    if(!confirmed)return;
    submit.disabled=true;feedback.textContent="Saving…";
    try{
      const response=await apiAction("financial-allocation",{
        expense_document_id:entry.expense_document_id,method,amount_minor:minor
      });
      if(response.saved!==true)throw Error("Could not save the classification");
      editingId=null;await activeRefresh?.();
    }catch(err){feedback.textContent=err?.message||"Save failed";submit.disabled=false;}
  }
  function editor(entry){
    const form=make("form","billy-payments-method-editor");
    const methodWrap=make("label","","Payment method");
    const method=make("select","");
    method.setAttribute("aria-label","Payment method");
    for(const [name,label] of Object.entries(methods)){
      const opt=make("option","",label);opt.value=name;method.append(opt);
    }
    method.value="bank_transfer";methodWrap.append(method);
    const amountWrap=make("label","","Amount to classify");
    const amount=make("input","");
    amount.type="text";amount.inputMode="decimal";amount.autocomplete="off";
    amount.setAttribute("aria-label","Amount to classify");
    amount.value=entry.remaining_minor===null?"":(entry.remaining_minor/100).toFixed(2);
    amountWrap.append(amount);
    const note=make("small","billy-payments-editor-note",
      "Split payments are supported. On account remains unpaid.");
    const actions=make("div","billy-payments-editor-actions");
    const saveButton=make("button","billy-financial-match-confirm","Save");
    saveButton.type="submit";
    actions.append(saveButton,button("Cancel","billy-financial-subtle",()=>{
      editingId=null;render(activeData,activeRefresh);
    }));
    const feedback=make("p","billy-payments-inline-feedback","");
    feedback.setAttribute("role","status");
    method.addEventListener("change",()=>{
      amountWrap.hidden=method.value==="on_account";
    });
    form.append(methodWrap,amountWrap,note,actions,feedback);
    form.addEventListener("submit",event=>{
      event.preventDefault();
      const raw=amount.value.trim().replace(",",".");
      const minor=method.value==="on_account"?0:
        /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(raw)?
          Math.round(Number(raw)*100):NaN;
      void savePayment(minor);
    });
    async function savePayment(minor){
      await save(method.value,minor,entry,saveButton,feedback);
    }
    return form;
  }
  function row(entry,kind){
    const el=make("div","billy-payments-bill-row");
    const copy=make("div","billy-payments-bill-ident");
    const upper=make("div","billy-payments-bill-title");
    const pill=make("span","billy-payments-proof-pill",
      kind==="paid_on_bill"?"CARD ON BILL":
      kind==="classified"?"CLASSIFIED":"NO SLIP");
    const title=button(entry.vendor||"Unassigned","billy-payments-vendor",
      event=>void openSource(entry.expense_document_id,event.currentTarget));
    upper.append(pill,title);
    const information=[
      String(entry.profile||"Expense").replaceAll("_"," "),
      entry.date||"Date not available"
    ];
    if(kind==="paid_on_bill")
      information.push(entry.bill_card_last4?"Card •••• "+entry.bill_card_last4:"Card number unknown");
    if(kind==="classified"&&entry.on_account)
      information.push("On account · outstanding");
    copy.append(upper,make("small","",information.join(" · ")));
    const amount=make("div","billy-payments-bill-amount",
      entry.amount_minor===null?"Amount needed":money(entry.amount_minor,entry.currency));
    if(kind==="classified"&&entry.remaining_minor!==null)
      amount.append(make("small","",
        money(entry.remaining_minor,entry.currency)+" outstanding"));
    if(kind==="no_slip"&&entry.status==="missing_amount")
      amount.append(make("small","","Verify amount first"));
    const actions=make("div","billy-payments-bill-actions");
    if(kind==="no_slip"){
      if(entry.can_review&&entry.remaining_minor!==null&&
         entry.remaining_minor>0&&entry.status!=="overallocated"){
        actions.append(button("Paid by  ⌄","billy-payments-method-button",()=>{
          editingId=editingId===entry.expense_document_id?null:entry.expense_document_id;
          render(activeData,activeRefresh);
        }));
      }else if(entry.can_review)
        actions.append(button("Review source","billy-financial-subtle",
          event=>void openSource(entry.expense_document_id,event.currentTarget)));
    }
    if(kind==="classified"){
      if(entry.can_review&&entry.remaining_minor>0&&!entry.on_account){
        actions.append(button("Add payment","billy-financial-subtle",()=>{
          editingId=editingId===entry.expense_document_id?null:entry.expense_document_id;
          render(activeData,activeRefresh);
        }));
      }
      for(const record of entry.allocations||[]){
        const btn=button("Undo "+(methods[record.method]||"report"),
          "billy-financial-subtle",async()=>{
            if(!window.confirm("Revoke this payment classification? The audit history stays intact."))return;
            btn.disabled=true;
            try{
              const response=await apiAction("financial-allocation-revoke",{allocation_id:record.id});
              if(response.revoked!==true)throw Error("Could not revoke classification");
              editingId=null;await activeRefresh?.();
            }catch(err){
              actions.append(make("small","billy-payments-inline-feedback",err?.message||"Undo failed"));
              btn.disabled=false;
            }
          });
        if(record.can_revoke&&entry.can_review)actions.append(btn);
      }
    }
    if(kind==="paid_on_bill"){
      actions.append(button("View bill","billy-financial-subtle",
        event=>void openSource(entry.expense_document_id,event.currentTarget)));
    }
    el.append(copy,amount,actions);
    if(entry.expense_document_id===editingId&&entry.can_review&&entry.remaining_minor>0)
      el.append(editor(entry));
    return el;
  }
  function render(data,refresh){
    activeData=data;activeRefresh=refresh;
    const pendingHost=$("billyFinancialReconciliationList");
    const cardHost=$("billyFinancialPaidOnBillList");
    const classifiedHost=$("billyFinancialReportedList");
    if(!pendingHost||!cardHost||!classifiedHost)return;
    const split=groups(data);
    const items=[[pendingHost,split.noSlip,"no_slip"],
      [cardHost,split.paidOnBill,"paid_on_bill"],
      [classifiedHost,split.classified,"classified"]];
    for(const [host,rows,kind] of items){
      host.replaceChildren();
      if(!data){
        host.append(make("p","billy-financial-empty","Financial data unavailable"));continue;
      }
      if(!rows.length){
        host.append(make("p","billy-financial-empty",
          kind==="no_slip"?"No bills waiting for a payment method":
          kind==="paid_on_bill"?"No explicitly card-paid bills without a separate slip":
          "No operator-classified bills without a slip"));
      }
      for(const item of rows.slice(0,150))host.append(row(item,kind));
      if(rows.length>150)host.append(make("p","billy-financial-coverage",
        "Showing 150 of "+rows.length+" bills. Full archive requires filtering."));
    }
    const count=(rows)=>rows.length+" bill"+(rows.length===1?"":"s");
    $("billyFinancialNoSlipCount").textContent=count(split.noSlip);
    $("billyFinancialPaidOnBillCount").textContent=count(split.paidOnBill);
    $("billyFinancialReportedCount").textContent=count(split.classified);
  }
  window.BillyFinancialReconciliation={render,groups};
})();