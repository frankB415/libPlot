# libPlot – API-Dokumentation

> Bibliothek zum Plotten von Messdaten auf Basis von [Flot 4.2](https://www.flotcharts.org/) und jQuery.

**Bezugsquelle**

```js
import libPlot from 'https://lesim.de/lib/libPlot.js';
```

---

## Abhängigkeiten

| Modul | Zweck |
|---|---|
| `jquery.min.js` | jQuery-Basis |
| `flot420/jquery.flot.js` | Flot-Kern |
| `flot420/jquery.flot.navigate.js` | Zoom & Pan |
| `flot420/jquery.flot.selection.js` | Auswahlrechteck |
| `flot420/jquery.flot.crosshair.js` | Fadenkreuz |
| `flot420/jquery.flot.tooltip.js` | Tooltip |
| `flot420/jquery.flot.time.js` | Zeitachse |
| `flot420/jquery.flot.legend.js` | Legende |
| `flatten.js` | JSON-Flatten-Hilfsfunktion |
| `jsLogger.js` | Usage-Tracking |

---

## Schnellstart

```html
<!-- 1. Plot-Container im HTML anlegen -->
<div id="myPlot" class="libPlotCsv" channels="kanal1, kanal2[mV]"
     style="width:100%; height:300px;"></div>

<!-- 2. Daten übergeben und Plots initialisieren -->
<script type="module">
  import libPlot, { SetMeasuringData } from './libPlot.js';

  const timeAxis = [0, 100, 200, 300]; // UTC-Millisekunden
  const data = {
    kanal1: [1.0, 2.5, 1.8, 3.0],
    kanal2: [0.0, 0.5, 1.0, 0.8],
  };

  SetMeasuringData('libPlotCsv', timeAxis, data);
</script>
```

---

## HTML-Attribute der Plot-Container

| Attribut | Pflicht | Beschreibung |
|---|---|---|
| `class` | ja | CSS-Klassenname, der an `SetMeasuringData` übergeben wird (z. B. `libPlotCsv`) |
| `id` | nein | Wird automatisch vergeben (`autoId_1`, `autoId_2`, …), falls leer |
| `channels` | ja | Komma- oder Semikolon-getrennte Kanalnamen (siehe Kanal-Syntax) |
| `flotOptions` | nein | Name eines globalen JS-Objekts (`window[name]`), das die Standard-Flot-Optionen überschreibt |
| `flotFun` | nein | Name einer globalen Callback-Funktion (`window[name]`), die nach dem Zeichnen aufgerufen wird |

### Kanal-Syntax

```
channels="kanal1, -kanal2, kanal3[mV], kanal4[kA]"
```

| Präfix / Suffix | Wirkung |
|---|---|
| `-kanalname` | Vorzeichen invertieren (Faktor −1) |
| `[Einheit]` | Automatische Einheitenumrechnung (siehe Einheitentabelle) |

### Unterstützte Einheiten

| Einheit | Faktor auf SI-Basiswert |
|---|---|
| `[mX]` | × 1 000 |
| `[uX]` | × 1 000 000 |
| `[kX]` | × 0,001 |
| `[MX]` | × 0,000 001 |
| `[%]` | × 100 |
| `[Grad]` | × 180 / π |
| `[min]` | ÷ 60 |
| `[h]` | ÷ 3 600 |
| `[d]` | ÷ 86 400 |
| `[Wh]`, `[Ah]` | ÷ 3 600 |
| `[sec]`, `[A]`, `[V]`, `[W]`, `[Hz]`, `[Ohm]`, `[pu]`, `[VAr]`, `[Ws]`, `[GradC]` | × 1 (kein Umbau) |

---

## Exportierte Funktionen (named exports)

### `SetMeasuringData(className, timeAxis, measuringData)`

Übergibt Messdaten an die Bibliothek und initialisiert alle Plot-Container der angegebenen CSS-Klasse.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `className` | `string` | CSS-Klassenname der Plot-Container (ohne Punkt) |
| `timeAxis` | `number[]` | Zeitwerte in **UTC-Millisekunden** (`new Date() * 1`) |
| `measuringData` | `Object<string, number[]>` | Schlüssel = Kanalname, Wert = Datenwerte (gleiche Länge wie `timeAxis`) |

**Rückgabe:** `true` wenn alle Plots erfolgreich erzeugt wurden, sonst `false`.

```js
SetMeasuringData('libPlotCsv', timeAxis, {
  spannung: [230, 231, 229],
  strom:    [  5,   6,   5],
});
```

---

### `getChannelNamesFromArea(area)`

Liest alle Kanalnamen aus den `channels`-Attributen aller Elemente mit der CSS-Klasse `area` aus.
Bereinigt automatisch: Leerzeichen, Einheiten `[...]`, Vorzeichen `-`, Duplikate, zu kurze Namen (< 3 Zeichen).

| Parameter | Typ | Beschreibung |
|---|---|---|
| `area` | `string` | CSS-Klassenname (ohne Punkt) |

**Rückgabe:** `string[]` – Liste eindeutiger Kanalnamen.

```js
import { getChannelNamesFromArea } from './libPlot.js';
const channels = getChannelNamesFromArea('libPlotCsv');
// z. B. ["spannung", "strom", "leistung"]
```

---

### `invertPlotChannels(datin, baseName)`

Wandelt ein Array von (ggf. geschachtelten) Objekten in ein Kanal-Dictionary um.
Nützlich, um strukturierte Messdaten in das `measuringData`-Format zu überführen.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `datin` | `Object[]` | Array von Messobjekten (darf verschachtelt sein, wird per `JSON.flatten` abgeflacht) |
| `baseName` | `string` | Präfix für alle erzeugten Kanalnamen |

**Rückgabe:** `Object<string, number[]>` – Flaches Kanal-Dictionary.

```js
import { invertPlotChannels } from './libPlot.js';
const data = invertPlotChannels([{a: 1, b: {c: 2}}, {a: 3, b: {c: 4}}], 'mes');
// => { "mes.a": [1,3], "mes.b.c": [2,4] }
```

---

### `exportDataCsv()`

Exportiert die aktuell **sichtbaren** (nicht ausgezoomten) Messdaten als CSV-String.

**Rückgabe:** `{ csv: string, tMin: number }`

| Feld | Beschreibung |
|---|---|
| `csv` | Semikolon-getrennter CSV-Text, erste Spalte `tx` (Zeit) |
| `tMin` | Startzeitpunkt des exportierten Bereichs (UTC-ms) |

```js
import { exportDataCsv } from './libPlot.js';
const { csv, tMin } = exportDataCsv();
// CSV herunterladen:
const blob = new Blob([csv], { type: 'text/csv' });
const url = URL.createObjectURL(blob);
```

---

### `exportDataObject()`

Exportiert die aktuell **sichtbaren** Messdaten als strukturiertes JavaScript-Objekt.

**Rückgabe:** `{ dat: Array<[number, Object]>, tMin: number }`

| Feld | Beschreibung |
|---|---|
| `dat` | Array von `[timestamp, {kanalname: wert, …}]`-Tupeln |
| `tMin` | Startzeitpunkt des exportierten Bereichs |

```js
import { exportDataObject } from './libPlot.js';
const { dat } = exportDataObject();
dat.forEach(([t, values]) => console.log(t, values));
```

---

### `setDebugLevel(level)`

Setzt den Debug-Ausgabe-Level der Bibliothek.

| Parameter | Typ | Wert |
|---|---|---|
| `level` | `number` | `0` = aus, `>1` = ausführlich |

---

## Default-Export – Objekt-API

```js
import libPlot from './libPlot.js';
```

| Methode / Property | Signatur | Beschreibung |
|---|---|---|
| `SetMeasuringData` | `(className, timeAxis, data)` | Siehe named export |
| `GetMeasuringData` | `() → Object` | Gibt das aktuelle `measuringData`-Objekt zurück |
| `getTimeAxis` | `() → {timeAxis, tMin, tMax}` | Gesamte Zeitachse sowie Minimum und Maximum |
| `getTimeMinMax` | `() → {tMin, tMax}` | Aktuellen Zoom-Bereich (oder Gesamtbereich) zurückgeben |
| `getAllPlots` | `() → Object` | Internes `plots`-Objekt (Schlüssel = div-ID) |
| `getChannelNamesFromArea` | `(area) → string[]` | Siehe named export |
| `makePlotDS` | `(channelName, timeAxis, data, fak?) → Object` | Erzeugt ein Flot-Datensatz-Objekt |
| `zoomAllClassDiagramsX` | `(className, tMin, tMax)` | X-Achse aller Plots einer Klasse programmatisch zoomen |
| `readAllChannelNames` | `(className?) → string[]` | Alle Kanalnamen aus DOM-Elementen lesen (intern) |
| `exportDataCsv` | `() → {csv, tMin}` | Siehe named export |
| `exportDataObject` | `() → {dat, tMin}` | Siehe named export |
| `setDebugLevel` | `(level)` | Siehe named export |

---

### `makePlotDS(channelName, timeAxis, data, fak?)`

Erzeugt ein Flot-kompatibles Datensatz-Objekt für einen Kanal.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `channelName` | `string` | Anzeigename / Label der Serie |
| `timeAxis` | `number[]` | UTC-Millisekunden |
| `data` | `number[]` | Messwerte (gleiche Länge wie `timeAxis`) |
| `fak` | `number` (optional) | Multiplikationsfaktor, Standard `1` |

**Rückgabe:** `{ label: string, data: [number, number][] }` – Flot-Datensatz, nach Zeitachse sortiert.

```js
const ds = libPlot.makePlotDS('spannung', timeAxis, voltageArray, 0.001); // V → kV
```

---

### `zoomAllClassDiagramsX(className, tMin, tMax)`

Setzt den X-Achsen-Zoom **aller** Plots einer CSS-Klasse gleichzeitig und passt die Y-Achse automatisch an.
Mit `undefined` für `tMin`/`tMax` wird der Auto-Zoom wiederhergestellt.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `className` | `string` | CSS-Klassenname (ohne Punkt) |
| `tMin` | `number \| undefined` | Startzeitpunkt (UTC-ms) |
| `tMax` | `number \| undefined` | Endzeitpunkt (UTC-ms) |

```js
// Zoom auf 10 Minuten ab Epoch
libPlot.zoomAllClassDiagramsX('libPlotCsv', Date.now() - 600_000, Date.now());

// Zoom zurücksetzen
libPlot.zoomAllClassDiagramsX('libPlotCsv', undefined, undefined);
```

---

## Interaktionen (Maus / Touch)

| Geste | Verhalten |
|---|---|
| Linke Maustaste ziehen | Rechteck auswählen → Zoom auf Auswahl (X+Y), alle Plots der Klasse synchron |
| Rechte Maustaste klicken | Y-Achsen-Autozoom; hält die Maus über einer Kurve: entfernt diese Kurve aus dem Plot |
| Doppelklick | Zoom zurücksetzen (X-Achse vollständig, Y-Achse auto) |
| Maus bewegen | Crosshair in allen Plots der Klasse synchron; Tooltip zeigt Label, t und val |
| Touch (Pinch/Swipe) | Zoom & Pan via `jquery.flot.touchNavigate` |

---

## Standard-Flot-Optionen

Die Bibliothek setzt folgende Standardwerte (können per `flotOptions`-Attribut überschrieben werden):

```js
{
  grid:      { hoverable: true },
  tooltip:   { show: true },          // Format: "Label : t=X.XXX val=Y.YYY"
  xaxis:     { font: { size: 10 } },
  yaxis:     { font: { size: 10 } },
  series:    { lines: { show: true, lineWidth: 2 }, points: { show: false }, shadowSize: 0 },
  selection: { mode: "xy" },
  crosshair: { mode: "xy" },
  legend:    { show: true, position: "nw", noColumns: 2 },
}
```

---

---

## Praxisbeispiele

### Beispiel 1 – Simulationsergebnisse anzeigen (LeSim / ASM-Simulation)

Mehrere Plot-Container der gleichen CSS-Klasse (`libPlotCsv1`) zeigen unterschiedliche Kanäle synchron. Alle Plots reagieren gemeinsam auf Zoom und Crosshair.

```html
<!-- Fluss- und Drehzahlregler -->
<div class="libPlotCsv1" style="width:100%;height:200px;"
     channels="FO_1.psih_pu, FO_1.uModIsUsed, ASM01.psih_dq_pu.getAbsV(), ASM01.p_n_pu, FO_1.w1_pu">
</div>

<!-- Stromvektorregler Id -->
<div class="libPlotCsv1" style="width:100%;height:200px;"
     channels="PiId.ref, PiId.act, PiId.ctrl">
</div>

<!-- Freiwerdezeiten mit Einheitenumrechnung: interne Werte in sec → Anzeige in msec -->
<div class="libPlotCsv1" style="width:100%;height:150px;" channels="
    B26C_01.D1.freiwerdeZeit [msec],
    B26C_01.D2.freiwerdeZeit [msec],
    B26C_01.D3.freiwerdeZeit [msec]">
</div>
```

```js
import { SetMeasuringData } from './libPlot.js';

// Messdaten aus der Simulation übergeben und alle libPlotCsv1-Divs initialisieren
SetMeasuringData('libPlotCsv1', timeAxis, measuringData);
```

---

### Beispiel 2 – Kanalnamen automatisch aus dem DOM lesen

Bevor Daten vom Server abgefragt werden, liest `getChannelNamesFromArea` alle benötigten Kanalnamen direkt aus den `channels`-Attributen der Plot-Container.
Zusätzliche Kanäle, die für Berechnungen benötigt werden, aber nicht geplottet werden, können manuell ergänzt werden.

```js
import libPlot from 'https://lesim.de/lib/libPlot.js';

// Alle Kanalnamen aus den Plot-Divs lesen
let channelNames = libPlot.getChannelNamesFromArea('libPlotCsv1');

// Zusätzliche Hilfskanäle (für Berechnungen, nicht direkt geplottet)
channelNames.push('heizungTempVorlauf_ch1');
channelNames.push('shellyHeizung_kWh');
channelNames.push('shellyWWWaermepumpe_energy');

// Kanäle vom Server laden
getVal({ channelNames, fun: processData, days: 10 });
```

---

### Beispiel 3 – Daten aufbereiten und dann plotten (Heizungsmonitoring)

Rohdaten werden vor der Übergabe an `SetMeasuringData` umbenannt, abgeleitet (Leistung aus Energie) und bereinigt.

```js
let processData = function (tx, vx) {

    // Kanäle umbenennen
    vx.Vorlauf_GradC   = vx.heizungTempVorlauf_ch1;
    vx.Ruecklauf_GradC = vx.heizungTempVorlauf_ch3;
    vx.Raum_GradC      = vx.heizungTempVorlauf_ch2;
    vx.Aussen_GradC    = vx.erl_austemp2;

    // Leistung aus Energieintegral ableiten (kWh → W, Mittelung über 1 min bzw. 24 h)
    vx.shellyHeizung_W      = derive(tx, vx.shellyHeizung_kWh, 3600 * 1000, 60 * 1000);
    vx.shellyHeizung_W_mean = derive(tx, vx.shellyHeizung_kWh, 3600 * 1000, 24 * 60 * 60 * 1000);

    // Ausreißer kappen
    vx.shellyHeizung_W      = vx.shellyHeizung_W.map(v => v > 300 ? 300 : v);
    vx.shellyHeizung_W_mean = vx.shellyHeizung_W_mean.map(v => v > 150 ? 150 : v);

    // Wärmepumpe: täglichen Energieverbrauch [kWh/d] mit verschiedenen Mittelfenstern
    vx.shellyWWWaermepumpe_kWh_d  = derive(tx, vx.shellyWWWaermepumpe_energy, 1 * 3600 * 24 / 1000, 24 * 60 * 60 * 1000);
    vx.shellyWWWaermepumpe_kWh_d7 = derive(tx, vx.shellyWWWaermepumpe_energy, 1 * 3600 * 24 / 1000, 7 * 24 * 60 * 60 * 1000, 'rect');

    // Plots erzeugen
    libPlot.SetMeasuringData('libPlotCsv1', tx, vx);
};
```

---

### Beispiel 4 – Benutzerdefinierte Flot-Optionen per HTML-Attribut

Ein globales Optionsobjekt (`window.flotOpt1`) und eine Callback-Funktion (`window.flotFun1`) werden per Attribut an einzelne Plot-Container gebunden.

```html
<div class="libPlotCsv1"
     flotOptions="flotOpt1"
     flotFun="flotFun1"
     channels="shellyHeizung_betriebstunden_d, shellyHeizung_betriebstunden_14d"
     style="width:100%;height:180px;">
</div>
```

```js
// Y-Achse fest begrenzen (z. B. 0–6 h/d Brennerbetrieb)
window.flotFun1 = function (flotObj) {
    flotObj.getOptions().yaxes[0].min = 0;
    flotObj.getOptions().yaxes[0].max = 6;
    flotObj.setupGrid();
    flotObj.draw();
};
```

---

### Beispiel 5 – Einheitenumrechnung im `channels`-Attribut

Kanäle können direkt im HTML mit einer Zieleinheit versehen werden.
Die Bibliothek ermittelt den Faktor automatisch (siehe Einheitentabelle).

```html
<!-- Interner Wert in Sekunden → Anzeige in Minuten -->
<div class="libPlotCsv1"
     channels="zirkPumpe_zeit [min], zirkPumpe_zeit3 [min]"
     style="width:100%;height:180px;">
</div>

<!-- Interner Wert in Sekunden → Anzeige in Millisekunden -->
<div class="libPlotCsv1"
     channels="B26C_01.D1.freiwerdeZeit [msec], B26C_01.D3.freiwerdeZeit [msec]"
     style="width:100%;height:150px;">
</div>

<!-- Kanal negiert und in Prozent angezeigt -->
<div class="libPlotCsv1"
     channels="-wirkungsgrad [%]"
     style="width:100%;height:150px;">
</div>
```

---

### Beispiel 6 – Programmatischer X-Zoom

```js
// Letzten Tag einzoomen
const now  = Date.now();
const dayMs = 24 * 60 * 60 * 1000;
libPlot.zoomAllClassDiagramsX('libPlotCsv1', now - dayMs, now);

// Zoom zurücksetzen
libPlot.zoomAllClassDiagramsX('libPlotCsv1', undefined, undefined);
```

---

## Hinweise

- Die **Zeitachse muss in UTC-Millisekunden** angegeben werden (`(new Date()) * 1`).
- Die Datenpunkte werden auf maximal **2 200 Punkte** pro Kanal reduziert (`reduceData`), um die Rendering-Performance zu optimieren.
- Divs ohne `id` erhalten beim Initialisieren automatisch eine ID (`autoId_1`, `autoId_2`, …).
- Divs mit Höhe 0 werden auf **120 px** gesetzt.
- Das Kontextmenü wird im gesamten Dokument deaktiviert (rechte Maustaste = Autozoom).
