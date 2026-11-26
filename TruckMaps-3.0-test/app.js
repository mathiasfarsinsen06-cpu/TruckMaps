'use strict';
const $=id=>document.getElementById(id), cfg=window.TRUCKMAPS_CONFIG||{};let map,traffic,marker,lines=[],mode='truck',position=null,busy=false;
const status=s=>{$('result').textContent=s};
function save(){try{localStorage.setItem('truckmaps-profile',JSON.stringify({mode,height:$('height').value,width:$('width').value}))}catch{}}
function select(m){mode=m;$('dims').style.display=m==='truck'?'flex':'none';$('warning').hidden=m!=='truck';$('car').className=m==='car'?'':'alt';$('truck').className=m==='truck'?'':'alt';save()}
try{const p=JSON.parse(localStorage.getItem('truckmaps-profile'));if(p){$('height').value=p.height;$('width').value=p.width;mode=p.mode==='car'?'car':'truck'}}catch{}select(mode);$('car').onclick=()=>select('car');$('truck').onclick=()=>select('truck');$('height').onchange=save;$('width').onchange=save;
let pendingLocation = null;
function locate(){
  if(pendingLocation) return pendingLocation;
  pendingLocation=(async()=>{
    if(!window.isSecureContext || !navigator.geolocation) throw Error('Placering kræver HTTPS og en browser med GPS-understøttelse.');
    const attempt=options=>new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,options));
    let p;
    try{p=await attempt({enableHighAccuracy:false,timeout:12000,maximumAge:30000});}
    catch(e){
      if(e.code===1) throw Error('TruckMaps har ikke tilladelse til placering. Kontrollér hjemmesidens tilladelser i Chrome.');
      status('Prøver at finde position igen…');
      try{p=await attempt({enableHighAccuracy:true,timeout:45000,maximumAge:0});}
      catch(e){throw Error(e.code===1?'Placering er ikke tilladt for TruckMaps.':e.code===3?'Placering kunne ikke findes inden for tidsgrænsen. Indtast en startadresse eller prøv på en telefon.':'Browseren kunne ikke finde en position. Prøv igen eller indtast en startadresse.');}
    }
    position={lat:p.coords.latitude,lng:p.coords.longitude};
    if(map){if(!marker)marker=new google.maps.Marker({map});marker.setPosition(position);map.panTo(position);map.setZoom(15)}
    return position;
  })().finally(()=>{pendingLocation=null});
  return pendingLocation;
}
$('gps').onclick=async()=>{ $('gps').disabled=true;status('Finder din position…');try{await locate();status('Position fundet.')}catch(e){status(e.message)}finally{$('gps').disabled=false}};
let failed=false,renderTimer;
window.gm_authFailure=()=>{failed=true;clearTimeout(renderTimer);status('Google afviste kortnøglen. Kontrollér Console og nøglens begrænsninger.')};
window.initTruckMap=()=>{try{map=new google.maps.Map($('map'),{center:{lat:56.1,lng:10.2},zoom:7,mapTypeId:'roadmap',mapTypeControl:false,fullscreenControl:false,streetViewControl:false,gestureHandling:'greedy'});traffic=new google.maps.TrafficLayer();clearTimeout(renderTimer);if(failed)return;status('Kort initialiseret ('+$('map').clientWidth+' × '+$('map').clientHeight+' px). Venter på kortbilleder…');google.maps.event.addListenerOnce(map,'tilesloaded',()=>{clearTimeout(renderTimer);if(failed)return;status('Kortbilleder indlæst. Finder position…');locate().then(()=>{if(!busy)status('Kort og position klar.')}).catch(e=>{if(!busy)status(e.message)})});renderTimer=setTimeout(()=>{if(!failed)status('Ingen kortbilleder modtaget. Kontrollér Console og Network.')},20000)}catch(e){status('Kortinitialisering fejlede: '+e.message)}};
$('sat').onclick=()=>{if(map)map.setMapTypeId(map.getMapTypeId()==='hybrid'?'roadmap':'hybrid')};$('traffic').onclick=()=>{if(traffic){const on=!traffic.getMap();traffic.setMap(on?map:null);$('traffic').textContent=on?'Skjul trafik':'Vis trafik'}};
async function point(s){const a=s.trim().split(',').map(x=>x.trim());if(a.length===2&&a.every(x=>x!==''&&Number.isFinite(Number(x)))){const [lat,lng]=a.map(Number);if(Math.abs(lat)<=90&&Math.abs(lng)<=180)return {lat,lng}}if(!map)throw Error('Kortet er ikke klar');const g=new google.maps.Geocoder();const r=await g.geocode({address:s});if(!r.results.length)throw Error('Adresse ikke fundet');if(r.results.length>1||r.results[0].partial_match){const name=r.results[0].formatted_address;if(!confirm('Brug denne adresse? '+name))throw Error('Vælg en mere præcis adresse')}return r.results[0].geometry.location.toJSON()}
$('route').onclick=async()=>{if(busy)return;busy=true;$('route').disabled=true;lines.forEach(l=>l.setMap(null));lines=[];try{if(!map)throw Error('Kortet er ikke klar');if(!$('destination').value.trim())throw Error('Indtast destination');const m=mode;const h=Number($('height').value.replace(',','.')),w=Number($('width').value.replace(',','.'));if(m==='truck'&&(!(h>0&&h<=10)||!(w>0&&w<=10)))throw Error('Indtast gyldig højde og bredde');status('Finder rute…');const from=$('start').value.trim()?await point($('start').value):await locate();const to=await point($('destination').value);const u=new URL(cfg.api+'/route');u.search=new URLSearchParams({from:`${from.lat},${from.lng}`,to:`${to.lat},${to.lng}`,mode:m,...(m==='truck'?{height:h,width:w}:{})});const r=await fetch(u);if(!r.ok)throw Error('Ruteserver svarede '+r.status);const data=await r.json();if(!data.routes?.length)throw Error('Ingen rute fundet');const bounds=new google.maps.LatLngBounds();data.routes.forEach((route,i)=>{const path=route.legs.flatMap(l=>l.points.map(p=>({lat:p.latitude,lng:p.longitude})));const line=new google.maps.Polyline({map,path,strokeColor:i?'#90a4c5':'#1967d2',strokeWeight:i?5:8,zIndex:i?1:2});lines.push(line);if(!i)path.forEach(p=>bounds.extend(p))});map.fitBounds(bounds,45);const s=data.routes[0].summary;status(`${m==='truck'?'Lastbil':'Personbil'} · ${(s.lengthInMeters/1000).toFixed(1)} km\n${Math.round(s.travelTimeInSeconds/60)} min · Trafikforsinkelse ${Math.round(s.trafficDelayInSeconds/60)} min\nRouting provided by TomTom`)}catch(e){status(e.message+' — ingen aktuel rute.')}finally{busy=false;$('route').disabled=false}};
if(!cfg.googleKey||/^INDS[AÆ]ET/i.test(cfg.googleKey.trim()))status('Udvikleren skal konfigurere Google-browsernøglen i config.js.');else{const s=document.createElement('script');s.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key:cfg.googleKey.trim(),callback:'initTruckMap',loading:'async',language:'da'});s.async=true;s.onerror=()=>status('Google-kort kunne ikke indlæses');status('Henter Google-kort…');renderTimer=setTimeout(()=>{if(!failed&&!map)status('Google-kortets callback svarede ikke.')},20000);document.head.append(s)}
