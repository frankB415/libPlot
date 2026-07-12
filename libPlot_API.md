# libPlot2 – API-Dokumentation

> Canvas-basierte Bibliothek zum Plotten von Zeitreihen-Messdaten. Kein jQuery, kein
> Flot, keine externen Abhaengigkeiten. Der Tick-Algorithmus fuer die Zeitachse ist
> konzeptionell an Flot angelehnt (MIT-Lizenz, IOLA/Ole Laursen), das Rendering selbst
> ist eine eigene Canvas-2D-Implementierung.

**Bezugsquelle**

```js
// ES-Modul (empfohlen)
import libPlot from 'https://lesim.de/libPlot/libPlot2.mjs';
```

```html
<!-- Alternativ als klassisches Script-Tag -->
<script src="https://lesim.de/libPlot/libPlot2.js"></script>
<!-- stellt window.libPlot bereit -->
```

---

## Schnellstart

```html
<!-- 1. Plot-Container im HTML anlegen -->
<div class="libPlotCsv" channels="kanal1, kanal2[mV]"
     style="width:100%; height:300px;"></div>

<!-- 2. Daten übergeben und Plots initialisieren -->
<script type="module">
  import libPlot from 'https://lesim.de/libPlot/libPlot2.mjs';

  const timeAxis = [0, 100, 200, 300]; // UTC-Millisekunden
  const data = {
    kanal1: [1.0, 2.5, 1.8, 3.0],
    kanal2: [0.0, 0.5, 1.0, 0.8],
  };

  libPlot.SetMeasuringData('libPlotCsv', timeAxis, data);
</script>
```

Beim ersten `SetMeasuringData`-Aufruf fuer eine CSS-Klasse werden alle passenden Divs
automatisch mit einem `<canvas>` sowie Overlay-Elementen fuer Legende, Crosshair,
Cursor-Punkt und Rubber-Band-Auswahl bestueckt (`position:relative` wird dabei
automatisch auf das Div gesetzt).

---

## HTML-Attribute der Plot-Container

| Attribut | Pflicht | Beschreibung |
|---|---|---|
| `class` | ja | CSS-Klassenname, der an alle API-Funktionen übergeben wird (z. B. `libPlotCsv`) |
| `id` | nein | Wird automatisch vergeben (`lp2_auto_{className}_{index}`), falls leer |
| `channels` | ja | Komma-getrennte Kanalnamen (siehe Kanal-Syntax) |
| `data-ymin` / `data-ymax` | nein | Feste Y-Achsen-Grenzen fuer den ersten Render (siehe Abschnitt "Feste Y-Achsen-Grenzen") |

Weitere HTML-Attribute gibt es nicht – jegliche Konfiguration läuft ausschließlich über
`libPlot.configure(className, cfg)` und gilt global für alle Divs einer Klasse (siehe
unten).

### Kanal-Syntax

```
channels="kanal1, -kanal2, kanal3[mV], kanal4[kA]"
```

| Präfix / Suffix | Wirkung |
|---|---|
| `-kanalname` | Vorzeichen invertieren (Faktor −1) |
| `[Einheit]` | Automatische Einheitenumrechnung (siehe Einheitentabelle) |

Vorzeichen und Einheit lassen sich kombinieren, z. B. `-wirkungsgrad[%]`.

### Unterstützte Einheiten

Zuerst wird die Einheit gegen eine Liste konkreter Namen geprüft; erst wenn keiner davon
passt, greift die generische Präfix-Regel anhand des ersten Zeichens.

| Einheit | Faktor auf SI-Basiswert |
|---|---|
| `[Grad]` | × 180 / π |
| `[GradC]` | × 1 (kein Umbau, nur Label) |
| `[Wh]` | ÷ 3 600 |
| `[kWh]` | ÷ 3 600 000 |
| `[MWh]` | ÷ 3 600 000 000 |
| `[Ah]` | ÷ 3 600 |
| `[kAh]` | ÷ 3 600 000 |
| `[h]` | ÷ 3 600 |
| `[d]` | ÷ 86 400 |
| `[%]` | × 100 |
| `[min]` | ÷ 60 |
| `[mV]`, `[mA]` | × 1 000 |

