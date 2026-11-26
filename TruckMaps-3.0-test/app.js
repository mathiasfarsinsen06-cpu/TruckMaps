'use strict';
const $=id=>document.getElementById(id), cfg=window.TRUCKMAPS_CONFIG||{};let map,traffic,marker,lines=[],mode='truck',position=null,busy=false;
const status=s=>{$('result').textContent=s};
function save(){try{localStorage.setItem('truckmaps-profile',JSON.stringify({mode,height:$('height').value,width:$('width').value}))}catch{}}
function select(m){mode=m;$('dims').style.display=m==='truck'?'flex':'none';$('warning').hidden=m!=='truck';$('car').className=m==='car'?'':'alt';$('truck').className=m==='truck'?'':'alt';save()}
try{const p=JSON.parse(localStorage.getItem('truckmaps-profile'));if(p){$('height').value=p.height;$('width').value=p.width;mode=p.mode==='car'?'car':'truck'}}catch{}select(mode);$('car').onclick=()=>select('car');$('truck').onclick=()=>select('truck');$('height').onchange=save;$('width').onchange=save;
let pendingLocation = null;
let routeAttempted = false;
function locate(){
  if(pendingLocation) return pendingLocation;
  pendingLocation=(async()=>{
    if(!window.isSecureContext || !navigator.geolocation) throw Error('Placering kræver HTTPS og en browser med GPS-understøttelse.');
    const attempt=options=>new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,options));
    let p;
    try{p=await attempt({enableHighAccuracy:false,timeout:12000,maximumAge:30000});}
    catch(e){
      if(e.code===1) throw Error('TruckMaps har ikke tilladelse til placering. Kontrollér hjemmesidens tilladelser i Chrome.');
      if(!routeAttempted&&!busy)status('Prøver at finde position igen…');
      try{p=await attempt({enableHighAccuracy:true,timeout:45000,maximumAge:0});}
      catch(e){throw Error(e.code===1?'Placering er ikke tilladt for TruckMaps.':e.code===3?'Placering kunne ikke findes inden for tidsgrænsen. Indtast en startadresse eller prøv på en telefon.':'Browseren kunne ikke finde en position. Prøv igen eller indtast en startadresse.');}
    }
    position={lat:p.coords.latitude,lng:p.coords.longitude};
    updatePosition(p,true);
    return position;
  })().finally(()=>{pendingLocation=null});
  return pendingLocation;
}
$('gps').onclick=async()=>{ $('gps').disabled=true;status('Finder din position…');try{await locate();status('Position fundet.')}catch(e){status(e.message)}finally{$('gps').disabled=false}};
let failed=false,renderTimer;
window.gm_authFailure=()=>{failed=true;clearTimeout(renderTimer);status('Google afviste kortnøglen. Kontrollér Console og nøglens begrænsninger.')};
window.initTruckMap=()=>{try{map=new google.maps.Map($('map'),{center:{lat:56.1,lng:10.2},zoom:7,mapTypeId:'roadmap',mapTypeControl:false,fullscreenControl:false,streetViewControl:false,gestureHandling:'greedy'});traffic=new google.maps.TrafficLayer();setupMap();clearTimeout(renderTimer);if(failed)return;startTracking();status('Kort initialiseret ('+$('map').clientWidth+' × '+$('map').clientHeight+' px). Venter på kortbilleder…');google.maps.event.addListenerOnce(map,'tilesloaded',()=>{clearTimeout(renderTimer);if(failed)return;if(!routeAttempted&&!busy)status('Kort klar. Søg efter et sted eller planlæg en rute.');startTracking()});renderTimer=setTimeout(()=>{if(!failed&&!routeAttempted&&!busy)status('Ingen kortbilleder modtaget ('+$('map').clientWidth+' × '+$('map').clientHeight+' px). Kontrollér Console og Network.')},20000)}catch(e){status('Kortinitialisering fejlede: '+e.message)}};
$('sat').onclick=()=>{if(map)map.setMapTypeId(map.getMapTypeId()==='hybrid'?'roadmap':'hybrid')};$('traffic').onclick=()=>{if(traffic){const on=!traffic.getMap();traffic.setMap(on?map:null);$('traffic').textContent=on?'Skjul trafik':'Vis trafik'}};
async function point(s){
  const a=s.trim().split(',').map(x=>x.trim());
  if(a.length===2&&a.every(x=>x!==''&&Number.isFinite(Number(x)))){
    const [lat,lng]=a.map(Number);if(Math.abs(lat)<=90&&Math.abs(lng)<=180)return {lat,lng};
  }
  if(!map)throw Error('Kortet er ikke klar');
  const {Place}=await google.maps.importLibrary('places');
  let places;
  try{({places}=await Place.searchByText({textQuery:s.trim(),fields:['displayName','formattedAddress','location'],maxResultCount:5,language:'da',region:'dk'}));}
  catch(e){throw Error('Google Places adressesøgning fejlede: '+e.message);}
  const matches=(places||[]).filter(p=>p.location);
  if(!matches.length)throw Error('Adresse ikke fundet: '+s);
  const p=matches[0];
  if(!confirm('Brug denne adresse? '+[p.displayName,p.formattedAddress].filter(Boolean).join(' — ')))throw Error('Vælg en mere præcis adresse');
  return p.location.toJSON();
}
$('route').onclick=async()=>{if(busy)return;routeAttempted=true;busy=true;$('route').disabled=true;lines.forEach(l=>l.setMap(null));lines=[];try{if(!map)throw Error('Kortet er ikke klar');if(!$('destination').value.trim())throw Error('Indtast destination');const m=mode;const h=Number($('height').value.replace(',','.')),w=Number($('width').value.replace(',','.'));if(m==='truck'&&(!(h>0&&h<=10)||!(w>0&&w<=10)))throw Error('Indtast gyldig højde og bredde');status('Finder rute…');const from=$('start').value.trim()?await point($('start').value):(position&&Date.now()-positionTime<30000?position:await locate());const to=selected&&$('destination').value===selected.label?selected.location:await point($('destination').value);const u=new URL(cfg.api+'/route');u.search=new URLSearchParams({from:`${from.lat},${from.lng}`,to:`${to.lat},${to.lng}`,mode:m,...(m==='truck'?{height:h,width:w}:{})});const r=await fetch(u);if(!r.ok)throw Error('Ruteserver svarede '+r.status);const data=await r.json();if(!data.routes?.length)throw Error('Ingen rute fundet');const bounds=new google.maps.LatLngBounds();data.routes.forEach((route,i)=>{const path=route.legs.flatMap(l=>l.points.map(p=>({lat:p.latitude,lng:p.longitude})));const line=new google.maps.Polyline({map,path,strokeColor:i?'#90a4c5':'#1967d2',strokeWeight:i?5:8,zIndex:i?1:2});lines.push(line);if(!i)path.forEach(p=>bounds.extend(p))});map.fitBounds(bounds,{top:120,right:45,bottom:170,left:45});const s=data.routes[0].summary;status(`${m==='truck'?'Lastbil':'Personbil'} · ${(s.lengthInMeters/1000).toFixed(1)} km\n${Math.round(s.travelTimeInSeconds/60)} min · Trafikforsinkelse ${Math.round(s.trafficDelayInSeconds/60)} min\nRouting provided by TomTom`)}catch(e){status(e.message+' — ingen aktuel rute.')}finally{busy=false;$('route').disabled=false}};

