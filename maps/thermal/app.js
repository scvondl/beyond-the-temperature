/* Singapore Thermal Atlas — standalone, embeddable Leaflet component. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const definitions = {
    lst: {name:'Surface temperature · 2021–2025',category:'SURFACE TEMPERATURE',caption:'Multi-year composite · 150 m · historical',kind:'raster',legend:'Surface temperature',unit:'°C',min:26,max:47,note:'Transparent areas = no observation'},
    air: {name:'Background air · 2021–2024',category:'BACKGROUND AIR TEMPERATURE',caption:'Planning-area reference · historical',kind:'air',legend:'Background air temperature',unit:'°C',min:27.5,max:28.5,note:'Station-based planning-area proxies'},
    heat: {name:'Park heat score',category:'PARK TEMPERATURE SCORE',caption:'45 supported parks · higher = relatively hotter',kind:'heat',legend:'Park heat score',unit:'0–100',min:0,max:100,note:'50% park LST + 50% background air'},
    live: {name:'Latest station air temperature',category:'LATEST AIR TEMPERATURE',caption:'NEA stations · checking observations…',kind:'live',legend:'Station air temperature',unit:'°C',min:22,max:36,note:'Station observations; no interpolation'},
    basemap: {name:'Basemap only',category:'BASEMAP',caption:'Context layer · no temperature overlay',kind:'base',legend:'Basemap',unit:'',note:'Use as a visual reference'}
  };
  for(let year=2021;year<=2025;year++) definitions[`lst-${year}`] = {
    ...definitions.lst,name:`Surface temperature · ${year}`,caption:`Annual composite · ${year} · 150 m`,legend:`Surface temperature · ${year}`
  };
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const validLayer=x=>Object.hasOwn(definitions,x);
  const initialOpacity=Number(params.get('opacity'));
  const initialSplit=Number(params.get('split'));
  const state={
    left:validLayer(params.get('left'))?params.get('left'):'lst',
    right:validLayer(params.get('right'))?params.get('right'):'air',
    mode:params.get('mode')==='single'?'single':'swipe',
    split:params.has('split')&&Number.isFinite(initialSplit)?clamp(initialSplit,0,100):50,
    opacity:params.has('opacity')&&Number.isFinite(initialOpacity)?clamp(initialOpacity,15,100)/100:.82,
    basemap:['light','dark','none'].includes(params.get('basemap'))?params.get('basemap'):'light',
    outlines:params.get('parks')!=='0',shortlist:params.get('shortlist')==='1'
  };
  if(params.get('embed')==='1') document.body.classList.add('embed');
  let map, metadata, parks, air, areas, basemapLayer, boundaryLayer, parkContext, placeLabels;
  let current={left:null,right:null},updateVersion={left:0,right:0};
  let livePromise=null, liveData=null, liveSaved=false, liveLastAttempt=0;
  let liveError='',liveTimer=null,statusTimer=null,queryTimer=null,lastClick=0;
  const grids=new Map();
  const escaped=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(x,d=2)=>x!==null&&x!==undefined&&Number.isFinite(Number(x))?Number(x).toFixed(d):'Unavailable';
  const sourceLink='https://data.gov.sg/datasets/d_66b77726bbae1b33f218db60ff5861f0/view';
  const warmColours=['#285184','#348ba6','#5eb1a4','#d0dc8d','#f9cd63','#ef8d43','#d44b3b','#822235'];
  const airColours=['#8bbbc9','#8bb9ad','#ccd7b5','#e5cd92','#d49b67'];
  const scoreColours=['#4d7e88','#91b0a4','#d8d7b1','#dfaf7e','#c36b4e'];
  const gradients={raster:warmColours,air:airColours,heat:scoreColours,live:warmColours};

  async function getJSON(url){
    const r=await fetch(url);if(!r.ok) throw Error(`${url}: ${r.status}`);return r.json();
  }
  function showStatus(message,permanent=false){
    clearTimeout(statusTimer);$('map-status').textContent=message;$('map-status').style.display='block';
    if(!permanent) statusTimer=setTimeout(()=>$('map-status').style.display='none',6500);
  }
  function saveQuery(){
    clearTimeout(queryTimer);queryTimer=setTimeout(()=>{
      const q=new URLSearchParams(location.search);
      for(const key of ['left','right','mode','basemap'])q.set(key,state[key]);
      q.set('split',Math.round(state.split));q.set('opacity',Math.round(state.opacity*100));
      q.set('parks',state.outlines?'1':'0');q.set('shortlist',state.shortlist?'1':'0');
      history.replaceState(null,'',`${location.pathname}?${q}${location.hash}`);
    },200);
  }
  function colour(value,min,max,palette){
    if(value===null||value===undefined||!Number.isFinite(Number(value)))return '#c4cdcc';
    const p=clamp((value-min)/(max-min),0,1)*(palette.length-1);
    const a=Math.floor(p),b=Math.min(a+1,palette.length-1),t=p-a;
    const hex=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
    const aa=hex(palette[a]),bb=hex(palette[b]);
    return '#'+aa.map((n,i)=>Math.round(n+(bb[i]-n)*t).toString(16).padStart(2,'0')).join('');
  }
  function displayDate(raw){
    const date=new Date(raw);
    return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-SG',{
      timeZone:'Asia/Singapore',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false
    }).format(date)+' SGT':'Time unavailable';
  }
  function latestReading(payload){
    const data=payload?.data;
    if(payload?.code!==0||!Array.isArray(data?.stations)||!Array.isArray(data?.readings))throw Error('Invalid station response');
    const readings=data.readings.filter(x=>Number.isFinite(Date.parse(x.timestamp))&&Array.isArray(x.data));
    readings.sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
    if(!readings.length)throw Error('No dated station readings');
    const latest=readings[0],stationIndex=new Map(data.stations.map(s=>[s.id,s]));
    const points=latest.data.flatMap(r=>{
      const s=stationIndex.get(r.stationId),lat=Number(s?.location?.latitude),lon=Number(s?.location?.longitude);
      if(!s||!Number.isFinite(lat)||!Number.isFinite(lon)||r.value===null||!Number.isFinite(Number(r.value)))return [];
      return [{id:s.id,name:s.name,lat,lon,value:Number(r.value)}];
    });
    if(!points.length)throw Error('No valid station observations');
    return {timestamp:latest.timestamp,points};
  }
  async function loadLive(force=false){
    if(livePromise)return livePromise;
    if(liveData&&!force&&Date.now()-liveLastAttempt<300000)return liveData;
    liveLastAttempt=Date.now();
    livePromise=(async()=>{
      try{
        const response=await fetch(metadata.live_endpoint,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error(`API status ${response.status}`);
        liveData=latestReading(await response.json());liveSaved=false;liveError='';
      }catch(error){
        liveError=error.message;
        if(liveData){liveSaved=true;}
        else{
          try{liveData=latestReading(await getJSON('data/station-snapshot.json'));liveSaved=true;}
          catch{liveData={timestamp:null,points:[]};liveSaved=true;}
        }
      }
      return liveData;
    })();
    try{return await livePromise;}finally{livePromise=null;}
  }
  function updateClip(){
    if(!map)return;
    const size=map.getSize(),topLeft=map.containerPointToLayerPoint([0,0]);
    const right=topLeft.x+size.x,bottom=topLeft.y+size.y;
    const divider=topLeft.x+size.x*state.split/100;
    // Give clipping panes an explicit box, including the current map-pane offset.
    // Empty Leaflet panes otherwise have a zero-sized clip reference in some browsers.
    for(const name of ['themeLeft','themeRight']){
      map.getPane(name).style.width=`${Math.max(size.x,right)}px`;
      map.getPane(name).style.height=`${Math.max(size.y,bottom)}px`;
    }
    map.getPane('themeLeft').style.clip=state.mode==='single'?'auto':
      `rect(${topLeft.y}px,${divider}px,${bottom}px,${topLeft.x}px)`;
    const pane=map.getPane('themeRight');pane.style.display=state.mode==='single'?'none':'';
    pane.style.clip=`rect(${topLeft.y}px,${right}px,${bottom}px,${divider}px)`;
    $('swipe-divider').style.left=`${state.split}%`;
    $('swipe-handle').setAttribute('aria-valuenow',Math.round(state.split));
  }
  function setSplit(value){state.split=clamp(Number(value),0,100);updateClip();saveQuery();}
  function setMode(mode){
    state.mode=mode==='single'?'single':'swipe';$('atlas').classList.toggle('single',state.mode==='single');
    if($('hint-text'))$('hint-text').textContent=state.mode==='single'?'Click a park or pixel · use + / − to zoom':'Drag the divider · click a park or pixel';
    for(const value of ['single','swipe']){
      $(value+'-mode').classList.toggle('active',state.mode===value);
      $(value+'-mode').setAttribute('aria-pressed',String(state.mode===value));
    }
    updateClip();saveQuery();
  }
  function visibleParks(){return state.shortlist?parks.features.filter(f=>f.properties.basic_shortlisted):parks.features;}
  function updateParkContext(){
    if(parkContext)map.removeLayer(parkContext);
    if(!state.outlines)return;
    parkContext=L.geoJSON({type:'FeatureCollection',features:visibleParks()},{
      pane:'parkContext',interactive:false,renderer:L.svg({pane:'parkContext'}),
      style:f=>({fill:false,color:f.properties.basic_shortlisted?'#415d68':'#647d86',weight:f.properties.basic_shortlisted?1.4:.8,opacity:.7})
    }).addTo(map);
  }
  function setBasemap(key){
    if(basemapLayer)map.removeLayer(basemapLayer);basemapLayer=null;state.basemap=key;
    $('basemap').value=key;
    $('map').style.background=key==='dark'?'#1e2c32':'#eaf0ef';
    $('atlas').classList.toggle('dark-basemap',key==='dark');
    if(boundaryLayer)boundaryLayer.setStyle({color:key==='dark'?'#637b84':'#c1cdcb',fillColor:key==='dark'?'#34434a':'#fafbf8',fillOpacity:1});
    if(placeLabels)map.getPane('placeLabels').style.display=key==='none'?'none':'';
    saveQuery();
  }
  function renderLegend(side){
    const id=state[side],d=definitions[id],el=$('legend-'+side);
    if(d.kind==='base'){
      el.innerHTML='<div class="legend-top">Context map</div><div class="legend-note">Select a thematic layer above to explore temperature.</div>';return;
    }
    const palette=gradients[d.kind],ticks=d.kind==='air'?[27.5,28,28.5]:d.kind==='heat'?[0,25,50,75,100]:d.kind==='live'?[22,26,30,34,36]:[26,32,38,44,47];
    let note=d.note;
    if(d.kind==='live'){
      const age=liveData?.timestamp?Date.now()-Date.parse(liveData.timestamp):Infinity;
      note=!liveData?.points.length?'No station readings available':
        `${liveSaved?'Saved snapshot':age>1800000?'Latest available · delayed':'Latest observation'} · ${displayDate(liveData.timestamp)}`;
    }
    el.innerHTML=`<div class="legend-top"><span>${escaped(d.legend)}</span><span class="legend-unit">${escaped(d.unit)}</span></div><div class="legend-gradient" style="background:linear-gradient(90deg,${palette.join(',')})"></div><div class="legend-labels">${ticks.map(t=>`<span>${t}</span>`).join('')}</div><div class="legend-note">${escaped(note)}${d.kind==='heat'?'<br><span class="legend-empty"><i class="empty-key"></i> Grey outline = score unavailable</span>':''}</div>`;
  }
  function renderCaption(side){
    const d=definitions[state[side]];$(side+'-category').textContent=d.category;
    let caption=d.caption;
    if(d.kind==='live'&&liveData)caption=liveData.points.length?
      `${liveSaved?'Saved snapshot':'NEA observations'} · ${liveData.points.length} stations`:'NEA API unavailable · no valid snapshot';
    $(side+'-caption').textContent=caption;
  }
  async function renderSide(side){
    const version=++updateVersion[side],id=state[side],d=definitions[id],pane=side==='left'?'themeLeft':'themeRight';
    if(current[side])map.removeLayer(current[side]);current[side]=null;
    $(side+'-layer').value=id;renderCaption(side);renderLegend(side);
    let layer;
    if(d.kind==='raster'){
      const info=metadata.raster.layers[id];
      layer=L.imageOverlay(info.png,metadata.raster.bounds,{pane,opacity:state.opacity,interactive:false,alt:d.name});
      layer.on('error',()=>showStatus('A temperature image could not load. Reload the page.',true));
    }else if(d.kind==='air'){
      layer=L.geoJSON(air,{pane,renderer:L.svg({pane}),interactive:false,
        style:f=>({fillColor:colour(f.properties.reference_air_mean_c,27.5,28.5,airColours),
          fillOpacity:state.opacity,color:'#f6f7f0',opacity:.9,weight:.65})});
    }else if(d.kind==='heat'){
      layer=L.geoJSON({type:'FeatureCollection',features:visibleParks()},{pane,renderer:L.svg({pane}),interactive:false,
        style:f=>({fillColor:colour(f.properties.temperature_score,0,100,scoreColours),
          fillOpacity:f.properties.temperature_score===null?.25:state.opacity,
          color:f.properties.temperature_score===null?'#9faaa9':'#4f6b76',weight:1.3,opacity:.8,
          dashArray:f.properties.temperature_score===null?'3 3':null})});
    }else if(d.kind==='live'){
      const live=await loadLive();if(version!==updateVersion[side])return;
      layer=L.layerGroup(live.points.map(s=>L.circleMarker([s.lat,s.lon],{
        pane,renderer:L.svg({pane}),interactive:false,radius:8,weight:2,color:'#fff',
        fillColor:colour(s.value,22,36,warmColours),fillOpacity:state.opacity,opacity:.95
      })));
      if(liveSaved)showStatus(live.points.length?'Live API unavailable; showing a dated saved snapshot.':'Live API unavailable. Historical layers remain available.');
      renderCaption(side);renderLegend(side);
    }
    if(version!==updateVersion[side])return;
    if(layer){current[side]=layer.addTo(map);}
    updateClip();
    if(d.kind==='raster')loadGrid(id).catch(()=>{});
  }
  async function setLayers(left,right){
    if(left!==undefined){if(!validLayer(left))throw Error('Unknown left layer');state.left=left;}
    if(right!==undefined){if(!validLayer(right))throw Error('Unknown right layer');state.right=right;}
    await Promise.all([renderSide('left'),renderSide('right')]);saveQuery();
  }
  async function loadGrid(id){
    if(grids.has(id))return grids.get(id);
    const url=metadata.raster.layers[id]?.values||`rasters/${id}.bin`;
    const task=(async()=>{
      const r=await fetch(url);if(!r.ok)throw Error('Pixel data unavailable');
      const raw=await r.arrayBuffer();
      return id.endsWith('years')?new Uint8Array(raw):new Int16Array(raw);
    })();grids.set(id,task);
    try{return await task;}catch(error){grids.delete(id);throw error;}
  }
  async function sample(id,latlng){
    const p=L.CRS.EPSG3857.project(latlng),g=metadata.raster,t=g.transform;
    const x=Math.floor((p.x-t[2])/t[0]),y=Math.floor((p.y-t[5])/t[4]);
    if(x<0||y<0||x>=g.width||y>=g.height)return null;
    const values=await loadGrid(id),v=values[y*g.width+x];
    return id.endsWith('years')?(v===255?null:v):(v===-32768?null:v/100);
  }
  function insideRing(p,ring){
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];
      if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }return inside;
  }
  function insidePolygon(p,coordinates){return insideRing(p,coordinates[0])&&!coordinates.slice(1).some(r=>insideRing(p,r));}
  function hitFeature(features,latlng){
    const point=[latlng.lng,latlng.lat];
    return features.find(f=>f.geometry.type==='Polygon'?insidePolygon(point,f.geometry.coordinates):
      f.geometry.type==='MultiPolygon'?f.geometry.coordinates.some(p=>insidePolygon(point,p)):false);
  }
  function parkPopup(feature){
    const p=feature.properties,scored=p.temperature_score!==null;
    const score=scored?`<div class="popup-score"><span>Historical heat score<br>higher = relatively hotter</span><strong>${fmt(p.temperature_score,1)}<small style="font-size:10px;font-weight:400"> /100</small></strong></div>`:
      `<div class="popup-score"><span>Heat score unavailable<br>${escaped(p.score_status.replaceAll('_',' '))}</span></div>`;
    return `<div class="popup-eyebrow">${escaped(p.candidate_id)} · ${p.basic_shortlisted?'ORIGINAL SHORTLIST':'CANDIDATE PARK'}</div><h3 class="popup-title">${escaped(p.park)}</h3><p class="popup-subtitle">${escaped(p.park_type.replace(/^[A-E] /,''))}</p>${score}<div class="popup-rows"><span>Median LST · 2021–2025</span><b>${fmt(p.lst_median_c)} °C</b><span>Background air · 2021–2024</span><b>${fmt(p.air_mean_c)} °C</b><span>Polygon area</span><b>${fmt(p.polygon_area_ha)} ha</b><span>LST observed coverage</span><b>${fmt(p.lst_coverage*100,1)}%</b><span>Effective LST cells</span><b>${fmt(p.effective_cell_count,1)}</b></div><p class="popup-note">Historical indicators; not the current temperature or a comfort index. Air reference station(s): ${escaped(p.air_station_ids||'Unavailable')}.</p>`;
  }
  function airPopup(feature){
    const p=feature.properties;
    const method=p.has_local_observation?'Eligible station(s) within the planning area':'Nearest eligible station to area centroid';
    return `<div class="popup-eyebrow">BACKGROUND AIR · 2021–2024</div><h3 class="popup-title">${escaped(p.planning_area.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()))}</h3><div class="popup-score"><span>Historical background air<br>calendar-month-balanced mean</span><strong>${fmt(p.reference_air_mean_c)}<small style="font-size:11px"> °C</small></strong></div><div class="popup-rows"><span>Reference station(s)</span><b>${escaped(p.reference_station_ids)}</b></div><p class="popup-note">${escaped(method)}. Area colour represents an assigned station reference, not spatial interpolation.</p>`;
  }
  async function handleMapClick(event){
    const click=++lastClick,side=state.mode==='single'||event.containerPoint.x<=map.getSize().x*state.split/100?'left':'right';
    const id=state[side],d=definitions[id],latlng=event.latlng;
    if(d.kind==='live'&&liveData){
      const nearest=liveData.points.map(s=>({s,distance:map.latLngToContainerPoint([s.lat,s.lon]).distanceTo(event.containerPoint)})).sort((a,b)=>a.distance-b.distance)[0];
      if(nearest?.distance<22){
        const s=nearest.s;
        L.popup().setLatLng([s.lat,s.lon]).setContent(`<div class="popup-eyebrow">${liveSaved?'SAVED SNAPSHOT':'LATEST STATION OBSERVATION'}</div><h3 class="popup-title">${escaped(s.name)}</h3><div class="popup-score"><span>Air temperature · ${escaped(s.id)}</span><strong>${fmt(s.value,1)}<small style="font-size:11px"> °C</small></strong></div><p class="popup-subtitle">${escaped(displayDate(liveData.timestamp))}</p><p class="popup-note">NEA / data.gov.sg. Station observation; no interpolation.${liveSaved?' The live API could not be reached.':''}</p>`).openOn(map);return;
      }
    }
    const park=hitFeature(visibleParks(),latlng);
    if(park){L.popup({maxWidth:310}).setLatLng(latlng).setContent(parkPopup(park)).openOn(map);return;}
    if(d.kind==='air'){
      const area=hitFeature(air.features,latlng);
      if(area){L.popup().setLatLng(latlng).setContent(airPopup(area)).openOn(map);}return;
    }
    if(d.kind==='raster'){
      try{
        const [value,observed,eligible]=await Promise.all([sample(id,latlng),sample('observed-years',latlng),sample('eligible-years',latlng)]);
        if(click!==lastClick)return;
        const details=id==='lst'?`<div class="popup-rows"><span>Observed years</span><b>${observed??'Unavailable'} / 5</b><span>Years meeting source support</span><b>${eligible??'Unavailable'} / 5</b></div>`:'';
        L.popup().setLatLng(latlng).setContent(`<div class="popup-eyebrow">${escaped(d.category)}</div><h3 class="popup-title">${value===null?'No observed LST':fmt(value)+' °C'}</h3><p class="popup-subtitle">${id==='lst'?'2021–2025 supplied interim composite':escaped(id.slice(-4))+' annual composite'} · 150 m source grid</p>${details}<p class="popup-note">${value===null?'NoData remains transparent; no spatial gap filling.':'Nearest source-pixel display sample. Surface temperature differs from station air temperature.'}</p>`).openOn(map);
      }catch{showStatus('Pixel values could not be loaded. The display layer remains available.');}
    }else if(d.kind==='heat'){showStatus('Click a park polygon to inspect its historical heat score.');}
  }
  function attachUI(){
    const ordered=['lst','air','heat','live','lst-2021','lst-2022','lst-2023','lst-2024','lst-2025','basemap'];
    for(const side of ['left','right']){
      $(side+'-layer').innerHTML=ordered.map(k=>`<option value="${k}">${escaped(definitions[k].name)}</option>`).join('');
      $(side+'-layer').value=state[side];
      $(side+'-layer').addEventListener('change',async e=>{
        state[side]=e.target.value;map.closePopup();lastClick++;await renderSide(side);saveQuery();
      });
    }
    $('single-mode').onclick=()=>setMode('single');$('swipe-mode').onclick=()=>setMode('swipe');
    $('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();
    $('reset-view').onclick=()=>map.fitBounds(metadata.raster.bounds,{padding:[25,22]});
    $('opacity').value=state.opacity*100;$('opacity-value').textContent=Math.round(state.opacity*100)+'%';
    $('opacity').oninput=e=>{
      state.opacity=Number(e.target.value)/100;$('opacity-value').textContent=e.target.value+'%';
      for(const side of ['left','right']){
        const layer=current[side];if(!layer)continue;
        if(layer.setOpacity)layer.setOpacity(state.opacity);
        else layer.eachLayer(l=>l.setStyle?.({fillOpacity:l.feature?.properties.temperature_score===null?.25:state.opacity}));
      }saveQuery();
    };
    $('basemap').onchange=e=>setBasemap(e.target.value);
    $('park-outlines').checked=state.outlines;$('shortlist-only').checked=state.shortlist;
    $('park-outlines').onchange=e=>{state.outlines=e.target.checked;updateParkContext();saveQuery();};
    $('shortlist-only').onchange=async e=>{
      state.shortlist=e.target.checked;updateParkContext();
      for(const side of ['left','right'])if(state[side]==='heat')await renderSide(side);saveQuery();
    };
    const panel=$('options-panel');
    const closeOptions=()=>{panel.hidden=true;$('options-button').setAttribute('aria-expanded','false');};
    $('options-button').onclick=()=>{panel.hidden=!panel.hidden;$('options-button').setAttribute('aria-expanded',String(!panel.hidden));};
    $('close-options').onclick=closeOptions;
    document.querySelectorAll('.preset').forEach(b=>b.onclick=async()=>{setMode('swipe');setSplit(50);await setLayers(b.dataset.left,b.dataset.right);closeOptions();});
    $('dismiss-hint').onclick=()=>$('map-hint').remove();
    $('about-button').onclick=()=>$('about-dialog').showModal();$('close-about').onclick=()=>$('about-dialog').close();
    $('about-dialog').addEventListener('click',e=>{if(e.target===$('about-dialog'))$('about-dialog').close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeOptions();});
    $('fullscreen').onclick=async()=>{
      try{if(document.fullscreenElement)await document.exitFullscreen();else await $('atlas').requestFullscreen();}
      catch{showStatus('Fullscreen is disabled by the host page. Enable allowfullscreen on the iframe.');}
    };
    document.addEventListener('fullscreenchange',()=>{
      $('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');setTimeout(()=>map.invalidateSize(),100);
    });
    const handle=$('swipe-handle');
    handle.addEventListener('pointerdown',e=>{e.preventDefault();handle.setPointerCapture(e.pointerId);handle.dataset.dragging='1';});
    handle.addEventListener('pointermove',e=>{if(handle.dataset.dragging==='1'){const r=$('map-stage').getBoundingClientRect();setSplit((e.clientX-r.left)/r.width*100);}});
    const stop=()=>delete handle.dataset.dragging;handle.addEventListener('pointerup',stop);handle.addEventListener('pointercancel',stop);
    handle.addEventListener('keydown',e=>{
      const delta=e.shiftKey?10:2;
      if(e.key==='ArrowLeft'){setSplit(state.split-delta);e.preventDefault();}
      if(e.key==='ArrowRight'){setSplit(state.split+delta);e.preventDefault();}
      if(e.key==='Home'){setSplit(0);e.preventDefault();}if(e.key==='End'){setSplit(100);e.preventDefault();}
    });
    parks.features.slice().sort((a,b)=>a.properties.park.localeCompare(b.properties.park)).forEach(f=>{
      const o=document.createElement('option');o.value=f.properties.candidate_id;o.textContent=f.properties.park;$('park-search').append(o);
    });
    $('park-search').onchange=e=>{
      const feature=parks.features.find(f=>f.properties.candidate_id===e.target.value);if(!feature)return;
      const bounds=L.geoJSON(feature).getBounds();map.fitBounds(bounds,{padding:[85,70],maxZoom:15});
      L.popup({maxWidth:310}).setLatLng(bounds.getCenter()).setContent(parkPopup(feature)).openOn(map);
    };
    new ResizeObserver(()=>{map.invalidateSize({pan:false});updateClip();}).observe($('map-stage'));
  }
  async function init(){
    if(typeof L==='undefined')throw Error('The local Leaflet library could not load.');
    [metadata,parks,air,areas]=await Promise.all([getJSON('data/metadata.json'),getJSON('data/parks.geojson'),getJSON('data/historical-air.geojson'),getJSON('data/planning-areas.geojson')]);
    map=L.map('map',{zoomControl:false,minZoom:9,maxZoom:18,zoomSnap:.25,zoomDelta:.5,scrollWheelZoom:false,
      maxBounds:[[.9,103.3],[1.8,104.4]],maxBoundsViscosity:.8,preferCanvas:false,zoomAnimation:false});
    for(const [name,z] of [['themeLeft',410],['themeRight',420],['parkContext',430],['placeLabels',435]]){
      map.createPane(name);map.getPane(name).style.zIndex=z;
    }
    boundaryLayer=L.geoJSON(areas,{interactive:false,style:{color:'#b6c3c4',weight:.65,fillColor:'#fafbf8',fillOpacity:.08}}).addTo(map);
    const names=new Set(['TUAS','JURONG WEST','JURONG EAST','BUKIT BATOK','BUKIT PANJANG',
      'WOODLANDS','SEMBAWANG','YISHUN','SENGKANG','PUNGGOL','PASIR RIS','TAMPINES','BEDOK',
      'CHANGI','BISHAN','ANG MO KIO','CLEMENTI','QUEENSTOWN','BUKIT TIMAH','TOA PAYOH',
      'KALLANG','DOWNTOWN CORE','SOUTHERN ISLANDS','WESTERN ISLANDS']);
    const majorNames=new Set(['JURONG WEST','WOODLANDS','YISHUN','PUNGGOL','CHANGI','BUKIT TIMAH','TAMPINES','DOWNTOWN CORE']);
    placeLabels=L.layerGroup(air.features.filter(f=>names.has(f.properties.planning_area)).map(f=>
      L.marker(L.geoJSON(f).getBounds().getCenter(),{pane:'placeLabels',interactive:false,keyboard:false,
        icon:L.divIcon({className:'place-label'+(majorNames.has(f.properties.planning_area)?'':' place-label-minor'),html:escaped(f.properties.planning_area),iconSize:[110,16],iconAnchor:[55,8]})})
    )).addTo(map);
    setBasemap(state.basemap);map.fitBounds(metadata.raster.bounds,{padding:[25,22]});
    map.on('move zoom resize moveend zoomend',updateClip);map.on('click',handleMapClick);
    // Avoid trapping page scrolling in an embedded map. Ctrl/Command + wheel can zoom.
    $('map').addEventListener('wheel',e=>{
      if(e.ctrlKey||e.metaKey){e.preventDefault();map.setZoom(map.getZoom()+(e.deltaY<0?.25:-.25));}
    },{passive:false});
    attachUI();setMode(state.mode);updateParkContext();
    await Promise.all([renderSide('left'),renderSide('right')]);
    $('loading').remove();
    liveTimer=setInterval(async()=>{
      if(!document.hidden&&(state.left==='live'||(state.mode==='swipe'&&state.right==='live'))){
        await loadLive(true);for(const side of ['left','right'])if(state[side]==='live')await renderSide(side);
      }
    },300000);
    window.thermalAtlas=Object.freeze({setLayers,setMode,setSplit,getState:()=>({...state}),
      getDataSummary:()=>({parks:metadata.parks,air:metadata.air,rasterLayers:Object.keys(metadata.raster.layers)})});
    window.dispatchEvent(new CustomEvent('thermal-atlas:ready'));
    if(window.parent!==window)window.parent.postMessage({type:'thermal-atlas:ready',version:metadata.version},'*');
  }
  init().catch(error=>{
    console.error('Thermal atlas initialization failed:',error);
    $('loading').textContent=location.protocol==='file:'?'Open this component through a web server. See README_zh.md in the download.':'The map data could not load. Please reload the page.';
  });
  window.addEventListener('pagehide',()=>clearInterval(liveTimer));
})();