Generische Präfix-Regel (greift nur, wenn die Einheit **nicht** oben in der Liste steht,
z. B. `[kV]`, `[kW]`, `[MW]`, `[uA]`, `[nF]`):

| Erstes Zeichen der Einheit | Faktor |
|---|---|
| `k` | × 0,001 |
| `M` | × 0,000 001 |
| `m` | × 1 000 |
| `u` | × 1 000 000 |
| `n` | × 1 000 000 000 |

Einheiten ohne Treffer in beiden Regeln (z. B. `[sec]`, `[A]`, `[V]`, `[W]`, `[Hz]`,
`[Ohm]`, `[pu]`, `[VAr]`, `[Ws]`) bekommen Faktor `1` – der Einheiten-Text wird trotzdem
als Label an die Legende angehängt.

---

## Exportierte Funktionen

```js
import libPlot from 'https://lesim.de/libPlot/libPlot2.mjs';
// libPlot.configure / SetMeasuringData / setZoom / getTimeState /
// getChannels / exportDataCsv / exportDataObject / setDebugLevel
```

Alle Funktionen hängen ausschließlich am Default-Export `libPlot` – es gibt keine
separaten Named Exports.

### `configure(className, cfg)`

Setzt globale Optionen für alle Plots einer CSS-Klasse. Mehrfache Aufrufe für dieselbe
Klasse werden additiv gemerged (`Object.assign`), überschreiben also nur die angegebenen
Keys.

| Key | Signatur | Beschreibung |
|---|---|---|
| `zoomChangeHook` | `(ts) => void` | Wird nach jedem Zoom-Wechsel aufgerufen (Rubber-Band, Pinch, Doppelklick, `setZoom()`). `ts` = Rückgabe von `getTimeState()`. |
| `onAfterDraw` | `(plotCtx) => void` | Wird nach jedem einzelnen Plot-Redraw aufgerufen, siehe `plotCtx` unten. |
| `fmtTimeHook` | `(t, tMin, tMax) => string` | Überschreibt die X-Achsen-Tick-Labels. Default zeigt lokale Kalenderzeit, Format abhängig vom Zoom-Span (Sekunden bis Jahr). |
| `fmtLegendTimeHook` | `(t) => string` | Überschreibt die Zeit-Kopfzeile in der Legende beim Hovern. Default: `"Mo, 05.01.2026 14:23"` (Wochentag, Datum, Uhrzeit, immer lokal). |
| `getColor` | `(channelName, index) => string \| falsy` | Eigene Kurvenfarbe. `falsy` → Fallback auf die Standard-Palette (8 Farben, rotierend). |
| `getLabel` | `(channelName, unit) => string` | Eigenes Legenden-Label. Die Einheit `[unit]` wird automatisch angehängt, falls im Label noch nicht enthalten. |
| `legendPosition` | `'tl' \| 'tr' \| 'bl' \| 'br'` | Ecke für die Legende innerhalb des Plot-Divs (Default `'tl'`). |
| `reductionMode` | `'auto' \| 'none' \| 'nearest' \| 'minmax'` | Erzwingt eine Downsampling-Strategie statt automatischer Wahl (siehe "Datenreduktion"). |

Wird `onZoomChange` als Key übergeben, wirft `configure()` einen `Error` mit dem
Hinweis, stattdessen `zoomChangeHook` zu verwenden – der Key wird also nicht still
ignoriert.

```js
libPlot.configure('libPlotCsv1', {
    zoomChangeHook: ts => console.log(ts.isFullRange ? 'Vollbereich' : ts.zoom),
    onAfterDraw: plotCtx => {
        if (plotCtx.divIndex === 1) plotCtx.setYLimits(0, 3);
    },
    getLabel: ch => ({ Vorlauf_GradC: 'Vorlauf' }[ch] ?? ch),
});
```

---

### `SetMeasuringData(className, tx, vx)`

Übergibt Messdaten an die Bibliothek und initialisiert bzw. aktualisiert alle
Plot-Container der angegebenen CSS-Klasse.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `className` | `string` | CSS-Klassenname der Plot-Container (ohne Punkt) |
| `tx` | `number[]` | Zeitwerte in **UTC-Millisekunden**, streng monoton steigend |
| `vx` | `Object<string, number[]>` | Schlüssel = Kanalname, Wert = Datenwerte (gleiche Länge wie `tx`) |

