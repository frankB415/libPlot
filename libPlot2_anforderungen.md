# libPlot2 – Anforderungsprofil

## Abhängigkeiten

- Keine Laufzeit-Abhängigkeit von jQuery, Flot oder sonstigen externen Bibliotheken.
- Der Tick-Algorithmus fuer die Zeitachse darf sich konzeptionell an Flot orientieren
  (MIT-Lizenz, IOLA/Ole Laursen), muss aber als eigene Canvas-2D-Implementierung
  umgesetzt sein.

## Modul / Bezugsquelle

- Muss als ES-Modul mit Default-Export `libPlot` bereitstehen
  (`https://lesim.de/libPlot/libPlot2.mjs`).
- Muss zusaetzlich als klassisches Script (`libPlot2.js`) nutzbar sein und dabei
  `window.libPlot` setzen.
- Alle Funktionen muessen ausschliesslich am Default-Export haengen; keine separaten
  Named Exports.

## HTML-Container

| Attribut | Pflicht | Anforderung |
|---|---|---|
| `class` | ja | CSS-Klassenname, wird an alle API-Funktionen uebergeben |
| `id` | nein | Muss automatisch vergeben werden, falls leer (eindeutig, klassenbezogen) |
| `channels` | ja | Komma-getrennte Kanalnamen (siehe Kanal-Syntax) |
| `data-ymin` / `data-ymax` | nein | Feste Y-Achsen-Grenzen fuer den ersten Render |

- Divs mit Hoehe `0` muessen automatisch auf eine Mindesthoehe (120 px) gesetzt werden.
- Eine Groessenaenderung des Containers muss automatisch (debounced) einen Redraw
  ausloesen, ohne dass der Aufrufer selbst auf `resize` reagieren muss.
- Es darf keine weiteren HTML-Attribute zur Konfiguration geben – jegliche
  Konfiguration laeuft ausschliesslich ueber `configure(className, cfg)` und gilt
  global fuer alle Divs einer Klasse.

## Kanal-Syntax

```
channels="kanal1, -kanal2, kanal3[mV], kanal4[kA]"
```

- `-kanalname` muss das Vorzeichen invertieren (Faktor −1).
- `[Einheit]` muss automatisch einen Skalierungsfaktor anwenden.
- Vorzeichen und Einheit muessen kombinierbar sein (z. B. `-wirkungsgrad[%]`).
- Fuer konkrete Einheiten (`Grad`, `GradC`, `Wh`, `kWh`, `MWh`, `Ah`, `kAh`, `h`, `d`,
  `%`, `min`, `mV`, `mA`) muss ein fest hinterlegter Skalierungsfaktor gelten.
- Fuer alle anderen Einheiten muss eine generische Praefix-Regel greifen (erstes
  Zeichen `k`/`M`/`m`/`u`/`n` → ×0,001 / ×1e-6 / ×1000 / ×1e6 / ×1e9).
- Einheiten ohne Treffer in beiden Regeln muessen Faktor `1` erhalten; der
  Einheiten-Text muss trotzdem als Label an die Legende angehaengt werden.

## API-Funktionen

`libPlot` muss folgende Funktionen bereitstellen:

| Funktion | Anforderung |
|---|---|
| `configure(cls, cfg)` | Setzt globale Optionen fuer alle Plots einer CSS-Klasse |
| `SetMeasuringData(cls, tx, vx)` | Uebergibt Messdaten, initialisiert/aktualisiert alle Plots der Klasse |
| `setZoom(cls, tMin, tMax)` | Setzt den Zoom-Bereich programmatisch; ohne Argumente = Vollbereich |
| `getTimeState(cls)` | Liefert `{ zoom, extent, isFullRange }` |
| `getChannels(cls)` | Liefert bereinigte, eindeutige Liste aller in der Klasse verwendeten Kanalnamen (ohne Einheiten-Suffix/Vorzeichen) |
| `exportDataCsv(cls)` | Exportiert den aktuell sichtbaren (gezoomten) Bereich als Komma-getrennten CSV-String, `{ csv, tMin }` |
| `exportDataObject(cls)` | Exportiert den aktuell sichtbaren Bereich als `{ dat: { tx: {unit, val}, channels: {name: {unit, val}} }, tMin }` |
| `setDebugLevel(level)` | Schaltet Timing-/Debug-Logging um (`0` aus, `>0` an) |

### configure(cls, cfg) – Optionen

`configure()` muss die uebergebenen Keys additiv in den Klassen-Kontext mergen
(`Object.assign`); mehrfache Aufrufe fuer dieselbe Klasse duerfen jeweils nur die
angegebenen Keys ueberschreiben, nicht den gesamten Config-Block.

