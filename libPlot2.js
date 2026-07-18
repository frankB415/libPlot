/**
 * libPlot2.js
 * Canvas-based time series plot library.
 * No jQuery, no external dependencies.
 * Tick algorithm adapted from Flot (MIT license, IOLA and Ole Laursen).
 *
 * Usage (ES module):   import libPlot from './libPlot2.js';
 * Usage (script tag):  <script src="libPlot2.js"></script> → window.libPlot
 */

const libPlot = (function () {
    'use strict';

    const _ctx = {};

    function _getCtx(className) {
        if (!_ctx[className]) _ctx[className] = _makeCtx(className);
        return _ctx[className];
    }

    function _makeCtx(className) {
        return {
            className,
            rawData:    null,
            renderData: null,
            zoom:       null,
            plots:      [],
            cfg:        {},
            debugLevel: 0,
        };
    }

    let _globalDebug = 0;
    function _log(ctx, ...args) {
        if (_globalDebug > 0 || (ctx && ctx.debugLevel > 0)) console.log('[libPlot2]', ...args);
    }

function configure(className, cfg) {
    if (cfg.onZoomChange)
        throw new Error(
            'libPlot2.configure: Legacy-Key "onZoomChange" erkannt.\n' +
            'Bitte zu "zoomChangeHook" umbenennen.\n' +
            'Claude: alle configure()-Aufrufe auf zoomChangeHook migrieren.'
        );
    // cfg.fmtTimeHook(t, tMin, tMax)  – überschreibt X-Achsen-Labels (Default: Kalenderzeit lokal)
    // cfg.fmtLegendTimeHook(t)        – überschreibt Legenden-Kopfzeile (Default: Wochentag, Datum, Uhrzeit lokal)
    // Beide optional; ohne Angabe gelten die internen Defaults. Für nicht-kalendarische
    // Zeitachsen (z.B. LESIM-Simulationszeit in s/ms ab t=0) hier eigene Formatter injizieren.
    const ctx = _getCtx(className);
    Object.assign(ctx.cfg, cfg);
}

    function SetMeasuringData(className, tx, vx) {
        const ctx = _getCtx(className);
        if (!_sanityCheck(ctx, tx, vx)) return;
        ctx.rawData = { tx, vx };
        if (ctx.plots.length === 0) _initDOM(ctx);
        const t0 = performance.now();
        _buildRenderData(ctx);
        const t1 = performance.now();
        _drawAll(ctx);
        const t2 = performance.now();
        if (_globalDebug > 0) console.log(`[libPlot2] timing '${className}': buildRenderData=${(t1-t0).toFixed(1)}ms  drawAll=${(t2-t1).toFixed(1)}ms  total=${(t2-t0).toFixed(1)}ms  plots=${ctx.plots.length}  txLen=${tx.length}`);
    }

    function setZoom(className, tMin, tMax) {
        const ctx = _getCtx(className);
        if (!ctx.rawData) return;
        if (tMin === undefined && tMax === undefined) {
            ctx.zoom = null;
        } else {
            if (tMin !== undefined && tMax !== undefined && tMin > tMax) {
                console.warn('[libPlot2] setZoom: tMin > tMax – ignored');
                return;
            }
            ctx.zoom = {
                tMin: tMin !== undefined ? tMin : ctx.rawData.tx[0],
                tMax: tMax !== undefined ? tMax : ctx.rawData.tx[ctx.rawData.tx.length - 1],
            };
        }
        _buildRenderData(ctx);
        _drawAll(ctx);
        _fireZoomChange(ctx);
    }

    function getTimeState(className) {
        const ctx = _getCtx(className);
        const tx  = ctx.rawData ? ctx.rawData.tx : [];
        const extent = {
            tMin: tx.length ? tx[0] : 0,
            tMax: tx.length ? tx[tx.length - 1] : 0,
        };
        const zoom = ctx.zoom || { ...extent };
        const isFullRange = Math.abs((zoom.tMax - zoom.tMin) - (extent.tMax - extent.tMin)) < 60000;
        return { zoom, extent, isFullRange };
    }

    function getChannels(className) {
        const divs = document.querySelectorAll('.' + className + '[channels]');
        const seen = new Set();
        divs.forEach(div => {
            _parseChannels(div.getAttribute('channels')).forEach(ch => seen.add(ch.name));
        });
        return [...seen];
    }

    function exportDataCsv(className) {
        const ctx  = _getCtx(className);
        if (!ctx.rawData) return { csv: '', tMin: 0 };
        const { tx, vx } = _zoomFilteredRaw(ctx);
        const usedCh = _usedChannels(ctx);
        const header = ['tx', ...usedCh].join(',');
        const rows   = tx.map((t, i) =>
            [t, ...usedCh.map(ch => {
                const v = vx[ch] ? vx[ch][i] : '';
                if (v === '' || v === undefined) return '';
                if (isNaN(v)) return 'NaN';
                return parseFloat(v.toPrecision(6));
            })].join(',')
        );
        return { csv: [header, ...rows].join('\n'), tMin: tx[0] };
    }

    function exportDataObject(className) {
        const ctx = _getCtx(className);
        if (!ctx.rawData) return { dat: {}, tMin: 0 };
        const { tx, vx } = _zoomFilteredRaw(ctx);
        const chMeta = {};
        ctx.plots.forEach(p => p.channels.forEach(ch => {
            if (!chMeta[ch.name]) chMeta[ch.name] = { unit: ch.unit || '', scale: ch.scale || 1 };
        }));
        const channels = {};
        Object.entries(chMeta).forEach(([name, meta]) => {
            const raw = vx[name];
            if (!raw) return;
            channels[name] = {
                unit: meta.unit,
                val:  raw.map(v => isNaN(v) ? null : parseFloat((v * meta.scale).toPrecision(6))),
            };
        });
        return { dat: { tx: { unit: 'ms_utc', val: tx }, channels }, tMin: tx[0] };
    }

    function setDebugLevel(level) { _globalDebug = level; }

    // =========================================================================
    // SANITY CHECKS
    // =========================================================================
    function _sanityCheck(ctx, tx, vx) {
        let issues = 0;
        if (!Array.isArray(tx) || tx.length === 0) {
            console.error('[libPlot2] tx is not an array or empty'); return false;
        }
        if (typeof vx !== 'object' || vx === null || Array.isArray(vx)) {
            console.error('[libPlot2] vx is not an object'); return false;
        }
        Object.keys(vx).forEach(ch => {
            if (!Array.isArray(vx[ch])) {
                console.warn(`[libPlot2] channel '${ch}' is not an array`); issues++;
            } else if (vx[ch].length !== tx.length) {
                console.warn(`[libPlot2] channel '${ch}': length mismatch (got ${vx[ch].length}, expected ${tx.length})`); issues++;
            }
        });
        const usedNames = getChannels(ctx.className);
        const hasAny = usedNames.some(n => vx[n] !== undefined);
        if (!hasAny && usedNames.length > 0) {
            console.warn(`[libPlot2] no matching channels found in vx for class '${ctx.className}'`); issues++;
        }
        usedNames.forEach(n => {
            if (vx[n] === undefined) {
                console.warn(`[libPlot2] channel '${n}' used in plot but missing in vx`); issues++;
            }
        });
        const spots = [0, Math.floor(tx.length / 2), tx.length - 1].filter((v, i, a) => a.indexOf(v) === i);
        spots.forEach(i => {
            const t = tx[i];
            if (typeof t !== 'number' || !isFinite(t)) {
                console.warn(`[libPlot2] tx[${i}] is not a finite number`); issues++;
            }
            if (i > 0 && tx[i] <= tx[i - 1]) {
                console.warn(`[libPlot2] tx is not monotonically increasing at index ${i}`); issues++;
            }
            if (t < 315e9) {
                console.warn(`[libPlot2] tx[${i}] looks too small – expected Unix ms timestamp`); issues++;
            }
        });
        Object.keys(vx).forEach(ch => {
            if (!Array.isArray(vx[ch])) return;
            spots.forEach(i => {
                const v = vx[ch][i];
                if (v !== undefined && typeof v !== 'number') {
                    console.warn(`[libPlot2] channel '${ch}'[${i}] is not a number (type: ${typeof v})`); issues++;
                }
            });
        });
        const tMin = new Date(tx[0]).toISOString().slice(0,10);
        const tMax = new Date(tx[tx.length-1]).toISOString().slice(0,10);
        console.log(
            `[libPlot2] SetMeasuringData '${ctx.className}':\n` +
            `  tx:     ${tx.length} pts, range ${tMin} → ${tMax}\n` +
            `  vx:     ${Object.keys(vx).length} channels\n` +
            `  issues: ${issues}`
        );
        return true;
    }

    // =========================================================================
    // DOM INIT
    // =========================================================================
    function _initDOM(ctx) {
        const divs = document.querySelectorAll('.' + ctx.className + '[channels]');
        divs.forEach((div, idx) => {
            if (!div.id) div.id = 'lp2_auto_' + ctx.className + '_' + idx;
            if (div.offsetHeight === 0) div.style.height = '120px';
            div.style.position = 'relative';

            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'display:block;width:100%;height:100%;';
            div.appendChild(canvas);

            const legend = document.createElement('div');
            legend.className = 'lp2-legend';
            const legFontSize = Math.round(11 * _mobileFontScale());
            legend.style.cssText = `position:absolute;pointer-events:none;font-size:${legFontSize}px;` +
                'background:var(--lp2-legend-bg, rgba(255,255,255,0.8));' +
                'color:var(--lp2-legend-color, inherit);' +
                'border:1px solid var(--lp2-legend-border, #ccc);padding:3px 6px;' +
                'border-radius:3px;white-space:nowrap;';
            div.appendChild(legend);

            const tooltip = document.createElement('div');
            tooltip.className = 'lp2-tooltip';
            tooltip.style.cssText = 'position:absolute;pointer-events:none;display:none;' +
                'font-size:11px;background:rgba(0,0,0,0.55);color:#fff;' +
                'padding:4px 8px;border-radius:4px;white-space:nowrap;z-index:10;' +
                'line-height:1.5;font-family:sans-serif;box-shadow:0 2px 6px rgba(0,0,0,0.4);';
            div.appendChild(tooltip);

            const channels = _parseChannels(div.getAttribute('channels'));

            const plot = {
                div, canvas, legend, tooltip,
                divIndex: idx,
                channels,
                yMin: div.dataset.ymin ? +div.dataset.ymin : null,
                yMax: div.dataset.ymax ? +div.dataset.ymax : null,
            };
            ctx.plots.push(plot);

            const ro = new ResizeObserver(() => {
                _resizeCanvas(canvas);
                if (!ctx.rawData) return;
                if (ctx._resizeTimer) clearTimeout(ctx._resizeTimer);
                ctx._resizeTimer = setTimeout(() => {
                    ctx._resizeTimer = null;
                    ctx.plots.forEach(p => _resizeCanvas(p.canvas));
                    _buildRenderData(ctx);
                    _drawAll(ctx);
                }, 50);
            });
            ro.observe(div);
            _resizeCanvas(canvas);

            _attachEvents(ctx, plot);
        });
    }

    function _resizeCanvas(canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width  = Math.round(rect.width  * dpr);
        canvas.height = Math.round(rect.height * dpr);
    }

    // =========================================================================
    // CHANNEL PARSING
    // =========================================================================
    const _UNIT_RE = /\[([^\]]+)\]$/;

    function _parseChannels(attrStr) {
        if (!attrStr) return [];
        return attrStr
            .split(',')
            .map(s => s.replace(/[\r\n]/g, '').trim())
            .filter(Boolean)
            .map(raw => {
                let name  = raw;
                let scale = 1;
                let unit  = '';
                if (name.startsWith('-')) { scale = -1; name = name.slice(1).trim(); }
                const um = name.match(_UNIT_RE);
                if (um) {
                    const u = um[1];
                    name = name.replace(_UNIT_RE, '').trim();
                    unit = u;
                    const firstChar = u[0];
                    if      (u === 'Grad')  scale *= 180 / Math.PI;
                    else if (u === 'GradC') scale *= 1;
                    else if (u === 'Wh')    scale *= 1/3600;
                    else if (u === 'kWh')   scale *= 1/3600000;
                    else if (u === 'MWh')   scale *= 1/3600000000;
                    else if (u === 'Ah')    scale *= 1/3600;
                    else if (u === 'kAh')   scale *= 1/3600000;
                    else if (u === 'h')     scale *= 1/3600;
                    else if (u === 'd')     scale *= 1/86400;
                    else if (u === '%')     scale *= 100;
                    else if (u === 'min')   scale *= 1/60;
                    else if (u === 'mV')    scale *= 1000;
                    else if (u === 'mA')    scale *= 1000;
                    else if (firstChar === 'k') scale *= 1e-3;
                    else if (firstChar === 'M') scale *= 1e-6;
                    else if (firstChar === 'm') scale *= 1e3;
                    else if (firstChar === 'u') scale *= 1e6;
                    else if (firstChar === 'n') scale *= 1e9;
                }
                return { name, scale: scale === 0 ? 1 : scale, unit, raw };
            });
    }

    // =========================================================================
    // RENDER DATA PIPELINE
    // =========================================================================
    function _buildRenderData(ctx) {
        const { rawData, zoom, plots } = ctx;
        if (!rawData) return;

        const { tx, vx } = rawData;
        const ts = getTimeState(ctx.className);
        const tMin = ts.zoom.tMin;
        const tMax = ts.zoom.tMax;

        let lo = _bisectLeft(tx, tMin);
        let hi = _bisectRight(tx, tMax);
        lo = Math.max(0, lo - 1);
        hi = Math.min(tx.length - 1, hi + 1);
        const winTx = tx.slice(lo, hi + 1);

        // reductionMode: 'auto' (default) | 'none' | 'nearest' | 'minmax'
        // 'auto'    – wählt Modus anhand factor (none ≤1, nearest ≤10, minmax >10)
        // 'none'    – 1:1, kein Downsample (zum Testen / kleine Datensätze)
        // 'nearest' – Nearest-Sample pro Pixel (erzwingt auch bei factor>10)
        // 'minmax'  – Min+Max pro Pixel-Bucket (erzwingt auch bei factor≤10)
        const reductionMode = ctx.cfg.reductionMode ?? 'auto';

        ctx.renderData = plots.map(plot => {
            const _tp0 = performance.now();
            const nTarget = plot.canvas.width || 1200;
            const factor  = winTx.length / nTarget;
            const rdTx    = [], rdVx = {};
            plot.channels.forEach(ch => { rdVx[ch.name] = []; });

            const useNone    = reductionMode === 'none'    || (reductionMode === 'auto' && factor <= 1);
            const useNearest = reductionMode === 'nearest' || (reductionMode === 'auto' && factor > 1 && factor <= 10);
            const useMinMax  = reductionMode === 'minmax'  || (reductionMode === 'auto' && factor > 10);

            if (useNone) {
                for (let i = 0; i < winTx.length; i++) {
                    rdTx.push(winTx[i]);
                    plot.channels.forEach(ch => {
                        const raw = vx[ch.name];
                        rdVx[ch.name].push(raw ? raw[lo + i] * ch.scale : NaN);
                    });
                }
            } else if (useNearest) {
                const step = (tMax - tMin) / nTarget;
                for (let b = 0; b < nTarget; b++) {
                    const mid = tMin + (b + 0.5) * step;
                    const idx = lo + _nearestIdx(winTx, mid);
                    rdTx.push(tx[idx]);
                    plot.channels.forEach(ch => {
                        const raw = vx[ch.name];
                        rdVx[ch.name].push(raw ? raw[idx] * ch.scale : NaN);
                    });
                }
            } else {
                // MinMax: pro Bucket werden exakt 2 Punkte in rdTx und rdVx geschrieben.
                // rdTx bekommt den Zeitstempel des Min- und Max-Werts des ersten Channels
                // (als Takt-Referenz). Alle Channels schreiben synchron dieselben 2 Slots.
                const step = (tMax - tMin) / nTarget;
                for (let b = 0; b < nTarget; b++) {
                    const bMin = tMin + b * step;
                    const bMax = bMin + step;
                    let i0 = lo + _bisectLeft(winTx, bMin);
                    let i1 = lo + _bisectRight(winTx, bMax);
                    if (i0 >= tx.length) continue;
                    i1 = Math.min(i1, tx.length - 1);

                    // allNaN-Check anhand des ersten Channels
                    let allNaN = true;
                    for (let i = i0; i <= i1; i++) {
                        if (!isNaN(vx[plot.channels[0].name]?.[i])) { allNaN = false; break; }
                    }
                    if (allNaN) {
                        rdTx.push(bMin + step / 2, bMin + step / 2);
                        plot.channels.forEach(ch => { rdVx[ch.name].push(NaN, NaN); });
                        continue;
                    }

                    // Zeitstempel-Takt vom ersten Channel bestimmen
                    let tMinI = i0, tMaxI = i0;
                    {
                        const raw0 = vx[plot.channels[0].name];
                        let minV = Infinity, maxV = -Infinity;
                        for (let i = i0; i <= i1; i++) {
                            const v = raw0?.[i];
                            if (v === undefined || isNaN(v)) continue;
                            if (v < minV) { minV = v; tMinI = i; }
                            if (v > maxV) { maxV = v; tMaxI = i; }
                        }
                    }
                    // Reihenfolge: chronologisch (min-Zeit zuerst)
                    const tFirst = tMinI <= tMaxI ? tx[tMinI] : tx[tMaxI];
                    const tSecond = tMinI <= tMaxI ? tx[tMaxI] : tx[tMinI];
                    rdTx.push(tFirst, tSecond);

                    // Werte aller Channels in dieselbe Reihenfolge (min-zuerst oder max-zuerst
                    // je nach zeitlicher Lage, konsistent mit rdTx)
                    plot.channels.forEach(ch => {
                        const raw = vx[ch.name];
                        if (!raw) { rdVx[ch.name].push(NaN, NaN); return; }
                        let minV = Infinity, maxV = -Infinity, minI = i0, maxI = i0;
                        for (let i = i0; i <= i1; i++) {
                            const v = raw[i];
                            if (isNaN(v)) continue;
                            if (v < minV) { minV = v; minI = i; }
                            if (v > maxV) { maxV = v; maxI = i; }
                        }
                        if (minI <= maxI) {
                            rdVx[ch.name].push(minV * ch.scale, maxV * ch.scale);
                        } else {
                            rdVx[ch.name].push(maxV * ch.scale, minV * ch.scale);
                        }
                    });
                }
            }
            if (_globalDebug > 0) console.log(`[libPlot2]   plot[${plot.divIndex}] buildRender: mode=${reductionMode}(factor=${factor.toFixed(1)}x)  winPts=${winTx.length}  rdPts=${rdTx.length}  channels=${plot.channels.length}  t=${(performance.now()-_tp0).toFixed(1)}ms`);
            return { tx: rdTx, vx: rdVx };
        });
    }

    function _bisectLeft(arr, val) {
        let lo = 0, hi = arr.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < val) lo = mid + 1; else hi = mid; }
        return lo;
    }
    function _bisectRight(arr, val) {
        let lo = 0, hi = arr.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= val) lo = mid + 1; else hi = mid; }
        return lo;
    }
    function _nearestIdx(arr, val) {
        if (arr.length === 0) return 0;
        let lo = 0, hi = arr.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < val) lo = mid + 1; else hi = mid;
        }
        if (lo > 0 && Math.abs(arr[lo-1] - val) < Math.abs(arr[lo] - val)) return lo - 1;
        return lo;
    }

    // =========================================================================
    // COLORS
    // =========================================================================
    const _PALETTE = [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
        '#9467bd', '#8c564b', '#e377c2', '#7f7f7f',
    ];
    function _getColor(ctx, channelName, index) {
        if (ctx.cfg.getColor) {
            const c = ctx.cfg.getColor(channelName, index);
            if (c) return c;
        }
        return _PALETTE[index % _PALETTE.length];
    }

    // =========================================================================
    // DRAWING
    // =========================================================================
    const _PAD = { left: 52, right: 12, top: 10, bottom: 28 };

    function _mobileFontScale() {
        return window.innerWidth < 1024 ? 1.2 : 1.0;
    }

    function _drawAll(ctx) {
        ctx.plots.forEach((plot, idx) => {
            _drawPlot(ctx, plot, ctx.renderData ? ctx.renderData[idx] : null);
        });
    }

    function _drawPlot(ctx, plot, rd) {
        const _td0 = performance.now();
        const canvas = plot.canvas;
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.width, H = canvas.height;
        const c = canvas.getContext('2d');
        c.clearRect(0, 0, W, H);

        if (!rd || !rd.tx.length) { _drawLegend(ctx, plot, []); return; }

        const pad = { left: _PAD.left * dpr, right: _PAD.right * dpr,
                      top: _PAD.top * dpr, bottom: _PAD.bottom * dpr };
        const pw = W - pad.left - pad.right;
        const ph = H - pad.top  - pad.bottom;

        // y range: plot.yMin/yMax are authoritative.
        // On first draw, they may be pre-filled from data-ymin/data-ymax (via _initDOM).
        // If null: autorange from data.
        // Result is written back to plot.yMin/yMax so _onMouseMove stays consistent.
        let yMin = plot.yMin;
        let yMax = plot.yMax;
        if (yMin === null || yMax === null) {
            let mn = Infinity, mx = -Infinity;
            plot.channels.forEach(ch => {
                if (plot._hidden?.has(ch.name)) return;
                (rd.vx[ch.name] || []).forEach(v => {
                    if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
                });
            });
            if (!isFinite(mn)) { mn = 0; mx = 1; }
            if (mn === mx)     { mn -= 1; mx += 1; }
            if (yMin === null) yMin = mn;
            if (yMax === null) yMax = mx;
        }
        // write back so mouse handlers use same scale
        plot.yMin = yMin;
        plot.yMax = yMax;

        const ts = getTimeState(ctx.className);
        const xMin = ts.zoom.tMin, xMax = ts.zoom.tMax;

        const toX = t  => pad.left + (t  - xMin) / (xMax - xMin) * pw;
        const toY = v  => pad.top  + (1 - (v - yMin) / (yMax - yMin)) * ph;

        const yTicks = _calcYTicks(yMin, yMax, Math.max(3, Math.floor(ph / (30 * dpr))));
        const xTicks = _calcTimeTicks(xMin, xMax, Math.floor(pw / (80 * dpr)));

        c.save();
        c.strokeStyle = `rgba(0,0,0,${0.1 * dpr > 0.3 ? 0.15 : 0.1})`;
        c.lineWidth = 1;
        yTicks.forEach(v => {
            const y = Math.round(toY(v));
            c.beginPath(); c.moveTo(pad.left, y); c.lineTo(pad.left + pw, y); c.stroke();
        });
        xTicks.forEach(t => {
            const x = Math.round(toX(t));
            c.beginPath(); c.moveTo(x, pad.top); c.lineTo(x, pad.top + ph); c.stroke();
        });
        c.restore();

        c.save();
        c.strokeStyle = '#888';
        c.lineWidth = 1;
        c.strokeRect(pad.left, pad.top, pw, ph);
        c.restore();

        c.save();
        c.font = `${11 * dpr * _mobileFontScale()}px sans-serif`;
        c.fillStyle = '#444';
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        yTicks.forEach(v => {
            const y = toY(v);
            c.fillText(_fmtY(v, yTicks), pad.left - 5 * dpr, y);
        });
        c.restore();

        c.save();
        c.font = `${10 * dpr * _mobileFontScale()}px sans-serif`;
        c.fillStyle = '#444';
        c.textAlign = 'center';
        c.textBaseline = 'top';
        const lineH = 12 * dpr * _mobileFontScale();
        xTicks.forEach(t => {
            const x     = toX(t);
            const label = (ctx.cfg.fmtTimeHook ?? _fmtTime)(t, xMin, xMax);
            const lines = label.split('\n');
            lines.forEach((line, i) => {
                c.fillText(line, x, pad.top + ph + 4 * dpr + i * lineH);
            });
        });
        c.restore();

        plot.channels.forEach((ch, ci) => {
            if (plot._hidden?.has(ch.name)) return;
            const data = rd.vx[ch.name];
            if (!data) return;
            c.save();
            c.strokeStyle = _getColor(ctx, ch.name, ci);
            c.lineWidth = 2 * dpr;
            c.beginPath();
            let penDown = false;
            for (let i = 0; i < rd.tx.length; i++) {
                const x = toX(rd.tx[i]);
                const y = toY(data[i]);
                if (isNaN(data[i])) { penDown = false; continue; }
                if (!penDown) { c.moveTo(x, y); penDown = true; }
                else            c.lineTo(x, y);
            }
            c.stroke();
            c.restore();
        });

        _drawLegend(ctx, plot, plot.channels.map((ch, ci) => {
            let label = ctx.cfg.getLabel ? ctx.cfg.getLabel(ch.name, ch.unit) : ch.name;
            if (ch.unit && !label.includes(`[${ch.unit}]`)) label += ` [${ch.unit}]`;
            return { name: ch.name, label, color: _getColor(ctx, ch.name, ci) };
        }));

        // tatsächlich gezeichnete Y-Grenzen sichern, bevor onAfterDraw
        // plot.yMin/yMax überschreiben kann (z.B. via setYLimits).
        // _drawCursorDot liest _drawnYMin/_drawnYMax statt plot.yMin/yMax.
        plot._drawnYMin = yMin;
        plot._drawnYMax = yMax;

        const plotCtx = _makePlotCtx(ctx, plot);
        if (ctx.cfg.onAfterDraw) ctx.cfg.onAfterDraw(plotCtx);
        if (_globalDebug > 0) console.log(`[libPlot2]   plot[${plot.divIndex}] draw: ${(performance.now()-_td0).toFixed(1)}ms  rdPts=${rd?.tx?.length ?? 0}  canvasSize=${canvas.width}x${canvas.height}`);
    }

    function _makePlotCtx(ctx, plot) {
        return {
            divIndex: plot.divIndex,
            channels: plot.channels.map(c => c.name),
            setYLimits(mn, mx) {
                if (plot._autoZoomActive) return;  // Rechtsklick-Autozoom hat Vorrang
                plot.yMin = mn; plot.yMax = mx;
            },
            setYMin(mn)        { if (!plot._autoZoomActive) plot.yMin = mn; },
            setYMax(mx)        { if (!plot._autoZoomActive) plot.yMax = mx; },
            resetYLimits()     { plot.yMin = null; plot.yMax = null; },
            redraw()           { const rd = ctx.renderData?.[plot.divIndex]; _drawPlot(ctx, plot, rd); },
        };
    }

    // =========================================================================
    // LEGEND
    // =========================================================================
    function _drawLegend(ctx, plot, entries) {
        const leg = plot.legend;
        if (!entries.length) { leg.style.display = 'none'; return; }
        plot._legendEntries = entries;
        if (!plot._hidden) plot._hidden = new Set();
        _renderLegend(leg, entries, null, null, plot._hidden);
        leg.style.display = 'block';
        leg.style.pointerEvents = 'auto';
        leg.style.cursor = 'pointer';
        leg.onclick = (e) => {
            const row = e.target.closest('[data-ci]');
            if (!row) return;
            const ci = +row.dataset.ci;
            const ch = entries[ci];
            if (!ch) return;
            if (plot._hidden.has(ch.name)) plot._hidden.delete(ch.name);
            else                            plot._hidden.add(ch.name);
            _buildRenderData(ctx);
            _drawAll(ctx);
        };
        _positionLegend(ctx, plot, entries);
    }

    function _renderLegend(leg, entries, timeStr, values, hidden, nearestCi) {
        leg.innerHTML = entries.map((e, i) => {
            const isHidden  = hidden?.has(e.name);
            const isNearest = nearestCi === i;
            const valStr    = values ? ` <span style="opacity:0.85">${values[i] ?? ''}</span>` : '';
            const opacity   = isHidden ? '0.3' : '1';
            const strike    = isHidden ? 'text-decoration:line-through;' : '';
            const bold      = isNearest ? 'font-weight:bold;' : '';
            const barH      = isNearest ? '5px' : '3px';
            return `<span data-ci="${i}" style="display:block;opacity:${opacity};${strike}${bold}cursor:pointer;">` +
                `<span style="display:inline-block;width:14px;height:${barH};background:${e.color};` +
                `vertical-align:middle;margin-right:4px;border-radius:2px;"></span>` +
                `<span>${e.label}${valStr}</span></span>`;
        }).join('');
        if (timeStr) {
            leg.innerHTML = `<span style="display:block;font-size:0.95em;opacity:0.7;">${timeStr}</span>` + leg.innerHTML;
        }
        leg.style.columnCount = '';
        leg.style.columnGap   = '';
        requestAnimationFrame(() => {
            const divH = leg.parentElement?.offsetHeight || Infinity;
            if (leg.offsetHeight > divH * 0.75) {
                leg.style.columnCount = '2';
                leg.style.columnGap   = '12px';
            }
        });
    }

    function _updateLegendValues(ctx, plot, t, xMin, xMax, cursorYVal) {
        const rd      = ctx.renderData?.[plot.divIndex];
        const entries = plot._legendEntries;
        if (!entries || !rd) return;
        const idx     = _nearestIdx(rd.tx, t);
        const timeStr = (ctx.cfg.fmtLegendTimeHook ?? _fmtLegendTime)(t);
        const values  = entries.map((e, ci) => {
            const ch = plot.channels[ci];
            const v  = rd.vx[ch?.name]?.[idx];
            if (!isFinite(v)) return '';
            return ': ' + _fmtTooltipVal(v);
        });
        // find channel nearest to cursor Y position
        let nearestCi = -1;
        if (cursorYVal !== undefined) {
            let bestDist = Infinity;
            entries.forEach((e, ci) => {
                const ch = plot.channels[ci];
                if (plot._hidden?.has(ch?.name)) return;
                const v = rd.vx[ch?.name]?.[idx];
                if (!isFinite(v)) return;
                const d = Math.abs(v - cursorYVal);
                if (d < bestDist) { bestDist = d; nearestCi = ci; }
            });
        }
        _renderLegend(plot.legend, entries, timeStr, values, plot._hidden, nearestCi);
    }

    function _resetLegendValues(ctx, plot) {
        const entries = plot._legendEntries;
        if (!entries) return;
        _renderLegend(plot.legend, entries, null, null, plot._hidden);
    }

    function _positionLegend(ctx, plot, entries) {
        const leg = plot.legend;
        const div = plot.div;
        const m   = 8;
        requestAnimationFrame(() => {
            const W  = div.offsetWidth, H = div.offsetHeight;
            const lw = leg.offsetWidth  || 120;
            const lh = leg.offsetHeight || 24;
            const pos = ctx.cfg.legendPosition ?? 'tl';
            let x, y;
            switch (pos) {
                case 'tr': x = W - _PAD.right - lw - m; y = _PAD.top + m;              break;
                case 'bl': x = _PAD.left + m;            y = H - _PAD.bottom - lh - m; break;
                case 'br': x = W - _PAD.right - lw - m; y = H - _PAD.bottom - lh - m; break;
                default:   x = _PAD.left + m;            y = _PAD.top + m;              break;
            }
            leg.style.left = x + 'px';
            leg.style.top  = y + 'px';
        });
    }

    // =========================================================================
    // TICK CALCULATION
    // =========================================================================
    function _calcYTicks(min, max, maxTicks) {
        if (maxTicks < 2) maxTicks = 2;
        const range = max - min;
        if (range === 0) return [min];
        const rawStep = range / maxTicks;
        const magn    = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const norm    = rawStep / magn;
        let step;
        if      (norm <= 1) step = 1  * magn;
        else if (norm <= 2) step = 2  * magn;
        else if (norm <= 5) step = 5  * magn;
        else                step = 10 * magn;
        const start = Math.ceil(min / step) * step;
        const ticks = [];
        for (let v = start; v <= max + step * 1e-6; v += step) {
            ticks.push(parseFloat(v.toPrecision(10)));
        }
        return ticks;
    }

    const _MS = {
        ms: 1, s: 1000, min: 60e3, h: 3600e3, d: 86400e3,
        w: 7 * 86400e3, mo: 30 * 86400e3, y: 365.25 * 86400e3,
    };
    const _TIME_SPECS = [
        [1,'ms'],[2,'ms'],[5,'ms'],[10,'ms'],[20,'ms'],[50,'ms'],[100,'ms'],[200,'ms'],[500,'ms'],
        [1,'s'],[2,'s'],[5,'s'],[10,'s'],[15,'s'],[30,'s'],
        [1,'min'],[2,'min'],[5,'min'],[10,'min'],[15,'min'],[30,'min'],
        [1,'h'],[2,'h'],[3,'h'],[6,'h'],[12,'h'],
        [1,'d'],[2,'d'],[3,'d'],
        [1,'w'],[2,'w'],
        [1,'mo'],[2,'mo'],[3,'mo'],[6,'mo'],
        [1,'y'],[2,'y'],[5,'y'],[10,'y'],
    ];

    // Lokalzeit-Varianten: alle Tick-Anker und Schrittweiten arbeiten in
    // lokaler Zeit (Date.prototype.get*/set* statt getUTC*/setUTC*), damit
    // die X-Achse die Zeitzone des Browsers (z.B. Europe/Berlin) widerspiegelt.
    // DST-Wechsel (23h/25h-Tage) werden dabei von der JS-Date-Arithmetik
    // automatisch korrekt behandelt.
    function _calcTimeTicks(tMin, tMax, maxTicks) {
        if (maxTicks < 2) maxTicks = 2;
        const range = tMax - tMin;
        const target = range / maxTicks;
        let best = _TIME_SPECS[_TIME_SPECS.length - 1];
        for (let i = 0; i < _TIME_SPECS.length - 1; i++) {
            const mid = (_TIME_SPECS[i][0] * _MS[_TIME_SPECS[i][1]] +
                         _TIME_SPECS[i+1][0] * _MS[_TIME_SPECS[i+1][1]]) / 2;
            if (target <= mid) { best = _TIME_SPECS[i]; break; }
        }
        const stepMs = best[0] * _MS[best[1]];
        const unit   = best[1];
        const ticks  = [];
        const d = new Date(tMin);
        if (unit === 'y')        { d.setMonth(0); d.setDate(1); d.setHours(0,0,0,0); }
        else if (unit === 'mo')  { d.setDate(1); d.setHours(0,0,0,0); }
        else if (unit === 'w' || unit === 'd') { d.setHours(0,0,0,0); }
        else if (unit === 'h') {
            d.setHours(0,0,0,0);
            const dayStart = d.getTime();
            const n = Math.floor((tMin - dayStart) / stepMs);
            d.setTime(dayStart + n * stepMs);
        }
        else if (unit === 'min') {
            d.setSeconds(0, 0);
            const minStart = d.getTime() - (d.getMinutes() % best[0]) * _MS.min;
            d.setTime(minStart);
        }
        else if (unit === 's') { d.setMilliseconds(0); }
        else if (unit === 'ms') { d.setTime(d.getTime() - (d.getTime() % stepMs)); }
        while (d.getTime() < tMin) { _addUnit(d, best[0], unit); }
        const dBack = new Date(d.getTime());
        _addUnit(dBack, -best[0], unit);
        if (dBack.getTime() >= tMin) d.setTime(dBack.getTime());
        for (let safety = 0; safety < 200; safety++) {
            const t = d.getTime();
            if (t > tMax + stepMs * 0.01) break;
            if (t >= tMin - stepMs * 0.01) ticks.push(t);
            _addUnit(d, best[0], unit);
        }
        return ticks;
    }

    function _addUnit(d, n, unit) {
        if      (unit === 'y')   d.setFullYear(d.getFullYear() + n);
        else if (unit === 'mo')  d.setMonth(d.getMonth() + n);
        else if (unit === 'w')   d.setDate(d.getDate() + n * 7);
        else if (unit === 'd')   d.setDate(d.getDate() + n);
        else                     d.setTime(d.getTime() + n * _MS[unit]);
    }

    // =========================================================================
    // FORMATTERS
    // =========================================================================
    function _fmtY(v, ticks) {
        const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
        const abs  = Math.abs(v);
        if (abs >= 1e6)  return (v/1e6).toPrecision(3) + 'M';
        if (abs >= 1e3)  return (v/1e3).toPrecision(3) + 'k';
        if (abs === 0)   return '0';
        const dec = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
        return v.toFixed(dec);
    }

    function _fmtTooltipVal(v) {
        if (!isFinite(v)) return 'NaN';
        if (v === 0)      return '0';
        const abs = Math.abs(v);
        if (abs >= 1e6)  return (v / 1e6).toPrecision(4) + ' M';
        if (abs >= 1e3)  return (v / 1e3).toPrecision(4) + ' k';
        return parseFloat(v.toPrecision(4)).toString();
    }

    function _fmtTime(t, tMin, tMax) {
        const d    = new Date(t);
        const span = tMax - tMin;
        const pad2 = n => String(n).padStart(2, '0');
        const pad3 = n => String(n).padStart(3, '0');
        const HH = pad2(d.getHours()), MM = pad2(d.getMinutes()), SS = pad2(d.getSeconds());
        const ms = pad3(d.getMilliseconds());
        const dd = pad2(d.getDate()), mo = pad2(d.getMonth() + 1);
        const yyyy = d.getFullYear();
        if (span < 5 * _MS.s)     return `${HH}:${MM}:${SS}.${ms}`;
        if (span < 5 * _MS.min)  return `${HH}:${MM}:${SS}`;
        if (span < 2 * _MS.d)    return `${HH}:${MM}`;
        if (span < 14 * _MS.d)   return `${dd}.${mo}\n${HH}:${MM}`;
        if (span < 3 * _MS.mo)   return `${dd}.${mo}`;
        if (span < 2 * _MS.y)    return `${dd}.${mo}.${yyyy}`;
        return `${yyyy}`;
    }

    // Vollformat für die Legenden-Kopfzeile (Cursor-Readout): immer
    // Wochentag, Datum und Uhrzeit, unabhängig vom Zoom-Span. Bewusst
    // getrennt von _fmtTime, da die X-Achse den Wochentag nicht braucht.
    const _WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    function _fmtLegendTime(t) {
        const d    = new Date(t);
        const pad2 = n => String(n).padStart(2, '0');
        const wd   = _WEEKDAYS[d.getDay()];
        const dd   = pad2(d.getDate()), mo = pad2(d.getMonth() + 1);
        const yyyy = d.getFullYear();
        const HH   = pad2(d.getHours()), MM = pad2(d.getMinutes());
        return `${wd}, ${dd}.${mo}.${yyyy} ${HH}:${MM}`;
    }

    // =========================================================================
    // EVENTS
    // =========================================================================
    function _attachEvents(ctx, plot) {
        const canvas = plot.canvas;

        canvas.addEventListener('mousemove', e => { _onMouseMove(ctx, plot, e); });
        canvas.addEventListener('mouseleave', () => {
            ctx.plots.forEach(p => _clearCrosshair(ctx, p));
            const dotOv = _dotOverlays.get(canvas);
            if (dotOv) dotOv.getContext('2d').clearRect(0, 0, dotOv.width, dotOv.height);
            ctx.plots.forEach(p => _resetLegendValues(ctx, p));
        });

        let dragStart = null;
        canvas.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            dragStart = _eventPos(e, canvas);
            e.preventDefault();
        });
        canvas.addEventListener('mousemove', e => {
            if (!dragStart) return;
            _drawRubberBand(ctx, plot, dragStart, _eventPos(e, canvas));
        });
        canvas.addEventListener('mouseup', e => {
            if (!dragStart || e.button !== 0) return;
            const end = _eventPos(e, canvas);
            const dx  = Math.abs(end.x - dragStart.x);
            const ov = _rubberBandOverlays.get(canvas);
            if (ov) ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
            if (dx > 5) {
                const ts   = getTimeState(ctx.className);
                const xMin = ts.zoom.tMin, xMax = ts.zoom.tMax;
                const dpr  = window.devicePixelRatio || 1;
                const W    = canvas.width, pad = _PAD.left * dpr, pw = W - pad - _PAD.right * dpr;
                const t0   = xMin + (Math.min(dragStart.x, end.x) * dpr - pad) / pw * (xMax - xMin);
                const t1   = xMin + (Math.max(dragStart.x, end.x) * dpr - pad) / pw * (xMax - xMin);
                ctx.plots.forEach(p => { p.yMin = null; p.yMax = null; });
                setZoom(ctx.className, t0, t1);
            }
            dragStart = null;
        });
        window.addEventListener('mouseup', () => {
            if (dragStart) {
                const ov = _rubberBandOverlays.get(canvas);
                if (ov) ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
            }
            dragStart = null;
        });

        canvas.addEventListener('dblclick', () => { setZoom(ctx.className); });

        // right-click: Y auto-zoom; clear yMin/yMax so next draw uses autorange.
        // _autoZoomActive blockiert onAfterDraw->setYLimits während des Draws.
        canvas.addEventListener('contextmenu', e => {
            e.preventDefault();
            ctx.plots.forEach(p => { p.yMin = null; p.yMax = null; p._autoZoomActive = true; });
            _buildRenderData(ctx);
            _drawAll(ctx);
            ctx.plots.forEach(p => {
                p._autoZoomActive = false;
                const dotOv = _dotOverlays.get(p.canvas);
                if (dotOv) dotOv.getContext('2d').clearRect(0, 0, dotOv.width, dotOv.height);

            });
        });

        _attachTouch(ctx, plot, canvas);
    }

    function _eventPos(e, canvas) {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function _onMouseMove(ctx, plot, e) {
        const pos = _eventPos(e, plot.canvas);
        const rd  = ctx.renderData?.[plot.divIndex];
        if (!rd || !rd.tx.length) return;

        const dpr  = window.devicePixelRatio || 1;
        const W    = plot.canvas.width, H = plot.canvas.height;
        const pad  = { left: _PAD.left * dpr, right: _PAD.right * dpr,
                       top: _PAD.top * dpr, bottom: _PAD.bottom * dpr };
        const pw   = W - pad.left - pad.right;
        const ts   = getTimeState(ctx.className);
        const xMin = ts.zoom.tMin, xMax = ts.zoom.tMax;

        const px  = pos.x * dpr;
        const t   = xMin + (px - pad.left) / pw * (xMax - xMin);
        const idx = _nearestIdx(rd.tx, t);
        const tx  = rd.tx[idx];

        let yValForCrosshair = null;
        plot.channels.forEach(ch => {
            const v = rd.vx[ch.name]?.[idx];
            if (isFinite(v) && yValForCrosshair === null) yValForCrosshair = v;
        });

        // cursor Y in data units for nearest-channel detection
        const ph = plot.canvas.height - (pad.top + pad.bottom);
        const py = pos.y * dpr;
        const cursorYVal = plot.yMin + (1 - (py - pad.top) / ph) * (plot.yMax - plot.yMin);

        ctx.plots.forEach(p => {
            _drawCrosshair(ctx, p, tx, yValForCrosshair, p === plot);
            // pass cursorYVal only for the hovered plot
            _updateLegendValues(ctx, p, tx, xMin, xMax, p === plot ? cursorYVal : undefined);
        });

        _drawCursorDot(ctx, plot, idx, tx, rd);
    }

    const _crosshairOverlays = new WeakMap();

    function _drawCrosshair(ctx, plot, t, yVal, isHovered) {
        let ov = _crosshairOverlays.get(plot.canvas);
        if (!ov) {
            ov = document.createElement('canvas');
            ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
            plot.div.appendChild(ov);
            _crosshairOverlays.set(plot.canvas, ov);
        }
        ov.width  = plot.canvas.width;
        ov.height = plot.canvas.height;
        const dpr  = window.devicePixelRatio || 1;
        const W    = ov.width, H = ov.height;
        const padL = _PAD.left * dpr, padR = _PAD.right * dpr;
        const padT = _PAD.top  * dpr, padB = _PAD.bottom * dpr;
        const pw   = W - padL - padR;
        const ph   = H - padT - padB;
        const ts   = getTimeState(ctx.className);
        const x    = Math.round(padL + (t - ts.zoom.tMin) / (ts.zoom.tMax - ts.zoom.tMin) * pw);

        const c = ov.getContext('2d');
        c.clearRect(0, 0, W, H);
        c.save();
        c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.lineWidth = 1.5;
        c.setLineDash([5, 3]);
        c.beginPath();
        c.moveTo(x, padT);
        c.lineTo(x, padT + ph);
        c.stroke();
        c.restore();
    }

    function _clearCrosshair(ctx, plot) {
        const ov = _crosshairOverlays.get(plot.canvas);
        if (ov) ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
    }

    const _dotOverlays = new WeakMap();

    function _drawCursorDot(ctx, plot, idx, t, rd) {
        // _drawnYMin/_drawnYMax = Y-Grenzen die tatsächlich gezeichnet wurden,
        // unabhängig davon ob onAfterDraw danach plot.yMin/yMax überschrieben hat.
        const yMin = plot._drawnYMin ?? plot.yMin;
        const yMax = plot._drawnYMax ?? plot.yMax;
        let ov = _dotOverlays.get(plot.canvas);
        if (!ov) {
            ov = document.createElement('canvas');
            ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
            plot.div.appendChild(ov);
            _dotOverlays.set(plot.canvas, ov);
        }
        ov.width  = plot.canvas.width;
        ov.height = plot.canvas.height;
        const dpr  = window.devicePixelRatio || 1;
        const W    = ov.width, H = ov.height;
        const padL = _PAD.left * dpr, padR = _PAD.right * dpr;
        const padT = _PAD.top  * dpr, padB = _PAD.bottom * dpr;
        const pw   = W - padL - padR;
        const ph   = H - padT - padB;
        const ts   = getTimeState(ctx.className);
        const c    = ov.getContext('2d');
        c.clearRect(0, 0, W, H);

        const x = padL + (t - ts.zoom.tMin) / (ts.zoom.tMax - ts.zoom.tMin) * pw;

        plot.channels.forEach((ch, ci) => {
            const v = rd.vx[ch.name]?.[idx];
            if (!isFinite(v)) return;
            const y = padT + (1 - (v - yMin) / (yMax - yMin)) * ph;
            if (y < padT || y > padT + ph) return;
            c.save();
            c.beginPath();
            c.arc(x, y, 4 * dpr, 0, Math.PI * 2);
            c.fillStyle = '#000';
            c.fill();
            c.beginPath();
            c.arc(x, y, 4 * dpr, 0, Math.PI * 2);
            c.strokeStyle = '#fff';
            c.lineWidth = 1.5 * dpr;
            c.stroke();
            c.beginPath();
            c.arc(x, y, 2.5 * dpr, 0, Math.PI * 2);
            c.fillStyle = '#000';
            c.fill();
            c.restore();
        });
    }

    const _rubberBandOverlays = new WeakMap();

    function _drawRubberBand(ctx, plot, start, end) {
        let ov = _rubberBandOverlays.get(plot.canvas);
        if (!ov) {
            ov = document.createElement('canvas');
            ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
            plot.div.appendChild(ov);
            _rubberBandOverlays.set(plot.canvas, ov);
        }
        ov.width  = plot.canvas.width;
        ov.height = plot.canvas.height;
        const dpr = window.devicePixelRatio || 1;
        const c   = ov.getContext('2d');
        c.clearRect(0, 0, ov.width, ov.height);
        const x0 = Math.min(start.x, end.x) * dpr;
        const x1 = Math.max(start.x, end.x) * dpr;
        c.save();
        c.fillStyle   = 'rgba(0,100,255,0.12)';
        c.strokeStyle = 'rgba(0,100,255,0.6)';
        c.lineWidth = 1;
        c.fillRect(x0, _PAD.top * dpr, x1 - x0, ov.height - (_PAD.top + _PAD.bottom) * dpr);
        c.strokeRect(x0, _PAD.top * dpr, x1 - x0, ov.height - (_PAD.top + _PAD.bottom) * dpr);
        c.restore();
    }

    function _attachTouch(ctx, plot, canvas) {
        let touches = {};
        let lastPinchDist = null;
        let lastPanX = null;

        canvas.addEventListener('touchstart', e => {
            touches = {};
            for (const t of e.touches) touches[t.identifier] = { x: t.clientX, y: t.clientY };
            if (e.touches.length === 1) lastPanX = e.touches[0].clientX;
            if (e.touches.length === 2) {
                lastPinchDist = _pinchDist(e.touches);
                e.preventDefault();
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', e => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = _pinchDist(e.touches);
                if (lastPinchDist) {
                    const ratio  = lastPinchDist / dist;
                    const ts     = getTimeState(ctx.className);
                    const center = (ts.zoom.tMin + ts.zoom.tMax) / 2;
                    const half   = (ts.zoom.tMax - ts.zoom.tMin) / 2 * ratio;
                    ctx.plots.forEach(p => { p.yMin = null; p.yMax = null; });
                    setZoom(ctx.className, center - half, center + half);
                }
                lastPinchDist = dist;
                lastPanX = null;
            } else if (e.touches.length === 1 && lastPanX !== null) {
                const dx = e.touches[0].clientX - lastPanX;
                const dy = e.touches[0].clientY - (touches[e.touches[0].identifier]?.y ?? e.touches[0].clientY);
                if (Math.abs(dx) > Math.abs(dy)) {
                    e.preventDefault();
                    const rect  = canvas.getBoundingClientRect();
                    const pw    = rect.width - _PAD.left - _PAD.right;
                    const ts    = getTimeState(ctx.className);
                    const range = ts.zoom.tMax - ts.zoom.tMin;
                    const shift = -dx / pw * range;
                    setZoom(ctx.className, ts.zoom.tMin + shift, ts.zoom.tMax + shift);
                    lastPanX = e.touches[0].clientX;
                }
            }
        }, { passive: false });

        canvas.addEventListener('touchend', e => {
            lastPinchDist = null;
            lastPanX = null;
            if (e.touches.length === 0) {
                const now = Date.now();
                if (canvas._lastTap && now - canvas._lastTap < 300) {
                    setZoom(ctx.className);
                    canvas._lastTap = null;
                } else {
                    canvas._lastTap = now;
                }
            }
        });
    }

    function _pinchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx*dx + dy*dy);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================
    function _usedChannels(ctx) {
        const seen = new Set();
        ctx.plots.forEach(p => p.channels.forEach(ch => seen.add(ch.name)));
        return [...seen];
    }

    function _zoomFilteredRaw(ctx) {
        const { tx, vx } = ctx.rawData;
        const ts  = getTimeState(ctx.className);
        const lo  = _bisectLeft(tx, ts.zoom.tMin);
        const hi  = _bisectRight(tx, ts.zoom.tMax);
        const fTx = tx.slice(lo, hi);
        const fVx = {};
        Object.keys(vx).forEach(ch => { fVx[ch] = vx[ch].slice(lo, hi); });
        return { tx: fTx, vx: fVx };
    }

    function _fireZoomChange(ctx) {
        if (ctx.cfg.zoomChangeHook) ctx.cfg.zoomChangeHook(getTimeState(ctx.className));
    }

    return {
        configure,
        SetMeasuringData,
        setZoom,
        getTimeState,
        getChannels,
        exportDataCsv,
        exportDataObject,
        setDebugLevel,
    };
})();

if (typeof window !== 'undefined') window.libPlot = libPlot;