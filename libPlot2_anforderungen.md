# lib2 – Migrationsreferenz für olli2.de

## Verzeichnisstruktur

```
lib2/
├── math/
│   ├── interpolate.js     export default interp1_C(tx, vx, txNeu, debugName)
│   ├── derivation.js      export default derive(tx, vx, factor, dtMin, win="rect")
│   ├── lib_math.js        export default ch_mean(...channels)
│   ├── ch_diff.js         export default ch_diff(chA, chB)
│   ├── ch_mul.js          export default ch_mul(chA, chB)
│   ├── ch_rms.js          export default ch_rms(chA)
│   └── movingAverage.js   export default movingAverage(tx, vx, days=1)
└── ui/
    ├── makeBlock.js        export default makeBlock(blockClass, tx, vx, txLast, template?)
    ├── makeBlockIp.js      export default initBlockIp(blockClass)
    ├── makeBarChart.js     export default makeBarChart(id, cellVoltages)
    ├── zoomButton.js       export default initZoomButtons(containerId, plotClass, desiredMs, onZoomCb, onGetRange)
    │                       → gibt { initialDays, syncZoom } zurueck
    ├── exportData.js       export default initExport(className)
    ├── zeitreihenOpt.js    export default makeZeitreihenOpt(selectedPtnId?)
    └── time2String.js      export default time2String(millis)

dataStore.js
    export default createDataStore()
    → store.fetch({ channelNames, days, fun, onDone? })
    → store.update({ fun, points=3, intervalMinutes=5 })
```

---

## CSS – olli2.css (/css/olli2.css)

CSS-Variablen:
```css
--col-dark:  #042C53   /* dunkles Blau – Hintergrund aktiv */
--col-light: #B5D4F4   /* helles Blau – Raender, Schrift auf dunkel */
--col-mid:   #185FA5   /* mittleres Blau – Info-Text */
```

Verfuegbare Klassen:
- `.block1`       – KPI-Block horizontal (Wert links, Name/Info/Zeit rechts)
- `.blockIp`      – IP-Link-Block (gleiche Struktur wie block1)
- `.zoomButton`   – Zoom-Button, `.active` fuer aktiven Zustand
- `.sektion`      – Graph-Sektion mit `<h2>` Header und `.inner` Body
- `table`         – Tabellen-Styling

Block-HTML-Template (default in makeBlock.js):
```html
<div class="bVal">{val}</div>
<div class="bRight">
    <div class="bName">{name}</div>
    <div class="bInfo">{info}</div>
    <div class="bTime">{time}</div>
</div>
```

---

## dataStore – Verwendung

```js
import createDataStore from '/lib2/dataStore.js';

const store = createDataStore();

// channelNamesFun: echte DB-Channels die fun() als Rohquelle braucht
// NIEMALS berechnete Channel-Namen hier eintragen
const channelNamesFun = ['shellyHeizung_kWh', ...];

// fun.outputs: Channel-Namen die fun() berechnet (nie in DB)
// wird von channelNamesPlot()-Filter verwendet
const fun = function(tx, vx, txLast, isUpdate = false) {
    vx.berechneterChannel = derive(tx, vx.rohChannel, ...);

    if (isUpdate) {
        const ts = libPlot.getTimeState('libPlotCsv1');
        libPlot.SetMeasuringData('libPlotCsv1', tx, vx);
        if (ts) libPlot.setZoom('libPlotCsv1', ts.zoom.tMin, ts.zoom.tMax);
    } else {
        libPlot.SetMeasuringData('libPlotCsv1', tx, vx);
    }
    makeBlock('block1', tx, vx, txLast);
};
fun.outputs = new Set(['berechneterChannel', ...]);

// Direkt-Channels aus HTML-Plots automatisch ermitteln
// getChannels() gibt bereits bereinigte Namen zurueck (kein stripUnit noetig)
const channelNamesPlot = () => libPlot.getChannels('libPlotCsv1')
    .filter(n => !channelNamesFun.includes(n) && !fun.outputs.has(n));

const channelNames = [...new Set([...channelNamesFun, ...channelNamesPlot()])];

// Zoom initialisieren
const { initialDays, syncZoom } = initZoom(
    'zoomButtons', 'libPlotCsv1',
    10 * 24 * 3600 * 1000,
    (tMinReq) => libPlot.setZoom('libPlotCsv1', tMinReq),
    () => libPlot.getTimeState('libPlotCsv1').zoom
);

// Zoom-Button mit libPlot synchron halten via onZoomChange (kein setInterval mehr)
libPlot.configure('libPlotCsv1', {
    onZoomChange: function(ts) {
        syncZoom(ts.zoom.tMax - ts.zoom.tMin, ts.isFullRange);
    }
});

window.getChannels = function(days, onDone) {
    store.fetch({ channelNames, days, fun, onDone });
};

// initialer Load + zyklisches Update (3 Punkte alle 5 min)
window.getChannels(initialDays, function() {
    store.update({ fun, points: 3, intervalMinutes: 5 });
});
```

