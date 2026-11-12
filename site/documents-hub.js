/* Billy Uploaded Documents visual hub. All aircraft are explicit fleet entries.
   Photos are intentionally unconfigured until approved image assets exist. */
(() => {
  "use strict";
  const fleet=[
    {registration:"YR-WNT",model:"Cessna 560XL Citation XLS+",photo:null},
    {registration:"YR-DSR",model:"Gulfstream G200",photo:null},
    {registration:"YR-WHO",model:"Honda Aircraft",photo:null},
    {registration:"YR-DDN",model:"Embraer Phenom 300E",photo:null},
    {registration:"YR-WSF",model:"Cirrus SF50",photo:null},
    {registration:"YR-NKA",model:"Cirrus SF50",photo:null},
    {registration:"YR-BIG",model:"Raytheon Beechjet 400A",photo:null}
  ];
  const views=["All","Aircraft","Services","Airports","Vendors"];
  const glyphs={
    All:["M4 4h13v15H4z","M8 8h13v13H8","M7 10h7M7 14h5"],
    Aircraft:["M12 2l3 8 7 4v3l-9-3v5l3 2v2l-4-1-4 1v-2l3-2v-5l-9 3v-3l7-4z"],
    Services:["M3 7l9-4 9 4-9 4z","M3 12l9 4 9-4","M3 17l9 4 9-4"],
    Airports:["M12 21s7-7.1 7-12a7 7 0 0 0-14 0c0 4.9 7 12 7 12z","M9 9h6M12 6v6"],
    Vendors:["M3 21V7l9-4 9 4v14","M7 10h2m6 0h2M7 14h2m6 0h2M10 21v-4h4v4"]
  };
  const make=(tag,cls,content)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(content!==undefined)node.textContent=String(content);
    return node;
  };
  function icon(type,cls){
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");
    svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.55");
    svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");
    svg.setAttribute("aria-hidden","true");svg.classList.add(cls||"billy-hub-symbol");
    for(const d of glyphs[type]||glyphs.All){
      const path=document.createElementNS("http://www.w3.org/2000/svg","path");
      path.setAttribute("d",d);svg.append(path);
    }
    return svg;
  }
  let root=null,heading=null,help=null;
  function mount(list,toolbar){
    if(root?.isConnected)return;
    heading=list.parentElement?.querySelector(".simple-heading")||null;
    help=heading?.querySelector(".billy-doc-info")||null;
    root=make("div","billy-hub-content");
    toolbar.before(root);
  }
  function header(state,navigate){
    if(!heading)return;
    const title=state.aircraft|| (state.mode==="Home"?"Uploaded Documents":state.mode);
    const label=make("span","billy-hub-title",title);
    heading.replaceChildren();
    if(state.mode!=="Home"){
      const back=make("button","billy-hub-back");
      back.type="button";back.setAttribute("aria-label","Back");
      back.append(icon("All","billy-hub-back-icon"));
      back.addEventListener("click",()=>window.BillyDocumentsIndex?.back());
      heading.append(back);
      const iconSurface=make("span","billy-hub-heading-icon");
      iconSurface.append(icon(state.mode,"billy-hub-title-symbol"));
      heading.append(iconSurface);
    }
    heading.append(label);
    if(state.mode==="Home"&&help)heading.append(help);
    if(state.mode!=="Home"){
      const home=make("button","billy-hub-home");
      home.type="button";home.title="Uploaded Documents";home.setAttribute("aria-label","Uploaded Documents home");
      home.append(icon("All","billy-hub-home-icon"));
      home.addEventListener("click",()=>navigate("Home"));
      heading.append(home);
    }
  }
  function photoBlock(aircraft,hero=false){
    const photo=make("div",hero?"billy-fleet-hero-image":"billy-fleet-photo");
    if(aircraft.photo){
      const img=make("img");img.src=aircraft.photo;img.alt=aircraft.registration;
      img.loading="lazy";photo.append(img);
    }else{
      photo.append(icon("Aircraft","billy-fleet-placeholder"));
      photo.setAttribute("aria-label","Aircraft photo not added yet");
    }
    return photo;
  }
  function render(state,navigate){
    if(!root?.isConnected)return;
    const section=root.closest("#simpleUploaded");
    if(section)section.dataset.billyDocView=state.mode==="Aircraft"&&state.aircraft?"AircraftDetail":state.mode;
    header(state,navigate);
    root.replaceChildren();
    if(state.mode==="Home"){
      const grid=make("div","billy-hub-grid");
      for(const view of views){
        const card=make("button","billy-hub-app");
        card.type="button";card.setAttribute("aria-label","Open "+view);
        const circle=make("span","billy-hub-circle");
        circle.append(icon(view));
        card.append(circle,make("span","billy-hub-label",view));
        card.addEventListener("click",()=>navigate(view));
        grid.append(card);
      }
      root.append(grid);return;
    }
    if(state.mode!=="Aircraft")return;
    if(!state.aircraft){
      const grid=make("div","billy-fleet-grid");
      for(const aircraft of fleet){
        const card=make("button","billy-fleet-card");
        card.type="button";card.setAttribute("aria-label","Open "+aircraft.registration);
        card.append(photoBlock(aircraft));
        const info=make("span","billy-fleet-card-info");
        info.append(make("strong","billy-fleet-registration",aircraft.registration));
        info.append(make("span","billy-fleet-model",aircraft.model));
        card.append(info);
        card.addEventListener("click",()=>navigate("Aircraft",aircraft.registration));
        grid.append(card);
      }
      // Only unknown registrations or missing associations appear here, never
      // as extra aircraft cards generated from unreliable OCR.
      const known=new Set(fleet.map(a=>a.registration));
      const unmatched=state.records.filter(row=>{
        const reg=row.__billyDocument?.aircraft||"Unassigned";
        return !known.has(reg);
      }).length;
      root.append(grid);
      if(unmatched){
        const unmatchedButton=make("button","billy-fleet-unassigned","Unassigned · "+unmatched);
        unmatchedButton.type="button";
        unmatchedButton.addEventListener("click",()=>navigate("Aircraft","Unassigned"));
        root.append(unmatchedButton);
      }
      return;
    }
    const found=fleet.find(a=>a.registration===state.aircraft);
    const aircraft=found||{registration:"Unassigned",model:"Unmatched documents",photo:null};
    const hero=make("div","billy-fleet-hero");
    hero.append(photoBlock(aircraft,true));
    const text=make("div","billy-fleet-hero-copy");
    text.append(make("strong","",aircraft.registration),make("span","",aircraft.model));
    hero.append(text);root.append(hero);
  }
  window.BillyDocumentsHub={fleet,mount,render};
})();
