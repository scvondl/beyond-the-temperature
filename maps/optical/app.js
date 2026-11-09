/* Singapore Vegetation Atlas — static, embeddable Leaflet component. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
  const ndviPalette=['#99714d','#d5c69d','#ecedcf','#a0c7a4','#4c956c','#185a43'];
  const ndbiPalette=['#247b7d','#94bbb0','#f1efe4','#d2a882','#985e40'];
  const vbsPalette=['#9d7756','#cfb99b','#e6e8cd','#96bd9a','#3b8059','#1c503b'];
  const definitions={
    ndvi:{name:'NDVI · island greenness',category:'VEGETATION GREENNESS',caption:'2021–2025 · 20 m · higher = stronger vegetation signal',kind:'raster',metric:'ndvi',legend:'NDVI',unit:'index',min:-.2,max:1,palette:ndviPalette,ticks:[-.2,0,.4,.8,1],note:'Supported land only · gaps remain transparent'},
    ndbi:{name:'NDBI · built-surface signal',category:'BUILT-SURFACE SPECTRAL SIGNAL',caption:'2021–2025 · 20 m · also responds to bare soil',kind:'raster',metric:'ndbi',legend:'NDBI',unit:'index',min:-.7,max:.7,palette:ndbiPalette,ticks:[-.7,-.35,0,.35,.7],note:'Higher = stronger built / bare-surface signal'},
    vbs:{name:'VBS · 0–100 display',category:'VEGETATION–BUILT SCORE',caption:'2021–2025 · 20 m · higher = greener spectral profile',kind:'raster',metric:'vbs',legend:'VBS · clipped display',unit:'0–100',min:0,max:100,palette:vbsPalette,ticks:[0,25,50,75,100],note:'Clipped colours · popup retains original VBS'},
    'vbs-raw':{name:'VBS · original reference scale',category:'ORIGINAL VBS REFERENCE SCALE',caption:'Same formula · full range · park reference retained',kind:'raster',metric:'vbs',legend:'VBS · original scale',unit:'score',min:-225,max:175,palette:vbsPalette,ticks:[-225,-125,-25,75,175],note:'Values outside 0–100 are valid extrapolations'},
    'park-ndvi':{name:'Park mean NDVI',category:'PARK VEGETATION GREENNESS',caption:'37 eligible park summaries · actual years in popup',kind:'park',metric:'ndvi',field:'ndvi_mean_multiyear',legend:'Park mean NDVI',unit:'index',min:-.2,max:1,palette:ndviPalette,ticks:[-.2,0,.4,.8,1],note:'Original summaries · grey = unavailable'},
    'park-ndbi':{name:'Park mean NDBI',category:'PARK BUILT-SURFACE SIGNAL',caption:'37 eligible park summaries · actual years in popup',kind:'park',metric:'ndbi',field:'ndbi_mean_multiyear',legend:'Park mean NDBI',unit:'index',min:-.7,max:.7,palette:ndbiPalette,ticks:[-.7,-.35,0,.35,.7],note:'Original summaries · grey = unavailable'},
    'park-vbs':{name:'Park VBS',category:'PARK VEGETATION–BUILT SCORE',caption:'37 scored parks · 6 of the original shortlist',kind:'park',metric:'vbs',field:'vegetation_building_score',legend:'Park VBS',unit:'0–100',min:0,max:100,palette:vbsPalette,ticks:[0,25,50,75,100],note:'Original 37-park reference · no refitting'},
    status:{name:'Observation coverage',category:'OBSERVATION SUPPORT',caption:'Supported land, low support, water and missing years',kind:'qa',legend:'Observation coverage',unit:'QA'},
    basemap:{name:'Basemap only',category:'CONTEXT MAP',caption:'Local planning-area outlines and place labels',kind:'base',legend:'Basemap',unit:''}
  };
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const valid=id=>Object.hasOwn(definitions,id);
  const state={left:valid(query.get('left'))?query.get('left'):'ndvi',right:valid(query.get('right'))?query.get('right'):'vbs',
    mode:query.get('mode')==='single'?'single':'swipe',split:query.has('split')?clamp(Number(query.get('split'))||0,0,100):50,
    opacity:query.has('opacity')?clamp(Number(query.get('opacity'))||82,15,100)/100:.88,
    basemap:['light','dark','none'].includes(query.get('basemap'))?query.get('basemap'):'light',outlines:query.get('parks')!=='0',shortlist:query.get('shortlist')==='1'};
  if(query.get('embed')==='1')document.body.classList.add('embed');
  let map,metadata,parks,areas,annual,boundary,context,labels,statusTimer,queryTimer,lastClick=0;
  const current={left:null,right:null},versions={left:0,right:0},grids=new Map();
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(x,d=3)=>x!==null&&x!==undefined&&Number.isFinite(Number(x))?Number(x).toFixed(d):'Unavailable';
  const exists=x=>x!==null&&x!==undefined&&Number.isFinite(Number(x));
  const quality={1:'Supported land',2:'Insufficient land years',3:'Dominant water',4:'No qualified annual observations'};
  const popupOptions={maxWidth:310,autoPanPaddingTopLeft:[20,115],autoPanPaddingBottomRight:[20,105]};
  async function json(url){const r=await fetch(url);if(!r.ok)throw Error(`${url}: ${r.status}`);return r.json();}
  function notice(text){clearTimeout(statusTimer);$('map-status').textContent=text;$('map-status').style.display='block';statusTimer=setTimeout(()=>$('map-status').style.display='none',6500);}
  function saveQuery(){clearTimeout(queryTimer);queryTimer=setTimeout(()=>{
    const q=new URLSearchParams(location.search);for(const k of ['left','right','mode','basemap'])q.set(k,state[k]);
    q.set('split',Math.round(state.split));q.set('opacity',Math.round(state.opacity*100));q.set('parks',state.outlines?'1':'0');q.set('shortlist',state.shortlist?'1':'0');
    history.replaceState(null,'',`${location.pathname}?${q}${location.hash}`);
  },200);}
  function colour(x,d){if(!exists(x))return '#c4cdcc';const p=clamp((x-d.min)/(d.max-d.min),0,1)*(d.palette.length-1),a=Math.floor(p),b=Math.min(a+1,d.palette.length-1),t=p-a;
    const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)),aa=rgb(d.palette[a]),bb=rgb(d.palette[b]);return '#'+aa.map((n,i)=>Math.round(n+(bb[i]-n)*t).toString(16).padStart(2,'0')).join('');}
  function clip(){if(!map)return;const s=map.getSize(),p=map.containerPointToLayerPoint([0,0]),right=p.x+s.x,bottom=p.y+s.y,split=p.x+s.x*state.split/100;
    for(const pane of ['themeLeft','themeRight']){map.getPane(pane).style.width=`${Math.max(s.x,right)}px`;map.getPane(pane).style.height=`${Math.max(s.y,bottom)}px`;}
    map.getPane('themeLeft').style.clip=state.mode==='single'?'auto':`rect(${p.y}px,${split}px,${bottom}px,${p.x}px)`;
    map.getPane('themeRight').style.display=state.mode==='single'?'none':'';map.getPane('themeRight').style.clip=`rect(${p.y}px,${right}px,${bottom}px,${split}px)`;
    $('swipe-divider').style.left=state.split+'%';$('swipe-handle').setAttribute('aria-valuenow',Math.round(state.split));}
  function setSplit(x){state.split=clamp(Number(x),0,100);clip();saveQuery();}
  function setMode(value){state.mode=value==='single'?'single':'swipe';$('atlas').classList.toggle('single',state.mode==='single');
    if($('hint-text'))$('hint-text').textContent=state.mode==='single'?'Click a park or pixel · use + / − to zoom':'Drag the divider · click a park or pixel';
    for(const k of ['single','swipe']){$(k+'-mode').classList.toggle('active',state.mode===k);$(k+'-mode').setAttribute('aria-pressed',String(state.mode===k));}clip();saveQuery();}
  function selectedParks(){return state.shortlist?parks.features.filter(f=>f.properties.basic_shortlisted):parks.features;}
  function drawContext(){if(context)map.removeLayer(context);if(!state.outlines)return;
    context=L.geoJSON({type:'FeatureCollection',features:selectedParks()},{pane:'parkContext',interactive:false,renderer:L.svg({pane:'parkContext'}),
      style:f=>({fill:false,color:f.properties.basic_shortlisted?'#395a50':'#647d75',weight:f.properties.basic_shortlisted?1.35:.8,opacity:.75})}).addTo(map);}
  function setBasemap(value){state.basemap=value;$('basemap').value=value;$('atlas').classList.toggle('dark-basemap',value==='dark');$('map').style.background=value==='dark'?'#1e2c32':'#eaf0ef';
    boundary?.setStyle({color:value==='dark'?'#637b84':'#c1cdcb',fillColor:value==='dark'?'#34434a':'#fafbf8',fillOpacity:1});if(labels)map.getPane('placeLabels').style.display=value==='none'?'none':'';saveQuery();}
  function legend(side){const d=definitions[state[side]],el=$('legend-'+side);
    if(d.kind==='base'){el.innerHTML='<div class="legend-top">Context map</div><div class="legend-note">Select an index layer above to explore the island.</div>';return;}
    if(d.kind==='qa'){el.innerHTML='<div class="legend-top"><span>Observation coverage</span><span class="legend-unit">QA</span></div><div class="legend-categories"><span><i style="background:#71a18b"></i>Supported land</span><span><i style="background:#d8b57b"></i>Low support</span><span><i style="background:#8eb7ca"></i>Dominant water</span><span><i style="background:#9ca4a6"></i>No eligible year</span></div><div class="legend-note">3+ land years for the main index layers</div>';return;}
    el.innerHTML=`<div class="legend-top"><span>${esc(d.legend)}</span><span class="legend-unit">${esc(d.unit)}</span></div><div class="legend-gradient" style="background:linear-gradient(90deg,${d.palette.join(',')})"></div><div class="legend-labels">${d.ticks.map(t=>`<span>${t}</span>`).join('')}</div><div class="legend-note">${esc(d.note)}</div>`;}
  async function draw(side){const version=++versions[side],id=state[side],d=definitions[id],pane=side==='left'?'themeLeft':'themeRight';
    if(current[side])map.removeLayer(current[side]);current[side]=null;$(side+'-layer').value=id;$(side+'-category').textContent=d.category;$(side+'-caption').textContent=d.caption;legend(side);
    let layer;
    if(d.kind==='raster'||d.kind==='qa'){
      layer=L.imageOverlay(metadata.raster.layers[id].png,metadata.raster.bounds,{pane,interactive:false,opacity:state.opacity,alt:d.name});
      layer.on('error',()=>notice('An index image could not load. Please reload the page.'));
    }else if(d.kind==='park')layer=L.geoJSON({type:'FeatureCollection',features:selectedParks()},{pane,interactive:false,renderer:L.svg({pane}),
      style:f=>({fillColor:colour(f.properties[d.field],d),fillOpacity:exists(f.properties[d.field])?state.opacity:.25,color:exists(f.properties[d.field])?'#4b6d5d':'#9faaa9',weight:1.3,opacity:.85,dashArray:exists(f.properties[d.field])?null:'3 3'})});
    if(version!==versions[side])return;if(layer)current[side]=layer.addTo(map);clip();}
  async function setLayers(left,right){if(left!==undefined){if(!valid(left))throw Error('Unknown left layer');state.left=left;}if(right!==undefined){if(!valid(right))throw Error('Unknown right layer');state.right=right;}lastClick++;map.closePopup();await Promise.all([draw('left'),draw('right')]);saveQuery();}
  async function grid(id){if(grids.has(id))return grids.get(id);const info=metadata.raster.layers[id],task=(async()=>{const r=await fetch(info.values);if(!r.ok)throw Error('Pixel data could not load');const a=await r.arrayBuffer();return info.encoding==='uint8'?new Uint8Array(a):new Int16Array(a);})();grids.set(id,task);try{return await task;}catch(e){grids.delete(id);throw e;}}
  async function sample(id,latlng){const g=metadata.raster,p=L.CRS.EPSG3857.project(latlng),t=g.transform,x=Math.floor((p.x-t[2])/t[0]),y=Math.floor((p.y-t[5])/t[4]);if(x<0||y<0||x>=g.width||y>=g.height)return null;
    const a=await grid(id),v=a[y*g.width+x],info=g.layers[id];return (info.encoding==='uint8'?v===255:v===-32768)?null:v/info.scale;}
  function ring(p,r){let hit=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
  function polygon(p,c){return ring(p,c[0])&&!c.slice(1).some(r=>ring(p,r));}
  function hitPark(latlng){const p=[latlng.lng,latlng.lat];return selectedParks().find(f=>f.geometry.type==='Polygon'?polygon(p,f.geometry.coordinates):f.geometry.type==='MultiPolygon'&&f.geometry.coordinates.some(c=>polygon(p,c)));}
  function parkPopup(f){const p=f.properties,available=exists(p.vegetation_building_score),rows=annual[p.candidate_id]||[];
    const score=available?`<div class="popup-score"><span>Vegetation–built score<br>higher = greener spectral profile</span><strong>${fmt(p.vegetation_building_score,1)}<small style="font-size:10px;font-weight:400"> /100</small></strong></div>`:`<div class="popup-score"><span>VBS unavailable<br>${p.eligible_index_years} eligible years; at least 3 required</span></div>`;
    const yearly=rows.map(r=>`<tr class="${r.status==='eligible'?'':'excluded'}"><td>${r.year}${r.status==='eligible'?'':' *'}</td><td>${fmt(r.ndvi_mean)}</td><td>${fmt(r.ndbi_mean)}</td><td>${exists(r.clear_area_coverage)?fmt(r.clear_area_coverage*100,0)+'%':'—'}</td></tr>`).join('');
    return `<div class="popup-eyebrow">${esc(p.candidate_id)} · ${p.basic_shortlisted?'ORIGINAL SHORTLIST':'CANDIDATE PARK'}</div><h3 class="popup-title">${esc(p.park)}</h3><p class="popup-subtitle">${esc(p.park_type.replace(/^[A-E] /,''))}</p>${score}<div class="popup-rows"><span>Mean land NDVI</span><b>${fmt(p.ndvi_mean_multiyear)}</b><span>Mean land NDBI</span><b>${fmt(p.ndbi_mean_multiyear)}</b><span>Eligible years</span><b>${p.eligible_index_years} / 5</b><span>Years used</span><b>${esc((p.index_years||'None').replaceAll(';',', '))}</b><span>Mean observed coverage</span><b>${exists(p.observed_area_coverage_mean)?fmt(p.observed_area_coverage_mean*100,1)+'%':'Unavailable'}</b><span>Polygon area</span><b>${fmt(p.polygon_area_ha,2)} ha</b></div><div class="popup-annual"><p class="annual-caption">Annual observation support</p><table class="annual-table"><thead><tr><th>Year</th><th>NDVI</th><th>NDBI</th><th>Coverage</th></tr></thead><tbody>${yearly}</tbody></table><p class="popup-note">* Excluded from the multi-year park score. Annual values are observation summaries, including low-support years.</p></div><p class="popup-note">Original park statistics retained. The island raster uses pixel-level support rules; re-aggregating it may produce different park means.</p>`;}
  async function clicked(e){const request=++lastClick,f=hitPark(e.latlng);if(f){L.popup(popupOptions).setLatLng(e.latlng).setContent(parkPopup(f)).openOn(map);return;}
    const side=state.mode==='single'||e.containerPoint.x<=map.getSize().x*state.split/100?'left':'right';if(definitions[state[side]].kind==='base')return;
    const popup=L.popup(popupOptions).setLatLng(e.latlng).setContent('<div class="pixel-loading">Reading pixel values…</div>').openOn(map);
    try{const [ndvi,ndbi,vbs,support,quarters,status]=await Promise.all(['ndvi','ndbi','vbs','support','quarters','status'].map(id=>sample(id,e.latlng)));if(request!==lastClick||!map.hasLayer(popup))return;
      const supported=exists(vbs),score=supported?`<div class="popup-score"><span>Original pixel VBS<br>fixed park reference</span><strong>${fmt(vbs,2)}</strong></div>`:`<div class="popup-score"><span>${esc(quality[status]||'Outside the analysis mask')}</span></div>`;
      const saturation=supported&&(vbs<0||vbs>100)?`<p class="popup-range-note">The 0–100 view displays ${fmt(clamp(vbs,0,100),0)} here. This original score is outside the park-average reference interval; it is not missing data.</p>`:'';
      popup.setContent(`<div class="popup-eyebrow">20 M LAND PIXEL · 2021–2025</div><h3 class="popup-title">${supported?'Spectral landscape profile':'No supported index result'}</h3>${score}<div class="popup-rows"><span>NDVI</span><b>${fmt(ndvi)}</b><span>NDBI</span><b>${fmt(ndbi)}</b><span>VBS · 0–100 display</span><b>${supported?fmt(clamp(vbs,0,100),1):'Unavailable'}</b><span>Qualified land years</span><b>${support??'—'} / 5</b><span>Qualified quarters</span><b>${quarters??'—'} / 20</b></div>${saturation}<p class="popup-note">${esc(quality[status]||'Outside the analysis mask')}. Higher VBS means greener with a weaker built-surface signal. Missing values are not filled.</p>`);
    }catch{if(request===lastClick&&map.hasLayer(popup))popup.setContent('<p class="popup-note">Pixel data could not load. Please try again.</p>');}}
  function ui(){const order=Object.keys(definitions);for(const side of ['left','right']){
      $(side+'-layer').innerHTML=order.map(k=>`<option value="${k}">${esc(definitions[k].name)}</option>`).join('');$(side+'-layer').value=state[side];
      $(side+'-layer').onchange=e=>{state[side]=e.target.value;lastClick++;map.closePopup();draw(side);saveQuery();};}
    $('single-mode').onclick=()=>setMode('single');$('swipe-mode').onclick=()=>setMode('swipe');$('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();$('reset-view').onclick=()=>map.fitBounds(metadata.raster.bounds,{padding:[25,22]});
    $('opacity').value=Math.round(state.opacity*100);$('opacity-value').textContent=Math.round(state.opacity*100)+'%';
    $('opacity').oninput=e=>{state.opacity=Number(e.target.value)/100;$('opacity-value').textContent=e.target.value+'%';for(const side of ['left','right']){const layer=current[side];if(!layer)continue;if(layer.setOpacity)layer.setOpacity(state.opacity);else layer.eachLayer(l=>l.setStyle?.({fillOpacity:exists(l.feature?.properties[definitions[state[side]].field])?state.opacity:.25}));}saveQuery();};
    $('basemap').onchange=e=>setBasemap(e.target.value);$('park-outlines').checked=state.outlines;$('shortlist-only').checked=state.shortlist;
    $('park-outlines').onchange=e=>{state.outlines=e.target.checked;drawContext();saveQuery();};$('shortlist-only').onchange=e=>{state.shortlist=e.target.checked;drawContext();for(const side of ['left','right'])if(definitions[state[side]].kind==='park')draw(side);saveQuery();};
    const close=()=>{$('options-panel').hidden=true;$('options-button').setAttribute('aria-expanded','false');};$('options-button').onclick=()=>{$('options-panel').hidden=!$('options-panel').hidden;$('options-button').setAttribute('aria-expanded',String(!$('options-panel').hidden));};$('close-options').onclick=close;
    document.querySelectorAll('.preset').forEach(b=>b.onclick=async()=>{setMode('swipe');setSplit(50);await setLayers(b.dataset.left,b.dataset.right);close();});
    $('dismiss-hint').onclick=()=>$('map-hint').remove();$('about-button').onclick=()=>$('about-dialog').showModal();$('close-about').onclick=()=>$('about-dialog').close();$('about-dialog').onclick=e=>{if(e.target===$('about-dialog'))$('about-dialog').close();};document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('atlas').requestFullscreen();}catch{notice('Enable allowfullscreen on the host iframe to use fullscreen.');}};document.addEventListener('fullscreenchange',()=>setTimeout(()=>map.invalidateSize(),100));
    const handle=$('swipe-handle');handle.onpointerdown=e=>{e.preventDefault();handle.setPointerCapture(e.pointerId);handle.dataset.dragging='1';};handle.onpointermove=e=>{if(handle.dataset.dragging==='1'){const r=$('map-stage').getBoundingClientRect();setSplit((e.clientX-r.left)/r.width*100);}};handle.onpointerup=handle.onpointercancel=()=>delete handle.dataset.dragging;
    handle.onkeydown=e=>{const delta=e.shiftKey?10:2;if(e.key==='ArrowLeft'){setSplit(state.split-delta);e.preventDefault();}if(e.key==='ArrowRight'){setSplit(state.split+delta);e.preventDefault();}if(e.key==='Home'){setSplit(0);e.preventDefault();}if(e.key==='End'){setSplit(100);e.preventDefault();}};
    parks.features.slice().sort((a,b)=>a.properties.park.localeCompare(b.properties.park)).forEach(f=>{const o=document.createElement('option');o.value=f.properties.candidate_id;o.textContent=f.properties.park;$('park-search').append(o);});
    $('park-search').onchange=e=>{const f=parks.features.find(f=>f.properties.candidate_id===e.target.value);if(!f)return;const b=L.geoJSON(f).getBounds();map.fitBounds(b,{padding:[85,70],maxZoom:15});L.popup(popupOptions).setLatLng(b.getCenter()).setContent(parkPopup(f)).openOn(map);};
    new ResizeObserver(()=>{map.invalidateSize({pan:false});clip();}).observe($('map-stage'));}
  async function init(){if(typeof L==='undefined')throw Error('The local Leaflet library could not load');
    [metadata,parks,areas,annual]=await Promise.all([json('data/metadata.json'),json('data/parks.geojson'),json('data/planning-areas.geojson'),json('data/annual.json')]);
    map=L.map('map',{zoomControl:false,minZoom:9,maxZoom:18,zoomSnap:.25,zoomDelta:.5,scrollWheelZoom:false,maxBounds:[[.9,103.3],[1.8,104.4]],maxBoundsViscosity:.8,preferCanvas:false,zoomAnimation:false});
    for(const [name,z]of [['themeLeft',410],['themeRight',420],['parkContext',430],['placeLabels',435]]){map.createPane(name);map.getPane(name).style.zIndex=z;}
    boundary=L.geoJSON(areas,{interactive:false,style:{weight:.65}}).addTo(map);
    const names=new Set(['TUAS','JURONG WEST','JURONG EAST','BUKIT BATOK','BUKIT PANJANG','WOODLANDS','SEMBAWANG','YISHUN','SENGKANG','PUNGGOL','PASIR RIS','TAMPINES','BEDOK','CHANGI','BISHAN','ANG MO KIO','CLEMENTI','QUEENSTOWN','BUKIT TIMAH','TOA PAYOH','KALLANG','DOWNTOWN CORE','SOUTHERN ISLANDS','WESTERN ISLANDS']);
    const major=new Set(['JURONG WEST','WOODLANDS','YISHUN','PUNGGOL','CHANGI','BUKIT TIMAH','TAMPINES','DOWNTOWN CORE']);
    labels=L.layerGroup(areas.features.filter(f=>names.has(f.properties.PLN_AREA_N)).map(f=>L.marker(L.geoJSON(f).getBounds().getCenter(),{pane:'placeLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'place-label'+(major.has(f.properties.PLN_AREA_N)?'':' place-label-minor'),html:esc(f.properties.PLN_AREA_N),iconSize:[110,16],iconAnchor:[55,8]})}))).addTo(map);
    setBasemap(state.basemap);map.fitBounds(metadata.raster.bounds,{padding:[25,22]});map.on('move zoom resize moveend zoomend',clip);map.on('click',clicked);
    $('map').addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();map.setZoom(map.getZoom()+(e.deltaY<0?.25:-.25));}},{passive:false});
    ui();setMode(state.mode);drawContext();await Promise.all([draw('left'),draw('right')]);$('loading').remove();
    window.vegetationAtlas=Object.freeze({setLayers,setMode,setSplit,getState:()=>({...state}),getDataSummary:()=>({parks:metadata.parks,coverage:metadata.coverage})});
    window.dispatchEvent(new CustomEvent('vegetation-atlas:ready'));if(window.parent!==window)window.parent.postMessage({type:'vegetation-atlas:ready',version:metadata.version},'*');}
  init().catch(e=>{console.error('Vegetation atlas initialization failed:',e);$('loading').textContent=location.protocol==='file:'?'Open this component through a web server. See README_zh.md.':'The atlas data could not load. Please reload the page.';});
})();