| Key | Signatur | Anforderung |
|---|---|---|
| `zoomChangeHook` | `(ts) => void` | Wird nach jedem Zoom-Wechsel aufgerufen (Rubber-Band, Pinch, Doppelklick, `setZoom()`) |
| `onAfterDraw` | `(plotCtx) => void` | Wird nach jedem einzelnen Plot-Redraw aufgerufen |
| `fmtTimeHook` | `(t, tMin, tMax) => string` | Ueberschreibt die X-Achsen-Tick-Labels |
| `fmtLegendTimeHook` | `(t) => string` | Ueberschreibt die Legenden-Kopfzeile beim Hovern |
| `getColor` | `(channelName, index) => string \| falsy` | Eigene Kurvenfarbe; `falsy` -> Default-Palette |
| `getLabel` | `(channelName, unit) => string` | Eigenes Legenden-Label; Einheit `[unit]` muss automatisch angehaengt werden, falls nicht schon enthalten |
| `legendPosition` | `'tl' \| 'tr' \| 'bl' \| 'br'` | Ecke fuer die Legende im Plot-Div (Default `'tl'`) |
| `reductionMode` | `'auto' \| 'none' \| 'nearest' \| 'minmax'` | Erzwingt eine Downsampling-Strategie statt der automatischen Wahl |

**Anforderung:** `configure()` muss den Key `onZoomChange` per `Error` ablehnen (Hinweis
auf `zoomChangeHook`) statt ihn stillschweigend zu ignorieren.

### plotCtx (Parameter von onAfterDraw)

```js
libPlot.configure('libPlotCsv1', {
    onAfterDraw: function(plotCtx) {
        if (plotCtx.divIndex === 2) {  // 0-basiert
            plotCtx.setYLimits(0, 6);
        }
    }
});
```

| Member | Anforderung |
|---|---|
| `divIndex` | 0-basierter Index des Plots innerhalb der Klasse |
| `channels` | Array der Kanalnamen (ohne Einheit/Vorzeichen) dieses Plots |
| `setYLimits(mn, mx)` | Fixiert Y-Min/Max fuer den naechsten Redraw |
| `setYMin(mn)` / `setYMax(mx)` | Setzt nur eine der beiden Y-Grenzen |
| `resetYLimits()` | Loescht fixe Y-Grenzen wieder (zurueck auf Auto-Range) |
| `redraw()` | Erzwingt sofortigen Redraw dieses einen Plots |

**Anforderung:** `setYLimits`/`setYMin`/`setYMax` muessen ignoriert werden, waehrend
gerade ein Rechtsklick-Autozoom laeuft, damit `onAfterDraw` diesen nicht versehentlich
ueberschreibt.

### Zoom-Verhalten

```js
const ts = libPlot.getTimeState('libPlotCsv1');
// ts.zoom        → { tMin, tMax }  – aktueller Zoom
// ts.extent      → { tMin, tMax }  – voller Datenbereich
// ts.isFullRange → boolean
```

- `setZoom(cls)` ohne Argumente muss auf den vollen Datenbereich zuruecksetzen.
- `setZoom(cls, tMin, tMax)` mit `tMin > tMax` muss ignoriert werden (Warnung
  genuegt, kein Abbruch der Anwendung).
- `setZoom()` ohne vorherigen `SetMeasuringData`-Aufruf fuer die Klasse muss ein
  No-op sein.
- `SetMeasuringData` darf einen zuvor gesetzten Zoom **nicht** automatisch
  beibehalten. Ein Aufrufer, der den Zoom ueber ein erneutes `SetMeasuringData`
  hinweg erhalten will, muss ihn selbst sichern und wiederherstellen koennen:

```js
const ts = libPlot.getTimeState('libPlotCsv1');
libPlot.SetMeasuringData('libPlotCsv1', tx, vx);
if (ts) libPlot.setZoom('libPlotCsv1', ts.zoom.tMin, ts.zoom.tMax);
```

## Feste Y-Achsen-Grenzen (data-ymin / data-ymax)

```html
<div class="libPlotCsv1" data-ymin="48" data-ymax="57" channels="..." style="..."></div>
```

- Muessen nur beim ersten Render angewendet werden.
- Muessen durch Rubber-Band-Zoom oder Pinch-Zoom auf Auto-Y umgeschaltet werden.
- Ein Rechtsklick muss alle Plots der Klasse auf Auto-Y setzen.
- Ein Doppelklick (X-Zoom-Reset) darf `data-ymin`/`data-ymax` **nicht** wiederherstellen.

## Interaktionen (Maus / Touch)