---

## autoChannels – virtuelle Channel-Namen

Der alte `getValuesInterp1.js`-Mechanismus kannte "autoChannels": virtuelle Channel-Namen
(z.B. `pAct_steca`) die zur Laufzeit in echte DB-Namen umgeschrieben wurden.

In lib2 gibt es diesen Mechanismus nicht. Stattdessen:
- `channelNamesFun` enthaelt nur echte DB-Namen
- `fun()` berechnet die virtuellen Channels explizit aus den Rohdaten
- `fun.outputs` listet alle berechneten Namen

Beispiel (aus netzReg):
```js
const channelNamesFun = [
    'steca_kW',                       // -> pAct_steca (berechnet)
    'EDL21_P_aktuell',                // -> pAct_edl21 (berechnet)
    'solarChargerA_pow',              // -> pSum_dcCharger (berechnet)
    'solarChargerB_pow',              // -> pSum_dcCharger (berechnet)
    'solarChargerA_vol',              // -> pSum_acCharger (berechnet)
    'solarChargerB_vol',              // -> pSum_acCharger (berechnet)
    'Meas_ads1115_A_iCurChargerSum',  // -> pSum_acCharger (berechnet)
    'Bat23_sumCap_prozent',           // -> bat23_sumCap (berechnet)
];

// in fun():
vx.pAct_steca = vx.steca_kW.map((x) => x * 1000);
vx.pAct_edl21 = vx.EDL21_P_aktuell.map((x) => x * 1000);
// ...

fun.outputs = new Set(['pAct_steca', 'pAct_edl21', 'pSum_dcCharger', ...]);
```

---

## actVals – Sondermechanismus fuer Einzelwerte

Manche Channels existieren nicht als Zeitreihe in der DB, sondern nur als Einzelwert
in `get_actVals.php` (Format: `{ "channelName": ["timestamp_ms", "value"] }`).

Typisches Anwendungsbeispiel: `acCharger_pSum_gt_0` – zeigt wie lange seit dem letzten
Update vergangen ist (Alter des Channels).

### HTML-Attribut `data-actvals`

Blocks die aus actVals kommen werden mit `data-actvals` markiert:

```html
<div class="makeBlock block1"
    channel="acCharger_pSum_gt_0"
    data-actvals
    fun="time2String(Date.now() - txRaw)">
</div>
```

- `data-actvals`: Signal fuer makeBlock.js, diesen Channel aus actVals zu holen
- `txRaw`: im `eval`-Scope verfuegbar – Timestamp des letzten actVals-Updates
- `vx`: im `eval`-Scope verfuegbar – der Wert selbst (falls benoetigt)
- `time2String`: im `eval`-Scope verfuegbar (in makeBlock.js importiert)

### makeBlock.js – actVals-Mechanismus

makeBlock.js erkennt `data-actvals`-Blocks, fetcht `get_actVals.php` einmalig pro
Aufruf, und befuellt `actValsTs[ch]` / `actValsVx[ch]` (module-level Maps).
Der Fetch erfolgt bei jedem makeBlock-Aufruf neu (kein Cache) damit store.update
aktuelle Timestamps bekommt.

Diese Channels werden **nicht** in `channelNamesFun` eingetragen – sie kommen
nicht aus der DB-Zeitreihe.

---

## HTML-Grundgeruest