**Rückgabe:** keine. Bei ungültigen Daten wird nur geloggt und der Aufruf bricht ab
(siehe "Diagnostics").

```js
libPlot.SetMeasuringData('libPlotCsv', timeAxis, {
  spannung: [230, 231, 229],
  strom:    [  5,   6,   5],
});
```

Beim erneuten Aufruf für eine bereits initialisierte Klasse (z. B. zyklisches Update)
bleibt der aktuelle Zoom **nicht** automatisch erhalten – dafür vorher `getTimeState()`
merken und nach `SetMeasuringData` per `setZoom()` wiederherstellen (siehe Beispiel
"Zoom-Rettung bei Updates").

---

### `setZoom(className, tMin, tMax)`

Setzt den X-Achsen-Zoom aller Plots einer CSS-Klasse und passt die Y-Achse automatisch
an (sofern nicht per `data-ymin`/`data-ymax` fixiert). Löst `zoomChangeHook` aus.

| Parameter | Typ | Beschreibung |
|---|---|---|
| `className` | `string` | CSS-Klassenname |
| `tMin` | `number \| undefined` | Startzeitpunkt (UTC-ms) |
| `tMax` | `number \| undefined` | Endzeitpunkt (UTC-ms) |

- Beide `undefined` → Zoom-Reset auf den vollen Datenbereich.
- Nur einer der beiden `undefined` → dieser wird auf den jeweiligen Datenrand gesetzt.
- `tMin > tMax` → Aufruf wird ignoriert, Warnung in der Konsole.
- Ohne vorherigen `SetMeasuringData`-Aufruf für die Klasse: no-op.

```js
// Zoom auf 10 Minuten ab jetzt
libPlot.setZoom('libPlotCsv', Date.now() - 600_000, Date.now());

// Zoom zurücksetzen
libPlot.setZoom('libPlotCsv');
```

---

### `getTimeState(className)`

**Rückgabe:** `{ zoom, extent, isFullRange }`

| Feld | Beschreibung |
|---|---|
| `zoom` | `{ tMin, tMax }` – aktueller Zoom-Bereich (Kopie von `extent`, falls kein Zoom aktiv) |
| `extent` | `{ tMin, tMax }` – erster/letzter Zeitstempel der kompletten Rohdaten |
| `isFullRange` | `boolean` – `true`, wenn die Zoom-Spanne auf ±60 s an die volle Datenspanne herankommt |

```js
const ts = libPlot.getTimeState('libPlotCsv');
console.log(ts.zoom, ts.extent, ts.isFullRange);
```

---

### `getChannels(className)`

Liest alle Kanalnamen aus den `channels`-Attributen aller Elemente der CSS-Klasse.
Bereinigt automatisch: Leerzeichen, Einheiten `[...]`, Vorzeichen `-`, Duplikate.

**Rückgabe:** `string[]` – Liste eindeutiger Kanalnamen.

```js
const channels = libPlot.getChannels('libPlotCsv1');
// z. B. ["spannung", "strom", "leistung"]
```

---

### `exportDataCsv(className)`

Exportiert die aktuell **sichtbaren** (gezoomten) Messdaten als CSV-String.

**Rückgabe:** `{ csv: string, tMin: number }`

| Feld | Beschreibung |
|---|---|
| `csv` | **Komma-getrennter** CSV-Text, erste Spalte `tx` (Zeit), danach alle in Plots verwendeten Kanäle. Werte auf 6 signifikante Stellen gerundet, fehlende Werte als leerer String, nicht-numerische als `'NaN'`. |
| `tMin` | Startzeitpunkt des exportierten Bereichs (UTC-ms) |

```js
const { csv, tMin } = libPlot.exportDataCsv('libPlotCsv');
const blob = new Blob([csv], { type: 'text/csv' });
const url = URL.createObjectURL(blob);
```

---

### `exportDataObject(className)`

Exportiert die aktuell **sichtbaren** Messdaten als strukturiertes JavaScript-Objekt.

**Rückgabe:** `{ dat: { tx: { unit, val }, channels: { [name]: { unit, val } } }, tMin }`

