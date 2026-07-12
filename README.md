# libPlot2

Canvas-basierte Bibliothek zum Plotten von Zeitreihen-Messdaten – ohne jQuery, ohne
Flot, ohne externe Abhängigkeiten.

## Features

- Zoom per Rubber-Band-Auswahl, Pinch (Touch), Doppelklick/Doppel-Tap
- Synchronisierte Crosshair- und Legenden-Anzeige über alle Plots einer CSS-Klasse
- Automatisches Downsampling (nearest/minmax), an die tatsächliche Canvas-Breite
  angepasst
- Feste (`data-ymin`/`data-ymax`) oder automatische Y-Achsen-Grenzen
- CSV- und Objekt-Export des aktuell sichtbaren Bereichs
- Eingebaute Diagnose (Sanity-Checks) für übergebene Messdaten mit Konsolen-Logging

## Schnellstart

```html
<div class="libPlotCsv" channels="kanal1, kanal2[mV]"
     style="width:100%;height:300px;"></div>

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

Alternativ als klassisches Script-Tag (`<script src="libPlot2.js">`), das
`window.libPlot` bereitstellt.

## Dateien

| Datei | Beschreibung |
|---|---|
| `libPlot2.js` | Bibliothek (IIFE, stellt `window.libPlot` bereit) |
| `libPlot2.mjs` | ES-Modul-Wrapper mit Default-Export |
| `test_libPlot2.html` | Smoke-Test / Demo mit generierten Testdaten |
| `libPlot_API.md` | Vollständige API-Dokumentation |
| `libPlot2_anforderungen.md` | Anforderungsprofil der Bibliothek |

## Browser-Anforderungen

Moderne Browser mit Canvas-2D-, `ResizeObserver`- und ES-Modul-Unterstützung.