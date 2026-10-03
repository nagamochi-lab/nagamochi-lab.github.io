'use strict';
const $=id=>document.getElementById(id),stations=window.FUEL_STATIONS;
const colors=['#278477','#3f7ba6','#7966a1','#b77c35','#e6681a'];
const fuelNames={regular:'レギュラー',premium:'ハイオク',diesel:'軽油'},defaults={regular:170,premium:180,diesel:150};
const q=new URLSearchParams(location.search);
const bounded=(k,d,min,max,step=1)=>{const r=q.get(k);if(r===null||r.trim()==='')return d;const v=Number(r);return Number.isFinite(v)?Math.min(max,Math.max(min,Number((Math.round(v/step)*step).toFixed(2)))):d};
let fuel=Object.hasOwn(fuelNames,q.get('fuel'))?q.get('fuel'):'regular';
const state={station:stations.some(s=>s.id===q.get('station'))?q.get('station'):'shinmisato',liters:bounded('liters',40,10,70,1),efficiency:bounded('efficiency',15,5,30,.1),price:bounded('price',defaults[fuel],50,400),factor:[1,1.3,1.5].includes(Number(q.get('factor')))?Number(q.get('factor')):1.3};
let mode=q.get('mode')==='circle'?'circle':'road',selected=[4,6,8,10,12].includes(Number(q.get('selected')))?Number(q.get('selected')):10;
let map,marker,locationMarker,accuracyCircle,circles=[],labels=[],roadLayer,roadData,loadedKey='',loadedStation='',fitAfterRoad=false,roadFrame=0,requestController,requestNumber=0,busy=false;
const manualPrices={[fuel]:state.price},getStation=()=>stations.find(s=>s.id===state.station),rows=()=>FuelModel.calculate(state),roadKey=()=>FuelRoads.key(getStation(),rows());
function destination(lat,lng,km,bearing){const r=km/6371,b=bearing*Math.PI/180,p=lat*Math.PI/180,l=lng*Math.PI/180,p2=Math.asin(Math.sin(p)*Math.cos(r)+Math.cos(p)*Math.sin(r)*Math.cos(b));return [p2*180/Math.PI,(l+Math.atan2(Math.sin(b)*Math.sin(r)*Math.cos(p),Math.cos(r)-Math.sin(p)*Math.sin(p2)))*180/Math.PI]}
const select=$('station');stations.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=`${s.name}（${s.region}）`;select.append(o)});select.value=state.station;
for(const k of ['liters','efficiency','price','factor'])$(k).value=state[k];
const legend=$('legend');FuelModel.differences.forEach((d,i)=>{const b=document.createElement('button');b.style.setProperty('--ring',colors[i]);b.dataset.diff=d;b.innerHTML=`<b>${d}</b><small>円</small><span class="distance"></span>`;b.setAttribute('aria-label',`${d}円安い場合を強調`);b.onclick=()=>{selected=d;render()};legend.append(b)});
function showError(t){$('map-error').hidden=!t;$('map-error').textContent=t||''}
if(window.L){const s=getStation();map=L.map('map',{zoomControl:false,scrollWheelZoom:false,preferCanvas:true}).setView([s.lat,s.lng],10);L.control.zoom({position:'topright'}).addTo(map);L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);let tileErrors=0;tiles.on('tileerror',()=>{if(++tileErrors>=3)showError('地図を読み込めませんでした。通信状態を確認してください。')});tiles.on('tileload',()=>{tileErrors=0;showError('')});for(let i=4;i>=0;i--)circles[i]=L.circle([s.lat,s.lng],{radius:1000,color:colors[i],fillColor:colors[i],interactive:false}).addTo(map);for(let i=0;i<5;i++)labels[i]=L.tooltip({permanent:true,direction:'center',className:'ring-label',opacity:1}).setLatLng([s.lat,s.lng]).setContent('').addTo(map);marker=L.marker([s.lat,s.lng],{icon:L.divIcon({className:'station-pin',html:'C',iconSize:[34,34],iconAnchor:[17,17]})}).addTo(map).bindTooltip(`コストコ ${s.name}`,{direction:'bottom',offset:[0,15]});}else showError('地図を読み込めませんでした。ページを再読み込みしてください。');
function ready(){return mode==='road'&&loadedKey===roadKey()&&!!roadData}
function render(){
 const data=rows(),s=getStation(),roadsReady=ready(),shapeVisible=mode==='road'&&loadedStation===state.station&&!!roadLayer;
 $('liters-out').innerHTML=`${state.liters}<small>L</small>`;$('efficiency-out').innerHTML=`${state.efficiency}<small>km/L</small>`;
 for(const k of ['liters','efficiency'])$(k).style.setProperty('--fill',`${(state[k]-Number($(k).min))/(Number($(k).max)-Number($(k).min))*100}%`);
 $('price-summary').textContent=`${fuelNames[fuel]} · ${state.price}円/L`;
 $('price-link').href=s.id==='shinmisato'?'https://gogo.gs/shop/1199000196':`https://gogo.gs/search?kw=${encodeURIComponent(`コストコ ${s.name}`)}`;
 $('price-link').textContent=`gogo.gsで${s.name}の価格を${s.id==='shinmisato'?'確認':'探す'} ↗`;
 document.querySelectorAll('[data-fuel]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.fuel===fuel)));
 $('mode-road').setAttribute('aria-pressed',String(mode==='road'));$('mode-circle').setAttribute('aria-pressed',String(mode==='circle'));
 $('distance-caption').textContent=(roadsReady||shapeVisible)?'道路距離・片道':'直線距離の目安';
 data.forEach((r,i)=>{const b=legend.children[i];b.setAttribute('aria-pressed',String(selected===r.difference));b.querySelector('.distance').textContent=`${((roadsReady||shapeVisible)?r.roadKm:r.radiusKm).toFixed(1)}km`;if(map){circles[i].setLatLng([s.lat,s.lng]).setRadius(r.radiusKm*1000).setStyle({weight:selected===r.difference?2.5:1.5,fillOpacity:.025,dashArray:mode==='road'?'5 5':null});labels[i].setLatLng(destination(s.lat,s.lng,r.radiusKm,55+i*5)).setContent(`${r.difference}円`);if(shapeVisible){map.removeLayer(circles[i]);map.removeLayer(labels[i])}else{if(!map.hasLayer(circles[i]))circles[i].addTo(map);if(!map.hasLayer(labels[i]))labels[i].addTo(map)}}});
 if(roadLayer){if(shapeVisible){if(!map.hasLayer(roadLayer))roadLayer.addTo(map);roadLayer.setStyle(f=>roadStyle(f))}else map.removeLayer(roadLayer)}
 const active=data.find(r=>r.difference===selected);$('result-copy').innerHTML=`<b>${selected}円/L安い</b>とき<br>給油で浮くお金`;$('saving').innerHTML=`${active.saving.toLocaleString()}<small>円</small>`;
 $('map-badge').textContent=roadsReady?'道路距離で計算 · 片道':shapeVisible?'道路距離を更新中':mode==='circle'?'直線距離の目安':busy?'道路を計算中 · 直線は参考':'直線距離の目安を表示中';
 $('map-note').textContent=(roadsReady||shapeVisible)?'色の内側が目安です。コストコへの片道の道路距離から、帰りも同じ距離として試算しています。通行料金は含みません。':`直線距離は、道路の遠回りを${state.factor}倍と仮定した目安です。実際の道順や川・橋は反映していません。`;
 if(marker)marker.setLatLng([s.lat,s.lng]).setTooltipContent(`コストコ ${s.name}`);
 $('update-road').hidden=mode!=='road'||roadsReady||busy;$('update-road').disabled=busy;
 return data;
}
function roadStyle(f){const i=FuelModel.differences.indexOf(f.properties.difference);return {color:colors[i],fillColor:colors[i],weight:f.properties.difference===selected?2.7:1.4,fillOpacity:.09}}
function fit(){if(!map)return;if(ready()&&roadLayer){map.fitBounds(roadLayer.getBounds(),{padding:[25,30],maxZoom:13,animate:false});return}const s=getStation(),r=rows().at(-1).radiusKm;map.fitBounds([[destination(s.lat,s.lng,r,180)[0],destination(s.lat,s.lng,r,270)[1]],[destination(s.lat,s.lng,r,0)[0],destination(s.lat,s.lng,r,90)[1]]],{padding:[25,30],maxZoom:13,animate:false})}
function invalidate(){requestNumber++;busy=mode==='road';$('road-message').textContent=mode==='road'?'道路距離の範囲を更新しています…':'';render()}
function scheduleRoads(){if(mode!=='road')return;cancelAnimationFrame(roadFrame);roadFrame=requestAnimationFrame(()=>updateRoads())}
async function updateRoads(){
 if(!map||mode!=='road')return;
 requestController=new AbortController();const id=++requestNumber,k=roadKey(),station=getStation();busy=true;$('road-message').textContent='道路距離の範囲を更新しています…';render();
 try{
  const data=await FuelRoads.load(station,rows(),requestController.signal);
  if(mode!=='road'||state.station!==station.id)return;
  roadData=data;loadedKey=k;loadedStation=state.station;
  const collection={...data,features:[...data.features].sort((a,b)=>b.properties.difference-a.properties.difference)};
  if(roadLayer){roadLayer.clearLayers();roadLayer.addData(collection)}
  else roadLayer=L.geoJSON(collection,{style:roadStyle,onEachFeature:(feature,layer)=>layer.bindTooltip(`${feature.properties.difference}円/L安い場合 · 片道約${feature.properties.requestedKm.toFixed(1)}km`)}).addTo(map);
  if(id===requestNumber)$('road-message').textContent='';
  render();
 }catch(e){
  if(id!==requestNumber||e.name==='AbortError')return;
  loadedKey='';loadedStation='';$('road-message').textContent=e.message+' 直線距離の目安を表示しています。';
 }finally{if(id===requestNumber){busy=false;render();if(fitAfterRoad){fitAfterRoad=false;fit()}}}
}
for(const k of ['liters','efficiency','price','factor'])$(k).addEventListener('input',()=>{if(!$(k).validity.valid||$(k).value==='')return;state[k]=Number($(k).value);if(k==='price'){manualPrices[fuel]=state.price;$('price-status').textContent='入力した単価で計算します。実売価格は店舗でご確認ください。'}if(k!=='factor'){invalidate();scheduleRoads()}else render()});
for(const k of ['liters','efficiency','factor'])$(k).addEventListener('change',()=>{if(busy&&mode==='road')fitAfterRoad=true;else fit()});
$('price').addEventListener('blur',()=>{if(!$('price').validity.valid||$('price').value===''){$('price').value=state.price;toast('単価は50〜400円/Lで入力してください')}});
select.addEventListener('change',()=>{state.station=select.value;loadedKey='';loadedStation='';fitAfterRoad=true;invalidate();fit();scheduleRoads()});
document.querySelectorAll('[data-fuel]').forEach(b=>b.addEventListener('click',()=>{fuel=b.dataset.fuel;state.price=manualPrices[fuel]??defaults[fuel];$('price').value=state.price;$('price-status').textContent='仮または手入力の単価です。店舗の実売価格ではありません。';invalidate();scheduleRoads();if(mode==='circle')fit()}));
$('mode-road').onclick=()=>{mode='road';fitAfterRoad=true;render();updateRoads()};$('mode-circle').onclick=()=>{mode='circle';requestNumber++;requestController?.abort();busy=false;$('road-message').textContent='';render();fit()};$('update-road').onclick=updateRoads;$('fit').onclick=fit;
let locationPending=false;
$('locate').onclick=()=>{
 if(locationPending)return;
 if(!window.isSecureContext||!navigator.geolocation){toast('現在地はHTTPSのSafariやChromeで利用できます。');return}
 if(!map){toast('先に地図を読み込んでください。');return}
 locationPending=true;$('locate').disabled=true;$('location-message').hidden=false;$('location-message').textContent='現在地を確認しています。ブラウザに許可を求められたら「許可」を選んでください。';
 navigator.geolocation.getCurrentPosition(position=>{locationPending=false;$('locate').disabled=false;const {latitude,longitude,accuracy}=position.coords;if(locationMarker)map.removeLayer(locationMarker);if(accuracyCircle)map.removeLayer(accuracyCircle);locationMarker=L.marker([latitude,longitude],{icon:L.divIcon({className:'user-dot',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map).bindTooltip('現在地');accuracyCircle=L.circle([latitude,longitude],{radius:accuracy,color:'#387fe2',weight:1,fillOpacity:.07,interactive:false}).addTo(map);$('locate').setAttribute('aria-pressed','true');map.fitBounds(L.latLngBounds([[latitude,longitude],[getStation().lat,getStation().lng]]).pad(.2),{maxZoom:14,animate:false});$('location-message').textContent=`現在地を表示しました（測位精度 約${Math.round(accuracy).toLocaleString()}m）。位置は保存・共有しません。`;},error=>{locationPending=false;$('locate').disabled=false;const messages={1:'現在地の利用が許可されていません。利用する場合はブラウザのサイト設定をご確認ください。',2:'現在地を取得できませんでした。電波の届く場所でお試しください。',3:'現在地の取得が時間内に終わりませんでした。もう一度お試しください。'};$('location-message').textContent=messages[error.code]||'現在地を取得できませんでした。';},{enableHighAccuracy:false,timeout:12000,maximumAge:60000});
};
let toastTimer;function toast(t){$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4000)}
// 今の条件を復元できる共有URL（現在地は含めない）
function shareUrl(){const u=new URL(location.href);u.search='';u.hash='';for(const[k,v]of Object.entries({...state,fuel,mode,selected}))u.searchParams.set(k,String(v));return u}
// Xの投稿画面を、選んだ店舗・条件・片道の上限つきで開く
$('share-x').onclick=()=>{const s=getStation(),r=rows().find(r=>r.difference===selected);const text=`コストコ${s.name}まで給油に行くと、もとが取れる？\n給油${state.liters}L・燃費${state.efficiency}km/Lなら、近所より${selected}円/L安いとき片道約${r.roadKm.toFixed(1)}kmまで元が取れる計算でした。\n#コストコ給油元取りマップ`;const intent=new URL('https://x.com/intent/post');intent.searchParams.set('text',text);intent.searchParams.set('url',shareUrl().href);window.open(intent.href,'_blank','noopener')};
$('share').onclick=async()=>{const u=shareUrl();try{if(navigator.share)await navigator.share({title:'コストコ給油元取りマップ',text:`コストコ${getStation().name}まで給油に行くと、もとが取れる？`,url:u.href});else if(navigator.clipboard){await navigator.clipboard.writeText(u.href);toast('条件付きのURLをコピーしました')}else window.prompt('URLをコピーしてください',u.href)}catch(e){if(e.name!=='AbortError')window.prompt('URLをコピーしてください',u.href)}};
render();fit();if(mode==='road'){fitAfterRoad=true;updateRoads()}
if(document.modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});try{Promise.resolve(document.modelContext.registerTool({name:'configure_fuel_estimate',title:'給油の試算条件を変更',description:'給油量・燃費・単価を変更します。道路範囲も自動で更新します。',inputSchema:{type:'object',properties:{liters:{type:'integer',minimum:10,maximum:70,multipleOf:1},efficiency:{type:'number',minimum:5,maximum:30,multipleOf:0.1},price:{type:'integer',minimum:50,maximum:400}},required:['liters','efficiency','price'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||Object.keys(input).some(k=>!['liters','efficiency','price'].includes(k))||!Number.isInteger(input.liters)||input.liters<10||input.liters>70||!Number.isFinite(input.efficiency)||Math.abs(input.efficiency*10-Math.round(input.efficiency*10))>1e-6||input.efficiency<5||input.efficiency>30||!Number.isInteger(input.price)||input.price<50||input.price>400)throw new Error('入力範囲を確認してください');Object.assign(state,input);for(const k of Object.keys(input))$(k).value=input[k];manualPrices[fuel]=state.price;invalidate();scheduleRoads();if(mode==='circle')fit();return {conditions:{...state,fuel},ranges:rows()};}},{signal:lifecycle.signal})).catch(()=>{})}catch{}}