| Feld | Beschreibung |
|---|---|
| `dat.tx` | `{ unit: 'ms_utc', val: number[] }` – Zeitachse |
| `dat.channels[name]` | `{ unit: string, val: (number\|null)[] }` – Werte bereits mit dem Anzeige-Skalierungsfaktor des Kanals multipliziert, auf 6 signifikante Stellen gerundet; nicht-numerische Werte werden zu `null` |
| `tMin` | Startzeitpunkt des exportierten Bereichs |

Enthalten sind nur Kanäle, die tatsächlich in mindestens einem Plot-Div der Klasse
verwendet werden (Einheit/Skalierung stammen vom ersten Plot, der den Kanal referenziert).

```js
const { dat } = libPlot.exportDataObject('libPlotCsv');
console.log(dat.tx.val, dat.channels.spannung.val);
```

---

### `setDebugLevel(level)`

Setzt den Debug-Ausgabe-Level der Bibliothek.

| Parameter | Typ | Wert |
|---|---|---|
| `level` | `number` | `0` = aus (Default), `>0` = ausführlich (Timing pro `SetMeasuringData`- und Draw-Aufruf) |

Unabhängig vom Debug-Level loggt jeder `SetMeasuringData`-Aufruf immer eine kurze
Zusammenfassung (Klassenname, Punktanzahl, Datumsbereich, Kanalanzahl, Anzahl gefundener
Probleme aus dem Sanity-Check).

---

## plotCtx (Parameter von `onAfterDraw`)

| Member | Signatur | Beschreibung |
|---|---|---|
| `divIndex` | `number` | 0-basierter Index des Plots innerhalb der Klasse |
| `channels` | `string[]` | Kanalnamen (ohne Einheit/Vorzeichen) dieses Plots |
| `setYLimits(mn, mx)` | `(number, number) => void` | Fixiert beide Y-Grenzen für den nächsten Redraw |
| `setYMin(mn)` / `setYMax(mx)` | `(number) => void` | Setzt nur eine der beiden Grenzen |
| `resetYLimits()` | `() => void` | Löscht fixe Grenzen wieder, zurück auf Auto-Range |
| `redraw()` | `() => void` | Erzwingt sofortigen Redraw nur dieses Plots |

`setYLimits`/`setYMin`/`setYMax` werden während eines laufenden
Rechtsklick-Autozooms ignoriert, damit `onAfterDraw` diesen nicht überschreibt.

```js
libPlot.configure('libPlotCsv1', {
    onAfterDraw: function (plotCtx) {
        if (plotCtx.divIndex === 2) {
            plotCtx.setYLimits(0, 6);
        }
    }
});
```

---

## Feste Y-Achsen-Grenzen (`data-ymin`/`data-ymax`)

```html
<div class="libPlotCsv1" data-ymin="48" data-ymax="57" channels="..." style="..."></div>
```

- Gelten nur beim ersten Render.
- Rubber-Band-Zoom, Pinch-Zoom oder Rechtsklick schalten die betroffenen Plots dauerhaft
  auf Auto-Y um (`plot.yMin`/`plot.yMax` werden auf `null` gesetzt).
- Ein Doppelklick (X-Zoom-Reset) stellt `data-ymin`/`data-ymax` **nicht** wieder her –
  die Y-Achse bleibt im zuletzt aktiven Modus (fix oder auto).

---

## Interaktionen (Maus / Touch)

| Geste | Verhalten |
|---|---|
| Linke Maustaste ziehen (≥ 5 px) | Rechteck-Zoom auf X **und** Y, alle Plots der Klasse synchron; schaltet betroffene Plots auf Auto-Y |
| Rechte Maustaste klicken | Y-Achsen-Autozoom für **alle** Plots der Klasse (kein Kontextmenü); es wird dabei keine Kurve entfernt |
| Doppelklick | X-Zoom-Reset auf vollen Datenbereich; Y-Achse bleibt unverändert |
| Maus bewegen | Gestrichelte Crosshair-Linie synchron über alle Plots der Klasse; im gehoverten Plot markiert je ein Cursor-Punkt den Messwert jedes sichtbaren Kanals; Legende (aller Plots) zeigt zusätzlich Zeitstempel-Kopfzeile plus Wert je Kanal, im gehoverten Plot wird zudem der Y-mäßig cursor-nächste Kanal fett hervorgehoben |
| Maus verlässt den Plot | Crosshair und Cursor-Punkt verschwinden, Legende zeigt wieder nur die Labels ohne Werte |
| Klick auf Legenden-Eintrag | Blendet die zugehörige Kurve ein/aus (durchgestrichen, 30 % Deckkraft wenn ausgeblendet); Y-Achse wird bei jedem Umschalten neu autoskaliert, sofern nicht fix per `data-ymin`/`data-ymax` |
| Pinch (2 Finger) | X-Zoom rein/raus um den Pinch-Mittelpunkt; schaltet auf Auto-Y |
| Swipe horizontal (1 Finger) | Pan der X-Achse; rein vertikales Wischen wird ignoriert (kein Scroll-Hijacking) |
| Doppel-Tap | X-Zoom-Reset (wie Doppelklick) |

