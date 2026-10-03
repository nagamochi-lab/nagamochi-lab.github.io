# 道路距離の格子データ

ファイル: `<店舗id>-60km.tif`（全27倉庫店。店舗idは `../stations.js` の id）
取得日: 2026-10-03（新三郷を含む全店舗）
提供: Valhalla / FOSSGIS, https://valhalla1.openstreetmap.de/
道路データ: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright
データ利用: Open Database License (ODbL), https://opendatacommons.org/licenses/odbl/

各倉庫店の代表座標（`../stations.js` の lat/lng）に向かう、自動車の道路距離格子。給油所の入口座標ではありません。

公開デモへの負荷を避けるため、各店舗1回ずつ、20秒以上の間隔をあけて取得しました。閲覧時は片道60kmまでこの同梱データだけで描画し、経路APIには通信しません。片道60kmを超える条件のときだけ、閲覧者のブラウザから経路APIへ問い合わせます。

POST /isochrone に以下を送信して得たGeoTIFFをそのまま保存しています（lat/lonは店舗ごと）。

{"locations":[{"lat":35.86113,"lon":139.86415}],"costing":"auto","costing_options":{"auto":{"shortest":true}},"contours":[{"distance":60}],"reverse":true,"format":"geotiff"}

EPSG:4326、UInt16、距離単位10m、NoData=65535、PackBits。格子間隔0.002度（緯度方向で約223m）。元データの単位・座標は実装で検証します。到達圏の輪郭を描くための補間格子であり、各画素中心への実ルートの保証ではありません。

店舗の追加・移転時は、同じ条件でその店舗の格子を取得し直してください。