```html
<!DOCTYPE HTML>
<html>
<head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="/css/olli2.css">
    <title>Seitenname</title>
</head>
<body>

    <!-- KPI-Bloecke -->
    <div class="makeBlock block1" name="Bezeichnung" channel="channelName" fun="vx.toFixed(1) + ' Einheit'"></div>
    <div class="makeBlock block1" name="Zeit seit letzter Ablesung" channel="deltaT"></div>

    <!-- actVals-Block: Alter des Channels anzeigen -->
    <div class="makeBlock block1" channel="acCharger_pSum_gt_0" data-actvals fun="time2String(Date.now() - txRaw)"></div>

    <!-- IP-Bloecke -->
    <div class="blockIp" name="geraetename"></div>

    <!-- Zoom-Buttons -->
    <div id="zoomButtons"></div>

    <!-- Graph-Sektion mit festen Y-Limits -->
    <div class="libPlotCsv1"
         data-ymin="0" data-ymax="80"
         channels="channel1, channel2 [Einheit]"
         style="width:100%;height:250px;"></div>

    <!-- Graph-Sektion ohne Y-Limits (Auto-Y) -->
    <div class="libPlotCsv1"
         channels="channel3, channel4 [W]"
         style="width:100%;height:250px;"></div>

    <!-- Export -->
    <div>
        <input type="button" class="ButtonExport" value="ExportCsv">
        <input type="button" class="ButtonExport" value="ExportJson">
        <div id="selectedPtn"></div>
    </div>

    <script type="module">
        import libPlot           from 'https://lesim.de/libPlot/libPlot2.mjs';
        import createDataStore   from '/lib2/dataStore.js';
        import makeBlock         from '/lib2/ui/makeBlock.js';
        import initBlockIp       from '/lib2/ui/makeBlockIp.js';
        import initZoom          from '/lib2/ui/zoomButton.js';
        import initExport        from '/lib2/ui/exportData.js';
        import makeZeitreihenOpt from '/lib2/ui/zeitreihenOpt.js';
        import movingAverage     from '/lib2/math/movingAverage.js';
        // import derive         from '/lib2/math/derivation.js';  // falls benoetigt

        libPlot.configure('libPlotCsv1', makeZeitreihenOpt('selectedPtn'));
        initExport('libPlotCsv1');
        initBlockIp('blockIp');

        // ... (siehe dataStore-Beispiel oben)
    </script>
</body>
</html>
```

**Wichtig:** Kein `<script src="/lib/jquery.min.js">` mehr – jQuery wird nicht benoetigt.

---

## libPlot2 API – Mapping von alt zu neu

| Alt (libPlot.js) | Neu (libPlot2.mjs) |
|---|---|
| `import from 'lesim.de/lib/libPlot.js'` | `import from 'lesim.de/libPlot/libPlot2.mjs'` |
| `libPlot.SetMeasuringData(cls, tx, vx)` | `libPlot.SetMeasuringData(cls, tx, vx)` – gleich |
| `libPlot.zoomAllClassDiagramsX(cls, tMin)` | `libPlot.setZoom(cls, tMin)` |
| `libPlot.getTimeMinMax()` | `libPlot.getTimeState(cls).zoom` → `{ tMin, tMax }` |
| `libPlot.getTimeAxis()` | `libPlot.getTimeState(cls).extent` → `{ tMin, tMax }` |
| `libPlot.getChannelNamesFromArea(cls)` | `libPlot.getChannels(cls)` – bereits bereinigt, kein `.map(stripUnit)` noetig |
| `libPlot.exportDataCsv()` | `libPlot.exportDataCsv(cls)` |
| `libPlot.exportDataObject()` | `libPlot.exportDataObject(cls)` |
| `window.flotOpt1 = {...}` | `libPlot.configure(cls, makeZeitreihenOpt('selectedPtn'))` |
| `window.flotFun1 = function(flotObj){...}` | `libPlot.configure(cls, { onAfterDraw: function(plotCtx){...} })` |
| HTML-Attribut `flotOptions="flotOpt1"` | entfaellt – configure() gilt global fuer die Klasse |
| HTML-Attribut `flotFun="flotFun1"` | entfaellt – `onAfterDraw` in configure() |
| `setInterval` fuer Zoom-Sync | `onZoomChange` in configure() |

### plotCtx in onAfterDraw

```js
libPlot.configure('libPlotCsv1', {
    onAfterDraw: function(plotCtx) {
        if (plotCtx.divIndex === 2) {  // 0-basiert
            plotCtx.setYLimits(0, 6);
        }
    }
});
```

### getTimeState()