Das Kontextmenü ist nur innerhalb der jeweiligen Plot-Canvas deaktiviert (nicht global
im gesamten Dokument).

Ein `.lp2-tooltip`-Div wird pro Plot zwar im DOM angelegt (Styling-Hook für eigenes CSS),
wird von der Bibliothek selbst aber nicht befüllt – der Werte-Readout beim Hovern läuft
komplett über die Legende (Kopfzeile + Wert je Kanal), nicht über eine schwebende
Tooltip-Box.

---

## Datenreduktion (Downsampling)

Pro Plot wird die Zielpunktzahl an der tatsächlichen Canvas-Breite in Pixeln
(inkl. `devicePixelRatio`) ausgerichtet, nicht an einem festen Limit:

| Modus | Bedingung (`auto`) | Verhalten |
|---|---|---|
| `none` | Verhältnis Datenpunkte/Canvas-Breite ≤ 1 | 1:1, kein Downsampling |
| `nearest` | Verhältnis > 1 und ≤ 10 | Nearest-Sample pro Pixel-Bucket |
| `minmax` | Verhältnis > 10 | Min- und Max-Wert pro Pixel-Bucket (2 Punkte je Bucket, damit Spitzen erhalten bleiben) |

Der Modus lässt sich über `configure(cls, { reductionMode: '...' })` erzwingen, z. B. für
Tests mit `'none'` bei kleinen Datensätzen. Die Auflösung skaliert automatisch mit der
tatsächlichen Render-Breite, es gibt kein festes Punktlimit.

---

## Diagnostics (Sanity-Check)

Jeder `SetMeasuringData`-Aufruf prüft die übergebenen Daten, bevor gezeichnet wird:

- **Fatal** (Abbruch, `console.error`, nichts wird gezeichnet): `tx` ist kein Array oder
  leer; `vx` ist kein Objekt.
- **Warnungen** (Zeichnen läuft trotzdem weiter, `console.warn` + Zähler):
  - Kanal in `vx` ist kein Array, oder seine Länge weicht von `tx.length` ab.
  - Kein einziger in Plots verwendeter Kanalname kommt in `vx` vor.
  - Ein konkreter, in einem Plot verwendeter Kanalname fehlt in `vx`.
  - Stichproben (erster, mittlerer, letzter Index) von `tx`: nicht-endliche Zahl, nicht
    streng monoton steigend, oder wirkt zu klein für einen Unix-ms-Zeitstempel
    (Schwelle `t < 315e9`, ca. Jahr 1980 – Schutz gegen versehentlich in Sekunden statt
    Millisekunden übergebene Zeitachsen).
  - Dieselben Stichproben je Kanal: Wert vorhanden, aber kein `number`.
- Am Ende wird immer (unabhängig vom Debug-Level) eine einzeilige Zusammenfassung
  geloggt: Klassenname, Punktanzahl, Datumsbereich (`tMin` → `tMax`), Kanalanzahl,
  Anzahl gefundener Probleme.

---

## Styling

Es gibt keinen generischen "Options-Passthrough" mehr wie bei Flot – die
Canvas-Zeichnung ist fest verdrahtet, folgende Punkte sind darüber hinaus per CSS bzw.
`configure()` anpassbar:

| Was | Wie |
|---|---|
| Legenden-Hintergrund/Text/Rahmen | CSS-Variablen `--lp2-legend-bg`, `--lp2-legend-color`, `--lp2-legend-border` auf dem Plot-Div bzw. einem Elternelement |
| Kurvenfarben | `configure(cls, { getColor })` |
| Legenden-Labels | `configure(cls, { getLabel })` |
| Legenden-Position | `configure(cls, { legendPosition })` |
| Schriftgrößen (Achsen, Legende) | Nicht konfigurierbar; skalieren automatisch um Faktor 1,2 auf Viewports < 1024 px Breite |

Feste Innenabstände (Plot-Padding: links 52 px, rechts 12 px, oben 10 px, unten 28 px,
jeweils mit `devicePixelRatio` skaliert) sind aktuell **nicht** über `configure()`
anpassbar.

Standard-Kurvenpalette (8 Farben, rotierend nach Kanal-Index):

```
#1f77b4  #ff7f0e  #2ca02c  #d62728  #9467bd  #8c564b  #e377c2  #7f7f7f
```

---

## Sonstiges Verhalten

- **Zeitachse in UTC-Millisekunden** (`(new Date()) * 1`).
- Divs ohne `id` erhalten automatisch eine klassenbezogene ID `lp2_auto_{className}_{index}`.
- Divs mit Höhe `0` werden auf **120 px** gesetzt.
- Ein `ResizeObserver` pro Plot-Div löst bei Größenänderung automatisch (mit 50 ms
  Debounce) Neuberechnung und Redraw aus – kein manuelles Resize-Handling nötig.
- Achsen-Tick-Labels reagieren automatisch auf den Zoom-Span (Sekunden- bis
  Jahres-Granularität) und arbeiten in **lokaler** Zeitzone (nicht UTC); DST-Wechsel
  werden von der JS-`Date`-Arithmetik automatisch korrekt behandelt.
- Wird die Legende höher als 75 % der Div-Höhe, schaltet sie automatisch auf
  zweispaltige Darstellung um (kein manuelles Eingreifen nötig).

---

## Praxisbeispiel – Simulationsergebnisse anzeigen (LeSim / ASM-Simulation)

Mehrere Plot-Container derselben CSS-Klasse (`libPlotCsv1`) zeigen unterschiedliche
Kanäle synchron. Alle Plots reagieren gemeinsam auf Zoom und Crosshair.

```html
<!-- Fluss- und Drehzahlregler -->
<div class="libPlotCsv1" style="width:100%;height:200px;"
     channels="FO_1.psih_pu, FO_1.uModIsUsed, ASM01.psih_dq_pu.getAbsV(), ASM01.p_n_pu, FO_1.w1_pu">
</div>

<!-- Freiwerdezeiten mit Einheitenumrechnung: interne Werte in sec → Anzeige in msec -->
<div class="libPlotCsv1" style="width:100%;height:150px;" channels="
    B26C_01.D1.freiwerdeZeit [msec],
    B26C_01.D2.freiwerdeZeit [msec],
    B26C_01.D3.freiwerdeZeit [msec]">
</div>
```

```js
import libPlot from 'https://lesim.de/libPlot/libPlot2.mjs';

libPlot.configure('libPlotCsv1', {
    onAfterDraw: plotCtx => {
        if (plotCtx.divIndex === 1) plotCtx.setYLimits(0, 3);
    },
});

libPlot.SetMeasuringData('libPlotCsv1', timeAxis, measuringData);
```

## Praxisbeispiel – Zoom-Rettung bei zyklischen Updates

```js
function fun(tx, vx, txLast, isUpdate = false) {
    if (isUpdate) {
        const ts = libPlot.getTimeState('libPlotCsv1');
        libPlot.SetMeasuringData('libPlotCsv1', tx, vx);
        if (ts) libPlot.setZoom('libPlotCsv1', ts.zoom.tMin, ts.zoom.tMax);
    } else {
        libPlot.SetMeasuringData('libPlotCsv1', tx, vx);
    }
}
```

## Praxisbeispiel – Kanalnamen aus dem DOM lesen

```js
import libPlot from 'https://lesim.de/libPlot/libPlot2.mjs';

let channelNames = libPlot.getChannels('libPlotCsv1');
channelNames.push('heizungTempVorlauf_ch1'); // Hilfskanal, nicht direkt geplottet

getVal({ channelNames, fun: processData, days: 10 });
```