let positionTime=0, accuracyCircle, watchId=null, selected=null, pins=[], selectionPin, searchSerial=0, searchTimer, centered=false;
function updatePosition(p,center=false){
 position={lat:p.coords.latitude,lng:p.coords.longitude};positionTime=p.timestamp||Date.now();
 if(!map)return;
 if(!marker)marker=new google.maps.Marker({map,icon:{path:google.maps.SymbolPath.CIRCLE,scale:8,fillColor:'#1967d2',fillOpacity:1,strokeColor:'#fff',strokeWeight:3},zIndex:1000,title:'Din position'});
 marker.setPosition(position);
 if(!accuracyCircle)accuracyCircle=new google.maps.Circle({map,strokeWeight:1,strokeColor:'#1967d2',fillColor:'#1967d2',fillOpacity:.12,clickable:false});
 accuracyCircle.setCenter(position);accuracyCircle.setRadius(p.coords.accuracy);
 if(center||!centered){map.panTo(position);map.setZoom(15);centered=true;}
}
function startTracking(){
 if(watchId!==null||!navigator.geolocation)return;
 watchId=navigator.geolocation.watchPosition(p=>{updatePosition(p);$('locationStatus').textContent='Position klar · ca. '+Math.round(p.coords.accuracy)+' m præcision';},e=>{$('locationStatus').textContent=e.code===1?'Placering ikke tilladt. Indtast startadresse.':'Venter på GPS. Du kan stadig vælge en startadresse.';},{enableHighAccuracy:true,timeout:30000,maximumAge:10000});
}
function distance(a,b){const rad=x=>x*Math.PI/180;const x=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;return 12742*Math.asin(Math.sqrt(Math.min(1,x)));}
function clearPins(){pins.forEach(p=>p.setMap(null));pins=[];}
function choose(label,loc,address=''){
 selected={label,location:loc};$('destination').value=label;$('chosenName').textContent=label;$('chosenAddress').textContent=address||`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;$('chosen').hidden=false;$('matches').replaceChildren();clearPins();
 if(!selectionPin)selectionPin=new google.maps.Marker({map});selectionPin.setPosition(loc);map.panTo(loc);
}
async function search(){
 const q=$('query').value.trim(), serial=++searchSerial;clearPins();$('matches').replaceChildren();if(!q||!map)return;
 $('searchStatus').textContent='Søger…';
 try{const {Place}=await google.maps.importLibrary('places');const origin=position||map.getCenter().toJSON();const {places}=await Place.searchByText({textQuery:q,fields:['displayName','formattedAddress','location'],maxResultCount:15,language:'da',locationBias:origin});if(serial!==searchSerial)return;
 const matches=(places||[]).filter(p=>p.location).map(p=>({label:p.displayName||p.formattedAddress,address:p.formattedAddress||'',location:p.location.toJSON()}));matches.sort((a,b)=>distance(origin,a.location)-distance(origin,b.location));
 $('searchStatus').textContent=matches.length? (position?'Steder nær din position':'Steder nær kortets centrum'):'Ingen steder fundet';
 for(const p of matches){const b=document.createElement('button');b.className='match';const name=document.createElement('strong');name.textContent=p.label;const detail=document.createElement('small');detail.textContent=p.address+' · '+distance(origin,p.location).toFixed(1)+' km i luftlinje';b.append(name,detail);b.onclick=()=>choose(p.label,p.location,p.address);$('matches').append(b);const pin=new google.maps.Marker({map,position:p.location,title:p.label});pin.addListener('click',()=>choose(p.label,p.location,p.address));pins.push(pin);}
 }catch(e){if(serial===searchSerial)$('searchStatus').textContent='Søgning fejlede: '+e.message;}
}
function setupMap(){map.addListener('click',async e=>{if(!e.latLng)return;const loc=e.latLng.toJSON();if(e.placeId){e.stop();try{const {Place}=await google.maps.importLibrary('places');const p=new Place({id:e.placeId});await p.fetchFields({fields:['displayName','formattedAddress','location']});choose(p.displayName||'Valgt sted',p.location?p.location.toJSON():loc,p.formattedAddress);return;}catch{}}choose('Valgt punkt på kortet',loc);});}
$('search').onclick=()=>{clearTimeout(searchTimer);search();};$('query').addEventListener('input',()=>{clearTimeout(searchTimer);searchSerial++;if(!$('query').value.trim()){clearPins();$('matches').replaceChildren();$('searchStatus').textContent='';return;}if($('query').value.trim().length>=3)searchTimer=setTimeout(search,850);});$('query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(searchTimer);search();}});
$('go').onclick=()=>{$('route').click();};$('destination').addEventListener('input',()=>{selected=null;$('chosen').hidden=true;});
$('closeChosen').onclick=()=>{$('chosen').hidden=true;selected=null;$('destination').value='';if(selectionPin)selectionPin.setMap(null);selectionPin=null;};

if(!cfg.googleKey||/^INDS[AÆ]ET/i.test(cfg.googleKey.trim()))status('Udvikleren skal konfigurere Google-browsernøglen i config.js.');else{const s=document.createElement('script');s.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key:cfg.googleKey.trim(),callback:'initTruckMap',loading:'async',language:'da',libraries:'places',v:'weekly'});s.async=true;s.onerror=()=>status('Google-kort kunne ikke indlæses');status('Henter Google-kort…');renderTimer=setTimeout(()=>{if(!failed&&!map)status('Google-kortets callback svarede ikke.')},20000);document.head.append(s)}