| Geste | Anforderung |
|---|---|
| Linke Maustaste ziehen (Rubber-Band) | Zoom auf X **und** Y, alle Plots der Klasse synchron; schaltet betroffene Plots auf Auto-Y |
| Rechte Maustaste klicken | Y-Achsen-Autozoom fuer alle Plots der Klasse; kein Kontextmenue, keine Kurve wird entfernt |
| Doppelklick | X-Zoom-Reset auf vollen Datenbereich; Y-Achse bleibt unveraendert |
| Maus bewegen | Crosshair synchron ueber alle Plots der Klasse; Cursor-Punkt(e) im gehoverten Plot; Legende zeigt Zeitstempel-Kopfzeile plus Wert je Kanal |
| Maus verlaesst den Plot | Crosshair/Cursor-Punkt(e) muessen verschwinden, Legende zurueck auf reine Label-Ansicht |
| Klick auf Legenden-Eintrag | Muss die zugehoerige Kurve ein-/ausblenden; Y-Achse wird bei jedem Umschalten neu autoskaliert, sofern nicht fix per `data-ymin`/`data-ymax` |
| Pinch (2 Finger) | X-Zoom um den Pinch-Mittelpunkt; schaltet auf Auto-Y |
| Swipe horizontal (1 Finger) | Pan der X-Achse; rein vertikales Wischen darf nicht als Pan interpretiert werden |
| Doppel-Tap | X-Zoom-Reset (wie Doppelklick) |

Das Kontextmenue darf nur innerhalb der jeweiligen Plot-Canvas deaktiviert werden,
nicht global im Dokument.

## Datenreduktion (Downsampling)

- Die Zielpunktzahl pro Plot muss sich an der tatsaechlichen Canvas-Breite in Pixeln
  (inkl. `devicePixelRatio`) orientieren, nicht an einem festen Punktelimit.
- Modus `none` (Verhaeltnis Datenpunkte/Canvas-Breite ≤ 1): 1:1, kein Downsampling.
- Modus `nearest` (Verhaeltnis > 1 und ≤ 10): Nearest-Sample pro Pixel-Bucket.
- Modus `minmax` (Verhaeltnis > 10): Min- und Max-Wert pro Pixel-Bucket (2 Punkte je
  Bucket, damit Spitzen erhalten bleiben).
- Der Modus muss sich per `configure(cls, { reductionMode: '...' })` erzwingen lassen.

## Diagnostics (Sanity-Check)

Jeder `SetMeasuringData`-Aufruf muss die uebergebenen Daten pruefen:

- **Fatal** (Abbruch, `console.error`, nichts wird gezeichnet): `tx` ist kein Array
  oder leer; `vx` ist kein Objekt.
- **Warnungen** (Zeichnen laeuft trotzdem weiter, `console.warn` + Zaehler):
  - Kanal in `vx` ist kein Array, oder seine Laenge weicht von `tx.length` ab.
  - Kein in Plots verwendeter Kanalname kommt in `vx` vor.
  - Ein konkreter, in einem Plot verwendeter Kanalname fehlt in `vx`.
  - Stichproben von `tx` (erster/mittlerer/letzter Index): nicht-endliche Zahl, nicht
    streng monoton steigend, oder wirkt zu klein fuer einen Unix-ms-Zeitstempel.
  - Dieselben Stichproben je Kanal: Wert vorhanden, aber kein `number`.
- Es muss immer (unabhaengig vom Debug-Level) eine einzeilige Zusammenfassung
  geloggt werden: Klassenname, Punktanzahl, Datumsbereich, Kanalanzahl, Anzahl
  gefundener Probleme.

## Styling

- Legenden-Hintergrund/Text/Rahmen muessen ueber CSS-Variablen anpassbar sein
  (`--lp2-legend-bg`, `--lp2-legend-color`, `--lp2-legend-border`).
- Kurvenfarben, Legenden-Labels und Legenden-Position muessen ueber `configure()`
  anpassbar sein (`getColor`, `getLabel`, `legendPosition`).
- Schriftgroessen (Achsen, Legende) muessen automatisch auf kleinen Viewports
  (< 1024 px Breite) skaliert werden.
- Eine Legende, die hoeher als 75 % der Div-Hoehe wird, muss automatisch auf
  zweispaltige Darstellung umschalten.

## Sonstiges Verhalten

- Zeitachse muss in UTC-Millisekunden uebergeben werden.
- Achsen-Tick-Labels muessen sich automatisch an den Zoom-Span anpassen
  (Sekunden- bis Jahres-Granularitaet) und in lokaler Zeitzone arbeiten
  (DST-Wechsel korrekt behandelt).

## Code-Konventionen

- Kein `try/catch` in `requestAnimationFrame`-Bloecken – Fehler muessen unmaskiert
  in die Konsole durchschlagen.
- Kein jQuery.
