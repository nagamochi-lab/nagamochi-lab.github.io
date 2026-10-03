(function(root){
const differences=[4,6,8,10,12];
function calculate({liters,efficiency,price,factor}){if(![liters,efficiency,price,factor].every(Number.isFinite)||liters<=0||efficiency<=0||price<=0||factor<1)throw new Error('計算条件を確認してください');return differences.map(difference=>({difference,saving:difference*liters,roadKm:difference*liters*efficiency/(2*price),radiusKm:difference*liters*efficiency/(2*price*factor)}));}
const api={calculate,differences};if(typeof module!=='undefined')module.exports=api;else root.FuelModel=api;
})(typeof window!=='undefined'?window:globalThis);