```js
const ts = libPlot.getTimeState('libPlotCsv1');
// ts.zoom        → { tMin, tMax }  – aktueller Zoom
// ts.extent      → { tMin, tMax }  – voller Datenbereich
// ts.isFullRange → boolean
```

### onZoomChange statt setInterval-Polling

```js
libPlot.configure('libPlotCsv1', {
    onZoomChange: function(ts) {
        syncZoom(ts.zoom.tMax - ts.zoom.tMin, ts.isFullRange);
    }
});
```

### Zoom-Rettung in fun() bei isUpdate

```js
const fun = function(tx, vx, txLast, isUpdate = false) {
    // ...
    if (isUpdate) {
        const ts = libPlot.getTimeState('libPlotCsv1');
        libPlot.SetMeasuringData('libPlotCsv1', tx, vx);
        if (ts) libPlot.setZoom('libPlotCsv1', ts.zoom.tMin, ts.zoom.tMax);
    } else {
        libPlot.SetMeasuringData('libPlotCsv1', tx, vx);
    }
};
```

### Y-Limits via data-Attribut

Feste Y-Achsen-Grenzen werden direkt im HTML-Div gesetzt:

```html
<div class="libPlotCsv1" data-ymin="48" data-ymax="57" channels="..." style="..."></div>
```

- Gelten beim ersten Render
- Werden durch Rubber-Band-Zoom oder Pinch-Zoom auf Auto-Y umgeschaltet
- Rechtsklick setzt alle Plots auf Auto-Y
- Doppelklick (Zoom-Reset) stellt data-ymin/ymax **nicht** wieder her

### initExport braucht className

```js
initExport('libPlotCsv1');
```

---

## movingAverage – gleitender Mittelwert

```js
import movingAverage from '/lib2/math/movingAverage.js';

// zeitgewichteter gleitender Mittelwert, Fenster 1 Tag (default)
vx.bat23_sumCap_mean1d = movingAverage(tx, vx.bat23_sumCap);

// anderes Fenster:
vx.temp_mean3d = movingAverage(tx, vx.temp, 3);  // 3 Tage
```

Ersetzt den alten seitenspezifischen `_calc_Mittelwert.js`.
Unterschied zur alten Implementierung: zeitgewichtet (Trapezregel) statt punktgewichtet,
NaN-sicher, gibt Array gleicher Laenge wie tx zurueck.

---

## Wichtige Konventionen

- **Ein `export default` pro JS-Datei**
- **Kein `try/catch` in `requestAnimationFrame`-Bloecken** – Fehler muessen in die Konsole
- **Kein `logUsage`** – jsLogger ist komplett entfernt
- **Kein jQuery** – auch kein `<script src="/lib/jquery.min.js">`
- **ASCII-only** in JS-Kommentaren
- **`channelNames`** enthaelt nur echte DB-Namen, nie berechnete
- **`fun.outputs`** ist die einzige Stelle wo berechnete Channel-Namen stehen
- **`isUpdate=true`** in `fun()` → Zoom nach SetMeasuringData wiederherstellen
- **`txLast`** kommt von dataStore – echter Messzeitstempel je Channel (vor Interpolation)
- **`--col-dark/light/mid`** fuer alle Farben verwenden, keine Hex-Werte direkt in HTML
- **Block-only Channels** (nicht in Plot-Divs) muessen explizit in `channelNamesFun` stehen
- **`data-actvals`** fuer Channels die aus `get_actVals.php` kommen (nicht DB-Zeitreihe)

---

## BMS-spezifisch (bat/bms/)

```
bat/bms/lib/
├── fetchOneBms.js    export default async fetchOneBms(bmsName, days)
│                     → { bmsName, tx, vx, skipChannels }
├── parseBms.js       export default parseBms(vx, ix, jsonStr)
├── makeCurrent2.js   export default makeCurrent2(tx, uptime, totalCur_As)
└── mergeBms.js       export default mergeBms(results, tx2)
                      → chan (alle interpolierten + berechneten Channels)
```

BMS-Daten kommen aus `get_db1.php?table=OrObj` (nicht `wetter_erl1`).
JSON-Blob pro Zeile – kein `get_channel_2vec.php`.
PHP-seitiges Alias-Mapping: `bms_2020-12-12` → `bms-2020-12-12_actValues` mit Fallback.