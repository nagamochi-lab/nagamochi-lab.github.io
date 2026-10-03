/* The worker owns the road grid; slider changes keep only the latest pending job. */
(function(root){
 let worker,active,pending,serial=0;
 const aborted=()=>new DOMException('Aborted','AbortError');
 function key(station,rows){return `grid-v1:${station.id}:${rows.map(r=>r.roadKm.toFixed(4)).join(',')}`}
 function pump(){
  if(active||!pending)return;
  const job=pending;pending=null;
  if(job.signal?.aborted){job.reject(aborted());pump();return}
  active=job;worker.postMessage({type:'solve',id:job.id,station:job.station,rows:job.rows});
 }
 function load(station,rows,signal){
  if(!root.Worker)return Promise.reject(new Error('このブラウザでは道路表示を利用できません。'));
  if(!worker){
   worker=new Worker('road-worker.js');
   worker.onmessage=({data})=>{if(!active||active.id!==data.id)return;const job=active;active=null;if(job.signal?.aborted)job.reject(aborted());else if(data.error)job.reject(new Error(data.error));else job.resolve(data.result);pump()};
   worker.onerror=()=>{const e=new Error('道路データを読み込めませんでした。');active?.reject(e);pending?.reject(e);active=pending=null;worker.terminate();worker=null};
  }
  return new Promise((resolve,reject)=>{
   if(signal?.aborted){reject(aborted());return}
   pending?.reject(aborted());pending={id:++serial,station,rows,signal,resolve,reject};
   if(active&&active.station.id!==station.id)worker.postMessage({type:'cancelFetch'});
   pump();
  });
 }
 root.FuelRoads={load,key};
})(window);
