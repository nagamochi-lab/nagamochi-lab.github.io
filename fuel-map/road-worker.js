/* OSM/Valhalla distance grid, local marching-squares contours. No user location. */
// TIFF decoding here is serial; no nested worker pool is used.
if(typeof self.Worker==='undefined')self.Worker=class {constructor(){throw new Error('Nested workers are not used')}};
importScripts('vendor/geotiff-2.1.3.js','vendor/d3-array-3.2.4.min.js','vendor/d3-contour-4.0.2.min.js');
const API='https://valhalla1.openstreetmap.de/isochrone';
const CLIENT='nagamochi-lab-fuel-map-prototype';
const grids=new Map();
let lastStart=0,networkController;
function requestBody(station,maxKm){return {locations:[{lat:station.lat,lon:station.lng}],costing:'auto',costing_options:{auto:{shortest:true}},contours:[{distance:maxKm}],reverse:true,format:'geotiff'}}
async function decode(buffer,station,maxKm){
 const tiff=await GeoTIFF.fromArrayBuffer(buffer),image=await tiff.getImage();
 const width=image.getWidth(),height=image.getHeight(),origin=image.getOrigin(),resolution=image.getResolution();
 const desc=String(image.fileDirectory.ImageDescription||'');
 if(image.geoKeys?.GeographicTypeGeoKey!==4326||image.getSamplesPerPixel()!==1||!/Distance \(10m\)/i.test(desc)||width*height>2000000||!origin.slice(0,2).every(Number.isFinite)||!resolution.slice(0,2).every(Number.isFinite)||resolution[0]<=0||resolution[1]>=0)throw new Error('道路距離データの形式を確認できませんでした。');
 const raster=(await image.readRasters({samples:[0]}))[0],nodata=image.getGDALNoData(),values=new Float32Array(width*height);
 let valid=0;for(let i=0;i<values.length;i++){const value=raster[i];if(Number.isFinite(value)&&value>=0&&value!==nodata){values[i]=-value/100;valid++}else values[i]=-1000000}
 if(!valid)throw new Error('この場所の道路データがありません。');
 return {width,height,origin,resolution,values,maxKm,station};
}
async function loadGrid(station,maxKm){
 for(const grid of grids.values())if(grid.station.id===station.id&&grid.maxKm>=maxKm)return grid;
 let buffer;
 // 片道60kmまでは全店舗の同梱格子を使う。同梱がない・60km超のときだけ経路APIへ
 if(maxKm<=60){try{const response=await fetch(`data/${station.id}-60km.tif`);if(response.ok)buffer=await response.arrayBuffer()}catch(e){}}
 if(!buffer){
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,1200-(Date.now()-lastStart))));lastStart=Date.now();
  networkController=new AbortController();const timer=setTimeout(()=>networkController?.abort(),30000);
  try{
   const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','X-Client-Id':CLIENT},body:JSON.stringify(requestBody(station,maxKm)),signal:networkController.signal});
   if(!response.ok)throw new Error(response.status===429?'道路の読み込みが混み合っています。':'道路データに接続できませんでした。');
   if(!response.headers.get('content-type')?.includes('tiff'))throw new Error('道路距離データを取得できませんでした。');
   buffer=await response.arrayBuffer();
  }catch(e){if(e.name==='AbortError')throw new Error('道路の読み込みを中断しました。');throw e}
  finally{clearTimeout(timer);networkController=null}
 }
 const grid=await decode(buffer,station,maxKm);grids.set(`${station.id}:${maxKm}`,grid);if(grids.size>4)grids.delete(grids.keys().next().value);return grid;
}
function contours(grid,rows){
 const {width,height,origin,resolution,station}=grid,outer=rows.at(-1).roadKm;
 // Crop to the possible straight-line extent. The buffer accounts for grid interpolation.
 const latSpan=(outer+3)/110,lonSpan=latSpan/Math.cos(station.lat*Math.PI/180);
 const x0=Math.max(0,Math.floor((station.lng-lonSpan-origin[0])/resolution[0]));
 const x1=Math.min(width,Math.ceil((station.lng+lonSpan-origin[0])/resolution[0]));
 const y0=Math.max(0,Math.floor((station.lat+latSpan-origin[1])/resolution[1]));
 const y1=Math.min(height,Math.ceil((station.lat-latSpan-origin[1])/resolution[1]));
 const w=x1-x0,h=y1-y0,values=new Float32Array(w*h);
 for(let y=0;y<h;y++)values.set(grid.values.subarray((y+y0)*width+x0,(y+y0)*width+x1),y*w);
 const generator=d3.contours().size([w,h]).smooth(true);
 const features=rows.map(row=>{
  const shape=generator.contour(values,-row.roadKm);
  if(!shape.coordinates.length)throw new Error('範囲が狭いため、道路の境界を表示できませんでした。');
  const coordinates=shape.coordinates.map(polygon=>polygon.map(ring=>ring.map(([x,y])=>[origin[0]+(x+x0)*resolution[0],origin[1]+(y+y0)*resolution[1]])));
  return {type:'Feature',properties:{difference:row.difference,requestedKm:row.roadKm},geometry:{type:'MultiPolygon',coordinates}};
 });
 return {type:'FeatureCollection',features,source:'Valhalla / OpenStreetMap',resolutionMeters:Math.round(Math.abs(resolution[1])*111320),gridKm:grid.maxKm};
}
self.onmessage=async({data})=>{
 if(data.type==='cancelFetch'){networkController?.abort();return}
 if(data.type!=='solve')return;
 try{
  const outer=data.rows.at(-1).roadKm;
  if(!Number.isFinite(outer)||outer<=0||outer>200)throw new Error('道路の表示は片道200kmまでです。');
  const maxKm=outer<=60?60:outer<=120?120:200;
  const grid=await loadGrid(data.station,maxKm);
  self.postMessage({id:data.id,result:contours(grid,data.rows)});
 }catch(e){self.postMessage({id:data.id,error:e.message==='Failed to fetch'?'道路データに接続できませんでした。':e.message})}
};
