/* Billy Financial category labels: consistent, source-profile-based iconography. */
(() => {
  "use strict";
  const definitions={
    catering_bill:["CATERING","catering"],
    taxi_receipt:["TAXI","taxi"],
    city_tax_receipt:["CITY TAX","city"],
    crew_expense_receipt:["CREW EXPENSES","crew"],
    hotel_bill:["HOTEL","hotel"],
    handling_invoice:["HANDLING","handling"],
    fuel_invoice:["FUEL","fuel"],
    fuel_release:["FUEL","fuel"],
    pax_gifts_receipt:["PAX GIFTS","gift"],
    parking_receipt:["PARKING","parking"],
    aircraft_supplies_invoice:["AIRCRAFT SUPPLIES","aircraft"],
    other_expense:["OTHER","document"],
    generic_invoice:["INVOICE","document"],
    generic_receipt:["RECEIPT","document"],
    payment_slip:["POS SLIP","card"],
    supplier_statement:["STATEMENT","document"],
    generic_document:["DOCUMENT","document"]
  };
  const categories={
    catering:"catering_bill",taxi:"taxi_receipt",city_tax:"city_tax_receipt",
    crew_expenses:"crew_expense_receipt",hotel:"hotel_bill",
    handling:"handling_invoice",fuel:"fuel_invoice",
    pax_gifts:"pax_gifts_receipt",parking:"parking_receipt",
    aircraft_supplies:"aircraft_supplies_invoice",other:"other_expense"
  };
  // Small monochrome stroke glyphs; no emoji or external icon dependencies.
  const paths={
    catering:["M3 17h18","M5 17a7 7 0 0 1 14 0","M12 7V5","M10 5h4"],
    taxi:["M5 11l1.5-5h11L19 11","M3 11h18v7H3z","M6 18v2","M18 18v2","M7 15h2","M15 15h2"],
    city:["M3 10h18","M4 10V8l8-5 8 5v2","M6 10v9","M10 10v9","M14 10v9","M18 10v9","M3 19h18","M2 22h20"],
    crew:["M5 3h11l3 3v15H5z","M15 3v4h4","M8 11h8","M8 15h7"],
    hotel:["M5 21V3h14v18","M2 21h20","M9 7h2","M14 7h2","M9 11h2","M14 11h2","M9 15h2","M14 15h2","M10 21v-3h4v3"],
    handling:["M5 7h14v13H5z","M9 7V5h6v2","M8 11h8","M3 20h18","M8 20v2","M16 20v2"],
    fuel:["M6 3h9v18H6z","M6 7h9","M15 8h3l2 3v6a2 2 0 0 1-4 0v-4","M9 12h3"],
    gift:["M3 9h18v3H3z","M5 12v9h14v-9","M12 9v12","M12 9c-5 0-7-2-5-5 2-2 5 1 5 5","M12 9c5 0 7-2 5-5-2-2-5 1-5 5"],
    parking:["M5 3h14v18H5z","M10 18V7h3a3 3 0 0 1 0 6h-3"],
    aircraft:["M2 16l20-8-8 8-4-4-4 6-4-2z"],
    document:["M5 3h10l4 4v14H5z","M15 3v5h4","M8 12h8","M8 16h7"],
    card:["M3 6h18v13H3z","M3 10h18","M6 16h5"]
  };
  const resolve=(profile,category)=>{
    const byProfile=typeof profile==="string"?definitions[profile]:null;
    if(byProfile)return {label:byProfile[0],icon:byProfile[1]};
    const mapped=typeof category==="string"?definitions[categories[category]]:null;
    return mapped?{label:mapped[0],icon:mapped[1]}:{label:"EXPENSE",icon:"document"};
  };
  const make=(profile,category)=>{
    const item=resolve(profile,category);
    const holder=document.createElement("span");
    holder.className="billy-financial-category";
    holder.title=item.label;
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 24 24");
    svg.setAttribute("fill","none");
    svg.setAttribute("stroke","currentColor");
    svg.setAttribute("stroke-width","1.6");
    svg.setAttribute("stroke-linecap","round");
    svg.setAttribute("stroke-linejoin","round");
    svg.setAttribute("aria-hidden","true");
    for(const d of paths[item.icon]){
      const line=document.createElementNS("http://www.w3.org/2000/svg","path");
      line.setAttribute("d",d);
      svg.append(line);
    }
    const label=document.createElement("span");
    label.textContent=item.label;
    holder.append(svg,label);
    return holder;
  };
  window.BillyFinancialCategories={resolve,make};
})();