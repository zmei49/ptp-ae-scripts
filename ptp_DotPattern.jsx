// ============================================================
// ptp_DotPattern.jsx
// v1.1 — Along Path + Coverage filter (cross UI)
// Author: ptp toolkit
// Install: Save into "Support Files/Scripts/ScriptUI Panels/"
// Run via: Window -> ptp_DotPattern.jsx
// ============================================================

(function ptp_DotPattern(thisObj) {

    var SCRIPT_NAME = "ptp_DotPattern";
    var SCRIPT_VERSION = "v1.1";

    var COL = {
        bg:        [0.16, 0.16, 0.17, 1],
        accentTxt: [1.00, 0.65, 0.10, 1]
    };

    var DEFAULT_ACCENT = [1.00, 0.96, 0.40];
    var DEFAULT_MICRO  = [0.79, 0.76, 0.40];

    var MAX_DOTS = 2000;
    var BEZIER_SAMPLES_PER_SEGMENT = 80;

    // ============================================================
    // HELPERS
    // ============================================================
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Откройте композицию."); return null; }
        return c;
    }

    function getSelLayer() {
        var c = getComp(); if (!c) return null;
        var s = c.selectedLayers;
        if (s.length === 0) return null;
        return s[0];
    }

    function rgbToHex(rgb) {
        function p(n){ var h=Math.round(n*255).toString(16); return h.length<2?"0"+h:h; }
        return "#" + p(rgb[0]) + p(rgb[1]) + p(rgb[2]);
    }

    function falloff(t, type) {
        var v = 1 - t;
        if (v < 0) v = 0;
        if (v > 1) v = 1;
        if (type === "ease") return v*v*v;
        if (type === "step") {
            if (v > 0.66) return 1.0;
            if (v > 0.33) return 0.5;
            return 0.2;
        }
        return v;
    }

    // ============================================================
    // SOURCE OBJECT ANALYSIS (для Around Shape mode)
    // ============================================================
    function getSourceInfo(layer) {
        var info = {kind:"rect", cx:0, cy:0, w:200, h:200, radius:0, color:DEFAULT_ACCENT.slice()};

        try {
            var pos = layer.property("Transform").property("Position").value;
            info.cx = pos[0]; info.cy = pos[1];
        } catch(e) {}

        if (layer instanceof ShapeLayer) {
            try {
                var contents = layer.property("ADBE Root Vectors Group");
                for (var i=1; i<=contents.numProperties; i++) {
                    var grp = contents.property(i);
                    var inner = grp.property("ADBE Vectors Group");
                    if (!inner) continue;
                    for (var j=1; j<=inner.numProperties; j++) {
                        var p = inner.property(j);
                        if (p.matchName === "ADBE Vector Shape - Ellipse") {
                            var sz = p.property("Size").value;
                            info.kind = "circle"; info.w = sz[0]; info.h = sz[1];
                            info.radius = Math.max(sz[0], sz[1]) / 2;
                        }
                        if (p.matchName === "ADBE Vector Shape - Rect") {
                            var sz2 = p.property("Size").value;
                            info.kind = "rect"; info.w = sz2[0]; info.h = sz2[1];
                            try { info.radius = p.property("Roundness").value; } catch(e){}
                        }
                    }
                    var hasFill = false;
                    for (var k=1; k<=inner.numProperties; k++) {
                        if (inner.property(k).matchName === "ADBE Vector Graphic - Fill") {
                            try { info.color = inner.property(k).property("Color").value; } catch(e){}
                            hasFill = true; break;
                        }
                    }
                    if (!hasFill) {
                        for (var k2=1; k2<=inner.numProperties; k2++) {
                            if (inner.property(k2).matchName === "ADBE Vector Graphic - Stroke") {
                                try { info.color = inner.property(k2).property("Color").value; } catch(e){}
                                break;
                            }
                        }
                    }
                }
            } catch(e) {}
        } else {
            try {
                var rect = layer.sourceRectAtTime(layer.containingComp.time, false);
                info.w = rect.width; info.h = rect.height; info.kind = "rect";
            } catch(e) {}
        }

        return info;
    }

    // ============================================================
    // PATH EXTRACTION (для Along Path mode)
    // ============================================================
    function findPathInLayer(layer) {
        // returns {pathProp, layerPos, layerColor} or null
        var result = null;

        // 1. Mask path? (один или несколько mask — берём первую)
        try {
            if (layer.mask && layer.mask.numProperties > 0) {
                var maskProp = layer.mask(1).property("ADBE Mask Shape");
                if (maskProp) {
                    var lpos = [0, 0];
                    try { lpos = layer.property("Transform").property("Position").value; } catch(e){}
                    return { pathProp: maskProp, layerPos: lpos, layerColor: DEFAULT_ACCENT.slice() };
                }
            }
        } catch(e) {}

        // 2. Shape path?
        if (layer instanceof ShapeLayer) {
            try {
                var color = DEFAULT_ACCENT.slice();
                var lpos2 = [0, 0];
                try { lpos2 = layer.property("Transform").property("Position").value; } catch(e){}

                var contents = layer.property("ADBE Root Vectors Group");
                for (var i=1; i<=contents.numProperties; i++) {
                    var grp = contents.property(i);
                    var inner = grp.property("ADBE Vectors Group");
                    if (!inner) continue;

                    // ищем path и цвет
                    var foundPath = null;
                    for (var j=1; j<=inner.numProperties; j++) {
                        var p = inner.property(j);
                        if (p.matchName === "ADBE Vector Shape - Group") {
                            foundPath = p.property("Path");
                        }
                        if (p.matchName === "ADBE Vector Graphic - Fill") {
                            try { color = p.property("Color").value; } catch(e){}
                        }
                        if (!foundPath && p.matchName === "ADBE Vector Graphic - Stroke") {
                            try { color = p.property("Color").value; } catch(e){}
                        }
                    }
                    if (foundPath) {
                        return { pathProp: foundPath, layerPos: lpos2, layerColor: color };
                    }
                }
            } catch(e) {}
        }

        return null;
    }

    // ============================================================
    // BEZIER SAMPLING
    // ============================================================
    function cubicBezier(t, p0, c1, c2, p3) {
        var mt = 1 - t;
        var mt2 = mt*mt, mt3 = mt2*mt;
        var t2 = t*t, t3 = t2*t;
        return [
            mt3*p0[0] + 3*mt2*t*c1[0] + 3*mt*t2*c2[0] + t3*p3[0],
            mt3*p0[1] + 3*mt2*t*c1[1] + 3*mt*t2*c2[1] + t3*p3[1]
        ];
    }

    function cubicBezierTangent(t, p0, c1, c2, p3) {
        var mt = 1 - t;
        var mt2 = mt*mt;
        var t2 = t*t;
        return [
            3*mt2*(c1[0]-p0[0]) + 6*mt*t*(c2[0]-c1[0]) + 3*t2*(p3[0]-c2[0]),
            3*mt2*(c1[1]-p0[1]) + 6*mt*t*(c2[1]-c1[1]) + 3*t2*(p3[1]-c2[1])
        ];
    }

    function samplePath(pathProp, layerPos, time) {
        // returns array of {x, y, nx, ny, arcLen} in comp coordinates
        // nx, ny — unit normal vector
        // arcLen — cumulative arc length from start
        var samples = [];
        try {
            var pathValue = pathProp.valueAtTime(time, false);
            var verts = pathValue.vertices;
            var inT = pathValue.inTangents;
            var outT = pathValue.outTangents;
            var closed = pathValue.closed;

            if (!verts || verts.length < 2) return samples;

            var segments = verts.length - 1;
            if (closed) segments = verts.length;

            for (var s=0; s<segments; s++) {
                var i0 = s;
                var i1 = (s+1) % verts.length;
                var p0 = verts[i0];
                var p3 = verts[i1];
                var c1 = [p0[0] + outT[i0][0], p0[1] + outT[i0][1]];
                var c2 = [p3[0] + inT[i1][0],  p3[1] + inT[i1][1]];

                for (var k=0; k<=BEZIER_SAMPLES_PER_SEGMENT; k++) {
                    if (s>0 && k===0) continue; // skip duplicate of previous segment's last point
                    var t = k / BEZIER_SAMPLES_PER_SEGMENT;
                    var pt = cubicBezier(t, p0, c1, c2, p3);
                    var tg = cubicBezierTangent(t, p0, c1, c2, p3);
                    var len = Math.sqrt(tg[0]*tg[0] + tg[1]*tg[1]);
                    var nx = 0, ny = 0;
                    if (len > 0.0001) {
                        // нормаль = (-ty, tx) нормализованная
                        nx = -tg[1] / len;
                        ny =  tg[0] / len;
                    }
                    samples.push({
                        x: pt[0] + layerPos[0],
                        y: pt[1] + layerPos[1],
                        nx: nx,
                        ny: ny,
                        arcLen: 0
                    });
                }
            }

            // вычисляем cumulative arc length
            samples[0].arcLen = 0;
            for (var m=1; m<samples.length; m++) {
                var dx = samples[m].x - samples[m-1].x;
                var dy = samples[m].y - samples[m-1].y;
                samples[m].arcLen = samples[m-1].arcLen + Math.sqrt(dx*dx + dy*dy);
            }
        } catch(e) {}

        return samples;
    }

    function sampleAtArcLength(samples, targetLen) {
        // линейная интерполяция между ближайшими samples
        if (samples.length === 0) return null;
        if (targetLen <= 0) return samples[0];
        for (var i=1; i<samples.length; i++) {
            if (samples[i].arcLen >= targetLen) {
                var prev = samples[i-1];
                var cur = samples[i];
                var segLen = cur.arcLen - prev.arcLen;
                if (segLen < 0.0001) return prev;
                var alpha = (targetLen - prev.arcLen) / segLen;
                return {
                    x: prev.x + alpha*(cur.x - prev.x),
                    y: prev.y + alpha*(cur.y - prev.y),
                    nx: prev.nx + alpha*(cur.nx - prev.nx),
                    ny: prev.ny + alpha*(cur.ny - prev.ny),
                    arcLen: targetLen
                };
            }
        }
        return samples[samples.length-1];
    }

    // ============================================================
    // RING GENERATION (Around Shape — концентрические кольца)
    // ============================================================
    function generateRingPoints(info, distance, spacing) {
        var points = [];
        if (info.kind === "circle") {
            var R = info.radius + distance;
            if (R <= 0) return points;
            var circ = 2 * Math.PI * R;
            var count = Math.max(4, Math.floor(circ / spacing));
            var step = (2 * Math.PI) / count;
            for (var i=0; i<count; i++) {
                var a = i * step;
                points.push({
                    x: info.cx + R * Math.cos(a),
                    y: info.cy + R * Math.sin(a)
                });
            }
        } else {
            var hw = info.w/2 + distance;
            var hh = info.h/2 + distance;
            if (hw <= 0 || hh <= 0) return points;
            var left   = info.cx - hw;
            var right  = info.cx + hw;
            var top    = info.cy - hh;
            var bottom = info.cy + hh;

            var topCount = Math.max(2, Math.floor((right - left) / spacing));
            for (var t=0; t<=topCount; t++) {
                points.push({ x: left + t*(right-left)/topCount, y: top });
            }
            var sideCount = Math.max(1, Math.floor((bottom - top) / spacing));
            for (var s=1; s<sideCount; s++) {
                points.push({ x: right, y: top + s*(bottom-top)/sideCount });
            }
            for (var b=topCount; b>=0; b--) {
                points.push({ x: left + b*(right-left)/topCount, y: bottom });
            }
            for (var l=sideCount-1; l>=1; l--) {
                points.push({ x: left, y: top + l*(bottom-top)/sideCount });
            }
        }
        return points;
    }

    // ============================================================
    // COVERAGE FILTER (cross UI)
    // ============================================================
    function passesCoverageAround(pt, info, coverage) {
        // coverage = {top, bot, left, right, center}
        // center=true означает "обе оси активны" — все точки проходят
        if (coverage.center) {
            // фильтруем только по 4 направлениям
            var dx = pt.x - info.cx;
            var dy = pt.y - info.cy;
            var absDx = Math.abs(dx);
            var absDy = Math.abs(dy);

            // определяем доминирующее направление
            if (absDy >= absDx) {
                // вертикальное — top или bot
                if (dy < 0) return coverage.top;
                else return coverage.bot;
            } else {
                // горизонтальное — left или right
                if (dx < 0) return coverage.left;
                else return coverage.right;
            }
        } else {
            // строгое деление по cy/cx, угловые точки могут не попасть
            var passY = true, passX = true;
            var dy2 = pt.y - info.cy;
            var dx2 = pt.x - info.cx;
            if (dy2 < 0 && !coverage.top) passY = false;
            if (dy2 > 0 && !coverage.bot) passY = false;
            if (dx2 < 0 && !coverage.left) passX = false;
            if (dx2 > 0 && !coverage.right) passX = false;
            return passY && passX;
        }
    }

    // ============================================================
    // AROUND SHAPE GENERATION
    // ============================================================
    function generateAroundPattern(info, opts) {
        var microPts = [];
        var accentPts = [];

        var ringCount = Math.max(1, Math.floor(opts.spread / opts.microSpacing));
        var ringDistances = [];
        for (var r=0; r<=ringCount; r++) {
            ringDistances.push(opts.padding + r * opts.microSpacing);
        }

        var innerRing  = 0;
        var outerRing  = ringDistances.length - 1;
        var middleRing = Math.floor(ringDistances.length / 2);

        var accentRingSet = {};
        if (opts.accentInner)  accentRingSet[innerRing]  = true;
        if (opts.accentMiddle) accentRingSet[middleRing] = true;
        if (opts.accentOuter)  accentRingSet[outerRing]  = true;

        for (var i=0; i<ringDistances.length; i++) {
            var ringPts = generateRingPoints(info, ringDistances[i], opts.microSpacing);
            var isAccentRing = accentRingSet[i] === true;
            var tt = ringDistances.length > 1 ? (i / (ringDistances.length-1)) : 0;
            var op = opts.noFade ? 1.0 : falloff(tt, opts.falloff);

            for (var j=0; j<ringPts.length; j++) {
                var pt = ringPts[j];
                if (!passesCoverageAround(pt, info, opts.coverage)) continue;

                if (isAccentRing && (j % opts.accentEveryN === 0)) {
                    accentPts.push({x: pt.x, y: pt.y, opacity: 1.0});
                } else {
                    if (Math.random() > opts.density) continue;
                    microPts.push({x: pt.x, y: pt.y, opacity: op});
                }
            }
        }
        return { microPts: microPts, accentPts: accentPts };
    }

    // ============================================================
    // ALONG PATH GENERATION
    // ============================================================
    function generateAlongPattern(samples, opts) {
        var microPts = [];
        var accentPts = [];

        if (samples.length < 2) return { microPts: microPts, accentPts: accentPts };

        var totalLen = samples[samples.length-1].arcLen;
        if (totalLen < opts.microSpacing) return { microPts: microPts, accentPts: accentPts };

        // вычисляем точки вдоль пути
        var anchorCount = Math.floor(totalLen / opts.microSpacing);
        var anchors = [];
        for (var i=0; i<=anchorCount; i++) {
            var targetLen = i * opts.microSpacing;
            var sm = sampleAtArcLength(samples, targetLen);
            if (sm) anchors.push(sm);
        }

        // определяем перпендикулярные "кольца" — offsets от пути
        var ringCount = Math.max(1, Math.floor(opts.spread / opts.microSpacing));
        var offsets = []; // расстояние и знак (положительное = nx,ny; отрицательное = противоположное)

        // padding отступ от самого пути
        for (var r=1; r<=ringCount; r++) {
            offsets.push(opts.padding + r * opts.microSpacing); // одна сторона нормали
            offsets.push(-(opts.padding + r * opts.microSpacing)); // другая сторона
        }

        // accent rings — inner/middle/outer на одной стороне; для симметрии добавим оба
        var maxOffset = opts.padding + ringCount * opts.microSpacing;
        var innerOffset = opts.padding + opts.microSpacing;
        var middleOffset = opts.padding + Math.floor(ringCount/2) * opts.microSpacing;
        var outerOffset = maxOffset;

        var accentOffsets = {};
        if (opts.accentInner)  { accentOffsets[innerOffset] = true; accentOffsets[-innerOffset] = true; }
        if (opts.accentMiddle) { accentOffsets[middleOffset] = true; accentOffsets[-middleOffset] = true; }
        if (opts.accentOuter)  { accentOffsets[outerOffset] = true; accentOffsets[-outerOffset] = true; }

        for (var k=0; k<anchors.length; k++) {
            var anchor = anchors[k];
            // позиция вдоль пути (для coverage left/right)
            var alongT = k / Math.max(1, anchors.length-1); // 0 — начало, 1 — конец
            var passAlong = true;
            // если coverage.center выключен, фильтруем по left/right вдоль пути
            if (!opts.coverage.center) {
                if (alongT < 0.5 && !opts.coverage.left) passAlong = false;
                if (alongT > 0.5 && !opts.coverage.right) passAlong = false;
            }

            for (var o=0; o<offsets.length; o++) {
                var off = offsets[o];
                var side = off > 0 ? "top" : "bot";

                // coverage по сторонам нормали (top=positive normal, bot=negative)
                if (!opts.coverage.center) {
                    if (side === "top" && !opts.coverage.top) continue;
                    if (side === "bot" && !opts.coverage.bot) continue;
                    if (!passAlong) continue;
                } else {
                    if (side === "top" && !opts.coverage.top) continue;
                    if (side === "bot" && !opts.coverage.bot) continue;
                }

                var px = anchor.x + anchor.nx * off;
                var py = anchor.y + anchor.ny * off;

                var absOff = Math.abs(off);
                var tt = (absOff - opts.padding) / opts.spread;
                if (tt < 0) tt = 0; if (tt > 1) tt = 1;
                var op = opts.noFade ? 1.0 : falloff(tt, opts.falloff);

                // accent?
                var isAccentOffset = false;
                for (var keyOff in accentOffsets) {
                    if (Math.abs(parseFloat(keyOff) - off) < 0.5) { isAccentOffset = true; break; }
                }

                if (isAccentOffset && (k % opts.accentEveryN === 0)) {
                    accentPts.push({x: px, y: py, opacity: 1.0});
                } else {
                    if (Math.random() > opts.density) continue;
                    microPts.push({x: px, y: py, opacity: op});
                }
            }

            // плюс точки на самом пути (offset = 0) — accent inner edge для path
            if (opts.padding === 0 && (opts.accentInner || (k % opts.accentEveryN !== 0))) {
                // skip — обрабатывается в общем цикле через padding=0
            }
        }

        return { microPts: microPts, accentPts: accentPts };
    }

    // ============================================================
    // LAYER CREATION
    // ============================================================
    function createDotLayer(comp, name, dots, size, color) {
        if (dots.length === 0) return null;

        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (var i=0; i<dots.length; i++) {
            if (dots[i].x < minX) minX = dots[i].x;
            if (dots[i].x > maxX) maxX = dots[i].x;
            if (dots[i].y < minY) minY = dots[i].y;
            if (dots[i].y > maxY) maxY = dots[i].y;
        }
        var cx = (minX + maxX) / 2;
        var cy = (minY + maxY) / 2;

        var layer = comp.layers.addShape();
        layer.name = name;
        layer.property("Transform").property("Position").setValue([cx, cy]);
        layer.property("Transform").property("Anchor Point").setValue([0, 0]);

        var contents = layer.property("ADBE Root Vectors Group");
        var buckets = {};
        for (var d=0; d<dots.length; d++) {
            var key = Math.round((dots[d].opacity || 1) * 20) / 20;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(dots[d]);
        }
        for (var bkey in buckets) {
            if (!buckets.hasOwnProperty(bkey)) continue;
            var arr = buckets[bkey];
            var g = contents.addProperty("ADBE Vector Group");
            g.name = "Dots_op" + bkey;
            var inn = g.property("ADBE Vectors Group");
            for (var dd=0; dd<arr.length; dd++) {
                addCircle(inn, arr[dd].x - cx, arr[dd].y - cy, size);
            }
            var fl = inn.addProperty("ADBE Vector Graphic - Fill");
            fl.property("Color").setValue(color);
            try { g.property("Transform").property("Opacity").setValue(parseFloat(bkey) * 100); } catch(e){}
        }
        return layer;
    }

    function addCircle(inner, x, y, size) {
        var ell = inner.addProperty("ADBE Vector Shape - Ellipse");
        ell.property("Size").setValue([size, size]);
        try { ell.property("Position").setValue([x, y]); } catch(e){}
    }

    // ============================================================
    // MODE DETECTION
    // ============================================================
    function detectMode(layer) {
        // returns "around" | "along" | "unknown"
        if (!layer) return "unknown";

        // приоритет 1: маска
        try {
            if (layer.mask && layer.mask.numProperties > 0) return "along";
        } catch(e){}

        if (layer instanceof ShapeLayer) {
            try {
                var contents = layer.property("ADBE Root Vectors Group");
                var hasRectOrEllipse = false;
                var hasCustomPath = false;
                for (var i=1; i<=contents.numProperties; i++) {
                    var grp = contents.property(i);
                    var inner = grp.property("ADBE Vectors Group");
                    if (!inner) continue;
                    for (var j=1; j<=inner.numProperties; j++) {
                        var p = inner.property(j);
                        if (p.matchName === "ADBE Vector Shape - Rect") hasRectOrEllipse = true;
                        if (p.matchName === "ADBE Vector Shape - Ellipse") hasRectOrEllipse = true;
                        if (p.matchName === "ADBE Vector Shape - Group") hasCustomPath = true;
                    }
                }
                if (hasRectOrEllipse) return "around";
                if (hasCustomPath) return "along";
            } catch(e){}
        }

        return "around"; // fallback for Solid/Footage
    }

    // ============================================================
    // MAIN
    // ============================================================
    function generatePattern(target, opts) {
        var comp = target.containingComp;

        // определяем режим
        var mode = opts.modeForce;
        if (mode === "auto") mode = detectMode(target);

        var result;
        var sourceColor = DEFAULT_ACCENT.slice();

        if (mode === "along") {
            var pathData = findPathInLayer(target);
            if (!pathData) {
                alert("Along Path: не найден путь.\n\nВыделите слой с маской (Mask Path) или Shape Layer с произвольным Path.");
                return null;
            }
            sourceColor = pathData.layerColor;
            var samples = samplePath(pathData.pathProp, pathData.layerPos, comp.time);
            if (samples.length < 2) {
                alert("Along Path: путь слишком короткий или повреждён.");
                return null;
            }
            result = generateAlongPattern(samples, opts);
        } else {
            var info = getSourceInfo(target);
            sourceColor = info.color;
            result = generateAroundPattern(info, opts);
        }

        var accentColor = opts.useObjectColorAccent ? sourceColor : opts.accentColor;
        var microColor  = opts.useObjectColorMicro  ? sourceColor : opts.microColor;

        var totalDots = result.microPts.length + result.accentPts.length;
        if (totalDots > MAX_DOTS) {
            alert("Слишком много точек (" + totalDots + " > " + MAX_DOTS + ").\nУменьши Spread / увеличь Spacing / снизь Density.");
            return null;
        }

        var layers = [];
        if (opts.generateMicro && result.microPts.length > 0) {
            var microLayer = createDotLayer(comp, "DotPattern_Micro", result.microPts, opts.microSize, microColor);
            if (microLayer) layers.push(microLayer);
        }
        if (result.accentPts.length > 0) {
            var accentLayer = createDotLayer(comp, "DotPattern_Accent", result.accentPts, opts.accentSize, accentColor);
            if (accentLayer) layers.push(accentLayer);
        }

        if (opts.precomp && layers.length > 0) {
            var indices = [];
            for (var k=0; k<layers.length; k++) indices.push(layers[k].index);
            indices.sort(function(a,b){return b-a;});
            try {
                var preName = "DotPattern_" + Math.floor(Math.random()*1000);
                comp.layers.precompose(indices, preName, true);
            } catch(e){ alert("Pre-comp error: " + e.toString()); }
        }
        if (opts.parentToSource && layers.length > 0) {
            try { for (var l=0; l<layers.length; l++) layers[l].parent = target; } catch(e){}
        }

        return layers;
    }

    var lastOpts = null;
    var lastTargetIndex = -1;

    // ============================================================
    // UI
    // ============================================================
    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel) ? thisObj :
                  new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION,
                  undefined, {resizeable:true, closeButton:true});

        win.bg = COL.bg;
        win.margins = 10;
        win.spacing = 5;
        win.orientation = "column";
        win.alignChildren = ["fill","top"];

        var header = win.add("group");
        header.alignChildren = ["fill","center"];
        var titleTxt = header.add("statictext", undefined, SCRIPT_NAME + " " + SCRIPT_VERSION);
        try { titleTxt.graphics.foregroundColor = titleTxt.graphics.newPen(titleTxt.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1); } catch(e){}
        var helpBtn = header.add("button", undefined, "?");
        helpBtn.preferredSize = [26, 22];
        helpBtn.alignment = ["right","center"];
        addDivider(win);

        var state = {
            modeForce: "auto",
            coverage: { top:true, bot:true, left:true, right:true, center:true },
            generateMicro: true,
            microColor: DEFAULT_MICRO.slice(),
            useObjectColorMicro: false,
            microSize: 2,
            microSpacing: 8,
            padding: 40,
            spread: 120,
            density: 0.7,
            falloff: "linear",
            noFade: false,
            accentColor: DEFAULT_ACCENT.slice(),
            useObjectColorAccent: false,
            accentSize: 6,
            accentEveryN: 6,
            accentInner: false,
            accentMiddle: true,
            accentOuter: false,
            precomp: false,
            parentToSource: false
        };

        // ===== MODE =====
        addSectionLabel(win, "MODE");
        var modeRow = win.add("group");
        modeRow.add("statictext", undefined, "Mode:");
        var modeDD = modeRow.add("dropdownlist", undefined, ["Auto-detect", "Around Shape", "Along Path"]);
        modeDD.selection = 0;

        // ===== COVERAGE (cross UI) =====
        var covLabel = win.add("statictext", undefined, "Coverage:");
        try { covLabel.graphics.foregroundColor = covLabel.graphics.newPen(covLabel.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1); } catch(e){}

        var covGroup = win.add("group");
        covGroup.orientation = "column";
        covGroup.alignChildren = ["center","center"];
        covGroup.spacing = 2;

        var rowTop = covGroup.add("group");
        rowTop.alignChildren = ["center","center"];
        rowTop.add("statictext", undefined, "       ");
        var cbTop = rowTop.add("checkbox", undefined, " Top");
        cbTop.value = true;

        var rowMid = covGroup.add("group");
        rowMid.alignChildren = ["center","center"];
        var cbLeft = rowMid.add("checkbox", undefined, "Left ");
        cbLeft.value = true;
        var cbCenter = rowMid.add("checkbox", undefined, " ◆ ");
        cbCenter.value = true;
        var cbRight = rowMid.add("checkbox", undefined, " Right");
        cbRight.value = true;

        var rowBot = covGroup.add("group");
        rowBot.alignChildren = ["center","center"];
        rowBot.add("statictext", undefined, "       ");
        var cbBot = rowBot.add("checkbox", undefined, " Bot");
        cbBot.value = true;

        addDivider(win);

        // ===== MICRO GRID =====
        addSectionLabel(win, "MICRO GRID");
        var microCheck = win.add("checkbox", undefined, "Generate micro grid");
        microCheck.value = true;

        var mR1 = win.add("group");
        mR1.add("statictext", undefined, "Size:");
        var mSizeSlider = mR1.add("slider", undefined, 2, 1, 8);
        mSizeSlider.preferredSize = [110, 20];
        var mSizeVal = mR1.add("statictext", undefined, "2 px");
        mSizeVal.preferredSize = [50,20];

        var mR2 = win.add("group");
        mR2.add("statictext", undefined, "Color:");
        var mSwatch = mR2.add("button", undefined, "");
        mSwatch.preferredSize = [24, 22];
        styleSwatch(mSwatch, state.microColor);
        var useObjMicro = mR2.add("checkbox", undefined, "Use obj color");

        var mR3 = win.add("group");
        mR3.add("statictext", undefined, "Spacing:");
        var mSpacingSlider = mR3.add("slider", undefined, 8, 4, 30);
        mSpacingSlider.preferredSize = [110, 20];
        var mSpacingVal = mR3.add("statictext", undefined, "8 px");
        mSpacingVal.preferredSize = [50,20];

        var mR4 = win.add("group");
        mR4.add("statictext", undefined, "Padding:");
        var paddingSlider = mR4.add("slider", undefined, 40, 0, 200);
        paddingSlider.preferredSize = [110, 20];
        var paddingVal = mR4.add("statictext", undefined, "40 px");
        paddingVal.preferredSize = [50,20];

        var mR5 = win.add("group");
        mR5.add("statictext", undefined, "Spread:");
        var spreadSlider = mR5.add("slider", undefined, 120, 20, 400);
        spreadSlider.preferredSize = [110, 20];
        var spreadVal = mR5.add("statictext", undefined, "120 px");
        spreadVal.preferredSize = [50,20];

        var mR6 = win.add("group");
        mR6.add("statictext", undefined, "Density:");
        var densitySlider = mR6.add("slider", undefined, 70, 20, 100);
        densitySlider.preferredSize = [110, 20];
        var densityVal = mR6.add("statictext", undefined, "70%");
        densityVal.preferredSize = [50,20];

        var mR7 = win.add("group");
        mR7.add("statictext", undefined, "Falloff:");
        var falloffDD = mR7.add("dropdownlist", undefined, ["linear","ease","step"]);
        falloffDD.selection = 0;
        var noFadeCheck = mR7.add("checkbox", undefined, "No fade");

        addDivider(win);

        // ===== ACCENT DOTS =====
        addSectionLabel(win, "ACCENT DOTS");

        var aR1 = win.add("group");
        aR1.add("statictext", undefined, "Size:");
        var aSizeSlider = aR1.add("slider", undefined, 6, 2, 20);
        aSizeSlider.preferredSize = [110, 20];
        var aSizeVal = aR1.add("statictext", undefined, "6 px");
        aSizeVal.preferredSize = [50,20];

        var aR2 = win.add("group");
        aR2.add("statictext", undefined, "Color:");
        var aSwatch = aR2.add("button", undefined, "");
        aSwatch.preferredSize = [24, 22];
        styleSwatch(aSwatch, state.accentColor);
        var useObjAccent = aR2.add("checkbox", undefined, "Use obj color");

        var aR3 = win.add("group");
        aR3.add("statictext", undefined, "Every N-th:");
        var nthSlider = aR3.add("slider", undefined, 6, 2, 20);
        nthSlider.preferredSize = [110, 20];
        var nthVal = aR3.add("statictext", undefined, "6");
        nthVal.preferredSize = [50,20];

        var aR4 = win.add("group");
        aR4.add("statictext", undefined, "Rings:");
        var ringInner  = aR4.add("checkbox", undefined, "Inner");
        var ringMiddle = aR4.add("checkbox", undefined, "Middle");
        var ringOuter  = aR4.add("checkbox", undefined, "Outer");
        ringMiddle.value = true;

        addDivider(win);

        addSectionLabel(win, "OUTPUT");
        var precompCheck = win.add("checkbox", undefined, "Pre-comp result");
        var parentCheck = win.add("checkbox", undefined, "Parent to source");

        addDivider(win);
        var bCreate = win.add("button", undefined, "Create Pattern");
        var bRegen = win.add("button", undefined, "Re-generate Last");

        // HANDLERS
        function readState() {
            var modeMap = ["auto", "around", "along"];
            state.modeForce = modeMap[modeDD.selection.index];
            state.coverage.top    = cbTop.value;
            state.coverage.bot    = cbBot.value;
            state.coverage.left   = cbLeft.value;
            state.coverage.right  = cbRight.value;
            state.coverage.center = cbCenter.value;
            state.generateMicro = microCheck.value;
            state.useObjectColorMicro = useObjMicro.value;
            state.microSize = mSizeSlider.value;
            state.microSpacing = mSpacingSlider.value;
            state.padding = paddingSlider.value;
            state.spread = spreadSlider.value;
            state.density = densitySlider.value / 100;
            state.falloff = falloffDD.selection.text;
            state.noFade = noFadeCheck.value;
            state.useObjectColorAccent = useObjAccent.value;
            state.accentSize = aSizeSlider.value;
            state.accentEveryN = Math.max(2, Math.round(nthSlider.value));
            state.accentInner = ringInner.value;
            state.accentMiddle = ringMiddle.value;
            state.accentOuter = ringOuter.value;
            state.precomp = precompCheck.value;
            state.parentToSource = parentCheck.value;
        }

        mSizeSlider.onChanging = function(){ mSizeVal.text = Math.round(mSizeSlider.value) + " px"; };
        mSpacingSlider.onChanging = function(){ mSpacingVal.text = Math.round(mSpacingSlider.value) + " px"; };
        paddingSlider.onChanging = function(){ paddingVal.text = Math.round(paddingSlider.value) + " px"; };
        spreadSlider.onChanging = function(){ spreadVal.text = Math.round(spreadSlider.value) + " px"; };
        densitySlider.onChanging = function(){ densityVal.text = Math.round(densitySlider.value) + "%"; };
        aSizeSlider.onChanging = function(){ aSizeVal.text = Math.round(aSizeSlider.value) + " px"; };
        nthSlider.onChanging = function(){ nthVal.text = Math.round(nthSlider.value).toString(); };

        function pickColor(swatch, key) {
            return function() {
                var hex = rgbToHex(state[key]);
                var picked = $.colorPicker(parseInt(hex.replace("#",""),16));
                if (picked < 0) return;
                var r = (picked >> 16) & 0xFF;
                var g = (picked >> 8) & 0xFF;
                var b = picked & 0xFF;
                state[key] = [r/255, g/255, b/255];
                styleSwatch(swatch, state[key]);
            };
        }
        aSwatch.onClick = pickColor(aSwatch, "accentColor");
        mSwatch.onClick = pickColor(mSwatch, "microColor");

        bCreate.onClick = function() {
            var L = getSelLayer();
            if (!L) { alert("Выделите объект-направляющую."); return; }
            readState();
            app.beginUndoGroup("DotPattern: Create");
            try {
                generatePattern(L, state);
                lastOpts = cloneOpts(state);
                lastTargetIndex = L.index;
            } catch(e) { alert("Generate error: " + e.toString()); }
            app.endUndoGroup();
        };

        bRegen.onClick = function() {
            if (!lastOpts) { alert("Нет сохранённых настроек."); return; }
            var comp = getComp(); if (!comp) return;
            var target = null;
            try { target = comp.layer(lastTargetIndex); } catch(e){}
            if (!target) {
                var sel = getSelLayer();
                if (!sel) { alert("Источник недоступен."); return; }
                target = sel;
            }
            app.beginUndoGroup("DotPattern: Re-generate");
            try { generatePattern(target, lastOpts); } catch(e) { alert("Re-gen error: " + e.toString()); }
            app.endUndoGroup();
        };

        helpBtn.onClick = showHelp;

        win.layout.layout(true);
        if (win instanceof Window) { win.center(); win.show(); }
        return win;
    }

    function cloneOpts(o) {
        var n = {};
        for (var k in o) {
            if (!o.hasOwnProperty(k)) continue;
            if (o[k] instanceof Array) n[k] = o[k].slice();
            else if (o[k] && typeof o[k] === "object") {
                n[k] = {};
                for (var kk in o[k]) { if (o[k].hasOwnProperty(kk)) n[k][kk] = o[k][kk]; }
            }
            else n[k] = o[k];
        }
        return n;
    }

    function addDivider(parent) {
        var d = parent.add("panel");
        d.preferredSize.height = 1;
        d.alignment = ["fill","top"];
    }
    function addSectionLabel(parent, text) {
        var t = parent.add("statictext", undefined, text);
        try { t.graphics.foregroundColor = t.graphics.newPen(t.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1); } catch(e){}
    }
    function styleSwatch(btn, rgb) {
        try {
            btn.fillBrush = btn.graphics.newBrush(btn.graphics.BrushType.SOLID_COLOR, [rgb[0], rgb[1], rgb[2], 1]);
            btn.onDraw = function() {
                btn.graphics.drawOSControl();
                btn.graphics.rectPath(2,2,btn.size[0]-4, btn.size[1]-4);
                btn.graphics.fillPath(btn.fillBrush);
            };
        } catch(e){}
    }

    function showHelp() {
        var w = new Window("dialog", "ptp_DotPattern — Справка", undefined, {resizeable:true});
        w.preferredSize = [600, 680];
        w.margins = 12;
        var txt = w.add("edittext", undefined, getHelpText(), {multiline:true, scrolling:true, readonly:true});
        txt.preferredSize = [580, 600];
        var btn = w.add("button", undefined, "Закрыть");
        btn.onClick = function(){ w.close(); };
        w.center(); w.show();
    }

    function getHelpText() {
        return [
            "ptp_DotPattern v1.1 — генератор точечных паттернов",
            "═══════════════════════════════════════════════════════",
            "",
            "═══ MODE ═══",
            "Auto-detect — скрипт сам определяет режим:",
            "  • Слой с маской → Along Path (по пути маски)",
            "  • Shape Layer с Rect/Ellipse → Around Shape",
            "  • Shape Layer с произвольным Path → Along Path",
            "  • Solid/Footage → Around Shape (по bounding box)",
            "Around Shape — форсировать вокруг bounding box",
            "Along Path  — форсировать вдоль пути (нужна маска или",
            "              Shape с custom path)",
            "",
            "═══ COVERAGE (крест-чекбоксы) ═══",
            "Фильтр направлений генерации точек:",
            "",
            "         ☑ Top",
            "  ☑ Left ☑ ◆ ☑ Right",
            "         ☑ Bot",
            "",
            "Around Shape:",
            "  Top/Bot/Left/Right — какие стороны от центра объекта",
            "  ◆ (Center) — все 4 направления активны (default)",
            "  Сняв ◆, можно делать угловые сектора (только верх-лево)",
            "",
            "Along Path:",
            "  Top/Bot — какая сторона нормали пути",
            "  Left/Right — первая или вторая половина пути",
            "  Логика та же: ◆ — все, без ◆ — комбинации",
            "",
            "═══ MICRO GRID ═══",
            "  Size / Color / Spacing / Padding / Spread / Density",
            "  Falloff: linear / ease / step — затухание opacity",
            "  No fade — все точки 100% opacity",
            "  Use obj color — взять Fill цвет исходника",
            "",
            "═══ ACCENT DOTS ═══",
            "Крупные точки на выбранных кольцах. Заменяют micro.",
            "  Every N-th — каждая N-я точка ряда становится accent",
            "  Rings: Inner / Middle / Outer (можно несколько)",
            "Для Along Path 'кольца' это offset от пути по нормали",
            "по обе стороны.",
            "",
            "═══ OUTPUT ═══",
            "  Pre-comp result — собрать в pre-comp",
            "  Parent to source — линковать к источнику",
            "",
            "═══ WORKFLOW: ALONG PATH ═══",
            "1. Нарисуй маску (Pen Tool) на любом слое",
            "   ИЛИ создай Shape Layer с произвольной кривой",
            "2. Выдели сам слой (Mask Path выделять необязательно —",
            "   возьмётся первая маска автоматически)",
            "3. Mode: Auto-detect (или явно Along Path)",
            "4. Padding = 0 для точек прямо на пути,",
            "   Padding > 0 для отступа от пути",
            "5. Coverage:",
            "   • ◆ + Top + Bot = по обе стороны пути",
            "   • Без ◆, только Top = одна сторона нормали",
            "   • Without ◆, только Left = только в начале пути",
            "6. Create Pattern",
            "",
            "═══ ОГРАНИЧЕНИЯ v1.1 ═══",
            "• Path берётся без учёта Scale/Rotation слоя",
            "  (только Position) — если path трансформирован,",
            "  результат может быть смещён. Фикс в v1.2.",
            "• Замкнутые пути обходятся по кругу,",
            "  открытые — от начала к концу.",
            "• Максимум 2000 точек.",
            "• Bezier samples per segment: 80 (фиксированно).",
            "",
            "═══ ПЛАН ═══",
            "v1.2 — Element types: Dot/Cross/Line/Square/Triangle",
            "       (для D37/D38/D39/D40 рефов)",
            "v1.3 — Полная матрица transform для path",
            "v1.4 — Fill mode (заполнение всей композиции)"
        ].join("\n");
    }

    buildUI(thisObj);

})(this);


Патч — заменить функции в ptp_DotPattern.jsx

Найди и замени следующие блоки целиком.
1. Coverage filters (новые / переписанные)

// === COVERAGE: STRIP ===
function passesCoverageStrip(pt, info, cov, opts) {
    // cov.strip = {top, bottom, left, right, center}
    if (!cov.strip) return false;
    var s = cov.strip;
    if (!s.top && !s.bottom && !s.left && !s.right && !s.center) return false;

    var cx = info.cx, cy = info.cy;
    var halfW = info.w / 2;
    var halfH = info.h / 2;
    var pad = opts.padding;
    var spread = opts.spread;
    var buf = opts.microSpacing * 2; // буферная зона для Center

    var x = pt[0], y = pt[1];
    var dx = x - cx, dy = y - cy;

    // Center buffer: кольцо толщиной buf вплотную к границе объекта по периметру
    if (s.center) {
        var nearLeft   = (x >= cx - halfW - buf) && (x <= cx - halfW + buf) && (y >= cy - halfH - buf) && (y <= cy + halfH + buf);
        var nearRight  = (x >= cx + halfW - buf) && (x <= cx + halfW + buf) && (y >= cy - halfH - buf) && (y <= cy + halfH + buf);
        var nearTop    = (y >= cy - halfH - buf) && (y <= cy - halfH + buf) && (x >= cx - halfW - buf) && (x <= cx + halfW + buf);
        var nearBottom = (y >= cy + halfH - buf) && (y <= cy + halfH + buf) && (x >= cx - halfW - buf) && (x <= cx + halfW + buf);
        if (nearLeft || nearRight || nearTop || nearBottom) return true;
    }

    // Top strip: строго над объектом, ширина = ширина объекта + spread по бокам? Нет — Вариант 1: строго над
    // X ∈ [cx - halfW - spread, cx + halfW + spread], Y ∈ [cy - halfH - spread - pad, cy - halfH - pad]
    if (s.top) {
        if (y < cy - halfH - pad && y >= cy - halfH - pad - spread &&
            x >= cx - halfW - spread && x <= cx + halfW + spread) {
            // исключаем углы, чтобы не пересекаться с Left/Right (Вариант 1: только над объектом)
            // строго над: X в пределах объекта
            if (x >= cx - halfW && x <= cx + halfW) return true;
            // боковые части полосы — только если включены Left/Right соответственно
            if (x < cx - halfW && s.left) return true;
            if (x > cx + halfW && s.right) return true;
        }
    }
    if (s.bottom) {
        if (y > cy + halfH + pad && y <= cy + halfH + pad + spread &&
            x >= cx - halfW - spread && x <= cx + halfW + spread) {
            if (x >= cx - halfW && x <= cx + halfW) return true;
            if (x < cx - halfW && s.left) return true;
            if (x > cx + halfW && s.right) return true;
        }
    }
    if (s.left) {
        if (x < cx - halfW - pad && x >= cx - halfW - pad - spread &&
            y >= cy - halfH - spread && y <= cy + halfH + spread) {
            if (y >= cy - halfH && y <= cy + halfH) return true;
            if (y < cy - halfH && s.top) return true;
            if (y > cy + halfH && s.bottom) return true;
        }
    }
    if (s.right) {
        if (x > cx + halfW + pad && x <= cx + halfW + pad + spread &&
            y >= cy - halfH - spread && y <= cy + halfH + spread) {
            if (y >= cy - halfH && y <= cy + halfH) return true;
            if (y < cy - halfH && s.top) return true;
            if (y > cy + halfH && s.bottom) return true;
        }
    }

    return false;
}

// === COVERAGE: ARC ===
function passesCoverageArc(pt, info, cov, arcAngle) {
    if (!cov.arc) return false;
    var a = cov.arc;
    if (!a.top && !a.bottom && !a.left && !a.right && !a.center) return false;

    var cx = info.cx, cy = info.cy;
    var dx = pt[0] - cx;
    var dy = pt[1] - cy;
    // угол в градусах: 0° = вправо, 90° = вниз (AE Y направлен вниз), -90° = вверх
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    // нормализуем к [0, 360)
    if (ang < 0) ang += 360;

    var half = arcAngle / 2;
    var centerBoost = a.center ? 10 : 0; // расширение сектора при ◆

    // Top center = 270° (вверх в AE координатах)
    // Right center = 0°
    // Bottom center = 90°
    // Left center = 180°
    function inSector(centerDeg, hh) {
        var d = Math.abs(ang - centerDeg);
        if (d > 180) d = 360 - d;
        return d <= (hh + centerBoost);
    }

    if (a.top    && inSector(270, half)) return true;
    if (a.right  && inSector(0,   half)) return true;
    if (a.bottom && inSector(90,  half)) return true;
    if (a.left   && inSector(180, half)) return true;

    return false;
}

// Объединяющая функция
function passesCoverageAround(pt, info, cov, opts) {
    // OR: точка проходит если её принимает Strip ИЛИ Arc
    if (passesCoverageStrip(pt, info, cov, opts)) return true;
    if (passesCoverageArc(pt, info, cov, opts.arcAngle)) return true;
    return false;
}

2. generateAroundPattern — генерация полного поля и фильтрация

Заменить целиком:

function generateAroundPattern(info, opts) {
    var cx = info.cx, cy = info.cy;
    var halfW = info.w / 2, halfH = info.h / 2;
    var pad = opts.padding;
    var spread = opts.spread;
    var spacing = opts.microSpacing;

    // Генерим прямоугольное поле точек вокруг объекта в максимальном bbox: 
    // от (cx - halfW - pad - spread) до (cx + halfW + pad + spread) — и фильтруем
    var x0 = cx - halfW - pad - spread;
    var x1 = cx + halfW + pad + spread;
    var y0 = cy - halfH - pad - spread;
    var y1 = cy + halfH + pad + spread;

    var allPoints = [];
    var maxOffset = pad + spread;

    for (var y = y0; y <= y1; y += spacing) {
        for (var x = x0; x <= x1; x += spacing) {
            // пропуск внутренней области (внутри объекта + padding)
            if (x > cx - halfW - pad && x < cx + halfW + pad &&
                y > cy - halfH - pad && y < cy + halfH + pad) continue;

            var pt = [x, y];
            if (!passesCoverageAround(pt, info, opts.coverage, opts)) continue;

            // density (random skip)
            if (Math.random() > opts.density) continue;

            // расчёт прозрачности по расстоянию до ближайшей точки границы объекта
            var distX = Math.max(0, Math.abs(x - cx) - halfW);
            var distY = Math.max(0, Math.abs(y - cy) - halfH);
            var dist = Math.sqrt(distX * distX + distY * distY);
            var distFromPad = Math.max(0, dist - pad);
            var t = Math.min(1, distFromPad / spread);
            var op = opts.noFade ? 1 : (1 - falloff(t, opts.falloffType));

            allPoints.push({ pos: pt, opacity: op, distRank: t });
        }
    }

    // Отделяем accent points: выбираем кольца Inner/Middle/Outer по distRank
    var microPts = [];
    var accentPts = [];

    var ringTol = 0.12; // ширина "кольца" вокруг каждого target distRank
    var targets = [];
    if (opts.accentInner)  targets.push(0.0);
    if (opts.accentMiddle) targets.push(0.5);
    if (opts.accentOuter)  targets.push(1.0);

    var accentCounter = 0;
    for (var i = 0; i < allPoints.length; i++) {
        var p = allPoints[i];
        var isAccent = false;
        if (targets.length > 0) {
            for (var k = 0; k < targets.length; k++) {
                if (Math.abs(p.distRank - targets[k]) < ringTol) {
                    accentCounter++;
                    if (accentCounter % opts.accentEveryN === 0) {
                        isAccent = true;
                    }
                    break;
                }
            }
        }
        if (isAccent) accentPts.push(p);
        else microPts.push(p);
    }

    return { micro: microPts, accent: accentPts };
}

3. generateAlongPattern — добавлен фильтр по нормали + useObjColor

Заменить целиком:

function generateAlongPattern(samples, opts, info) {
    // samples = [{pos:[x,y], tangent:[tx,ty], normal:[nx,ny], cumLen:L}, ...]
    var spread = opts.spread;
    var spacing = opts.microSpacing;
    var pad = opts.padding;
    var steps = Math.ceil(spread / spacing);

    var microPts = [];
    var accentPts = [];
    var accentSpacing = 60; // px по дуге
    var lastAccentLen = -accentSpacing;

    var cov = opts.coverage;
    // В Along Path работают только top/bottom как стороны нормали
    var allowPos = cov.strip && (cov.strip.top || cov.strip.center) ||
                   cov.arc   && (cov.arc.top   || cov.arc.center);
    var allowNeg = cov.strip && (cov.strip.bottom || cov.strip.center) ||
                   cov.arc   && (cov.arc.bottom   || cov.arc.center);
    // если вообще ничего не выбрано — обе стороны (fallback)
    if (!allowPos && !allowNeg) { allowPos = true; allowNeg = true; }

    for (var i = 0; i < samples.length; i++) {
        var s = samples[i];
        var nx = s.normal[0], ny = s.normal[1];

        // accent на самом пути
        var isAccent = (s.cumLen - lastAccentLen) >= accentSpacing;
        if (isAccent) {
            lastAccentLen = s.cumLen;
            accentPts.push({ pos: s.pos, opacity: 1, distRank: 0 });
        }

        // micro по нормали в обе стороны
        for (var d = 1; d <= steps; d++) {
            var offset = pad + d * spacing;
            if (offset > pad + spread) break;
            var t = (d * spacing) / spread;
            var op = opts.noFade ? 1 : (1 - falloff(t, opts.falloffType));

            // positive side
            if (allowPos) {
                if (Math.random() <= opts.density) {
                    microPts.push({
                        pos: [s.pos[0] + nx * offset, s.pos[1] + ny * offset],
                        opacity: op, distRank: t
                    });
                }
            }
            // negative side
            if (allowNeg) {
                if (Math.random() <= opts.density) {
                    microPts.push({
                        pos: [s.pos[0] - nx * offset, s.pos[1] - ny * offset],
                        opacity: op, distRank: t
                    });
                }
            }
        }
    }

    return { micro: microPts, accent: accentPts };
}

4. generatePattern — применение useObjColor для обоих режимов

Найди вызов создания слоёв и замени блок выбора цветов:

// в generatePattern(), после получения result = generateAroundPattern(...) или generateAlongPattern(...)
var microColor = opts.useObjColorMicro && info && info.color ? info.color : opts.microColor;
var accentColor = opts.useObjColorAccent && info && info.color ? info.color : opts.accentColor;

if (result.micro.length > 0) {
    createDotLayer(comp, "DotPattern_Micro", result.micro, opts.microSize, microColor);
}
if (result.accent.length > 0) {
    createDotLayer(comp, "DotPattern_Accent", result.accent, opts.accentSize, accentColor);
}

(Для Along Path info теперь тоже передавай — извлекай info.color из самого слоя‑источника через getSourceInfo(targetLayer) до вызова generateAlongPattern.)
5. UI — компактный MODE‑dropdown + два креста Coverage

Заменить секцию построения MODE и COVERAGE в buildUI():

// === MODE ROW (компактный) ===
var modeRow = panel.add("group");
modeRow.orientation = "row";
modeRow.alignChildren = ["left", "center"];
var modeLbl = modeRow.add("statictext", undefined, "MODE:");
modeLbl.graphics.foregroundColor = modeLbl.graphics.newPen(modeLbl.graphics.PenType.SOLID_COLOR, [1, 0.6, 0.1, 1], 1);
var modeDD = modeRow.add("dropdownlist", undefined, ["Auto-detect", "Around Shape", "Along Path"]);
modeDD.selection = 0;

addDivider(panel);
addSectionLabel(panel, "COVERAGE");

// === COVERAGE: two crosses side by side ===
var covRow = panel.add("group");
covRow.orientation = "row";
covRow.alignChildren = ["fill", "top"];
covRow.spacing = 20;

function buildCross(parent, title) {
    var box = parent.add("panel", undefined, title);
    box.orientation = "column";
    box.alignChildren = ["center", "center"];
    box.margins = 8;

    var topRow = box.add("group"); topRow.alignment = "center";
    var cbT = topRow.add("checkbox", undefined, "▲");

    var midRow = box.add("group"); midRow.alignment = "center"; midRow.spacing = 4;
    var cbL = midRow.add("checkbox", undefined, "◀");
    var cbC = midRow.add("checkbox", undefined, "◆");
    var cbR = midRow.add("checkbox", undefined, "▶");

    var botRow = box.add("group"); botRow.alignment = "center";
    var cbB = botRow.add("checkbox", undefined, "▼");

    return { panel: box, top: cbT, left: cbL, center: cbC, right: cbR, bottom: cbB };
}

var stripCross = buildCross(covRow, "Strip");
var arcCross   = buildCross(covRow, "Arc");

// Defaults: Strip Top + Center
stripCross.top.value = true;
stripCross.center.value = true;

// Arc Angle slider (active when any Arc checkbox is on)
var arcAngleRow = panel.add("group");
arcAngleRow.orientation = "row";
arcAngleRow.add("statictext", undefined, "Arc Angle:");
var arcAngleSlider = arcAngleRow.add("slider", undefined, 90, 60, 180);
arcAngleSlider.preferredSize.width = 120;
var arcAngleVal = arcAngleRow.add("statictext", undefined, "90°");
arcAngleVal.preferredSize.width = 40;
arcAngleSlider.onChanging = function() {
    arcAngleVal.text = Math.round(arcAngleSlider.value) + "°";
};

// === Enable/disable logic based on MODE ===
function updateCoverageState() {
    var mode = modeDD.selection.index; // 0=Auto, 1=Around, 2=Along
    var isAlong = (mode === 2);
    // в Auto-detect определим на лету при Generate — UI оставляем активным
    // но в явном Along Path серым становится всё кроме top/bottom/center

    var stripCBs = [stripCross.top, stripCross.left, stripCross.center, stripCross.right, stripCross.bottom];
    var arcCBs   = [arcCross.top,   arcCross.left,   arcCross.center,   arcCross.right,   arcCross.bottom];

    if (isAlong) {
        // Strip: только top/bottom/center активны
        stripCross.top.enabled = true;
        stripCross.bottom.enabled = true;
        stripCross.center.enabled = true;
        stripCross.left.enabled = false;
        stripCross.right.enabled = false;
        // Arc: то же самое
        arcCross.top.enabled = true;
        arcCross.bottom.enabled = true;
        arcCross.center.enabled = true;
        arcCross.left.enabled = false;
        arcCross.right.enabled = false;
    } else {
        for (var i = 0; i < stripCBs.length; i++) stripCBs[i].enabled = true;
        for (var j = 0; j < arcCBs.length;   j++) arcCBs[j].enabled = true;
    }

    // Arc angle slider: активен если хоть одна Arc галка стоит
    var anyArc = arcCross.top.value || arcCross.bottom.value || arcCross.left.value || arcCross.right.value || arcCross.center.value;
    arcAngleSlider.enabled = anyArc;
    arcAngleVal.enabled = anyArc;
}

modeDD.onChange = updateCoverageState;
arcCross.top.onClick    = updateCoverageState;
arcCross.bottom.onClick = updateCoverageState;
arcCross.left.onClick   = updateCoverageState;
arcCross.right.onClick  = updateCoverageState;
arcCross.center.onClick = updateCoverageState;
updateCoverageState();

6. readState() — собрать coverage из двух крестов

В функции чтения UI добавь / замени:

opts.coverage = {
    strip: {
        top:    stripCross.top.value,
        bottom: stripCross.bottom.value,
        left:   stripCross.left.value,
        right:  stripCross.right.value,
        center: stripCross.center.value
    },
    arc: {
        top:    arcCross.top.value,
        bottom: arcCross.bottom.value,
        left:   arcCross.left.value,
        right:  arcCross.right.value,
        center: arcCross.center.value
    }
};
opts.arcAngle = arcAngleSlider.value;
opts.mode = ["auto", "around", "along"][modeDD.selection.index];


// ptp_DotPattern.jsx v1.1.1
// Around Shape + Along Path. Two independent Coverage systems: Strip + Arc.
// Install: Adobe After Effects/Support Files/Scripts/ScriptUI Panels/
// Open via: Window → ptp_DotPattern.jsx

(function (thisObj) {
    var SCRIPT_NAME = "ptp_DotPattern";
    var SCRIPT_VERSION = "v1.1.1";
    var MAX_DOTS = 2000;

    // Theme
    var COL_BG       = [0.16, 0.16, 0.18, 1];
    var COL_TEXT     = [0.88, 0.88, 0.88, 1];
    var COL_ACCENT   = [1.00, 0.60, 0.10, 1];
    var COL_DIVIDER  = [0.30, 0.30, 0.32, 1];

    // Last opts (for Re-generate Last)
    var lastOpts = null;
    var lastTargetLayerIndex = null;

    // ==================== HELPERS ====================

    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) {
            alert("Откройте композицию.");
            return null;
        }
        return c;
    }

    function getSelLayer(comp) {
        if (!comp.selectedLayers || comp.selectedLayers.length === 0) return null;
        return comp.selectedLayers[0];
    }

    function rgbToHex(rgb) {
        function h(x) { var s = Math.round(x * 255).toString(16); return s.length < 2 ? "0" + s : s; }
        return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
    }

    function falloff(t, type) {
        if (t < 0) t = 0; if (t > 1) t = 1;
        if (type === "linear") return t;
        if (type === "ease")   return t * t * (3 - 2 * t);
        if (type === "step")   return t < 0.5 ? 0 : 1;
        return t;
    }

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // ==================== SOURCE INFO ====================

    function getShapeColor(layer) {
        try {
            var contents = layer.property("Contents");
            if (!contents) return null;
            for (var i = 1; i <= contents.numProperties; i++) {
                var grp = contents.property(i);
                if (grp && grp.property("Contents")) {
                    var inner = grp.property("Contents");
                    for (var j = 1; j <= inner.numProperties; j++) {
                        var p = inner.property(j);
                        if (!p) continue;
                        var n = p.matchName;
                        if (n === "ADBE Vector Graphic - Fill") {
                            try { return p.property("Color").value; } catch (e1) {}
                        }
                        if (n === "ADBE Vector Graphic - Stroke") {
                            try { return p.property("Color").value; } catch (e2) {}
                        }
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function getSourceInfo(layer) {
        var comp = layer.containingComp;
        var rect = layer.sourceRectAtTime(comp.time, false);
        var pos;
        try { pos = layer.property("Transform").property("Position").value; }
        catch (e) { pos = [comp.width / 2, comp.height / 2]; }

        var cx = pos[0] + (rect.left + rect.width / 2);
        var cy = pos[1] + (rect.top + rect.height / 2);

        // shape kind detection
        var kind = "rect";
        try {
            var c = layer.property("Contents");
            if (c) {
                for (var i = 1; i <= c.numProperties; i++) {
                    var g = c.property(i);
                    if (g && g.property("Contents")) {
                        var inner = g.property("Contents");
                        for (var j = 1; j <= inner.numProperties; j++) {
                            var mn = inner.property(j).matchName;
                            if (mn === "ADBE Vector Shape - Ellipse") kind = "ellipse";
                            else if (mn === "ADBE Vector Shape - Star") kind = "polygon";
                            else if (mn === "ADBE Vector Shape - Rect") kind = "rect";
                        }
                    }
                }
            }
        } catch (e) {}

        return {
            cx: cx, cy: cy,
            w: rect.width, h: rect.height,
            kind: kind,
            color: getShapeColor(layer)
        };
    }

    // ==================== PATH SAMPLING ====================

    function findPathInLayer(layer) {
        // 1) Mask
        try {
            if (layer.mask && layer.mask.numProperties > 0) {
                var m = layer.mask(1);
                if (m) {
                    var mp = m.property("Mask Path");
                    if (mp) return { prop: mp, type: "mask" };
                }
            }
        } catch (e) {}
        // 2) Shape path
        try {
            var contents = layer.property("Contents");
            if (contents) {
                for (var i = 1; i <= contents.numProperties; i++) {
                    var grp = contents.property(i);
                    if (grp && grp.property("Contents")) {
                        var inner = grp.property("Contents");
                        for (var j = 1; j <= inner.numProperties; j++) {
                            var p = inner.property(j);
                            if (p && p.matchName === "ADBE Vector Shape - Group") {
                                var pathProp = p.property("Path");
                                if (pathProp) return { prop: pathProp, type: "shape" };
                            }
                        }
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function bezierPoint(p0, p1, p2, p3, t) {
        var u = 1 - t;
        var b0 = u * u * u;
        var b1 = 3 * u * u * t;
        var b2 = 3 * u * t * t;
        var b3 = t * t * t;
        return [
            b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
            b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]
        ];
    }

    function bezierTangent(p0, p1, p2, p3, t) {
        var u = 1 - t;
        var tx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
        var ty = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
        var len = Math.sqrt(tx * tx + ty * ty);
        if (len < 0.0001) return [1, 0];
        return [tx / len, ty / len];
    }

    function samplePath(pathInfo, layer, comp) {
        var pathProp = pathInfo.prop;
        var path = pathProp.value;
        var verts = path.vertices;
        var inT = path.inTangents;
        var outT = path.outTangents;
        var closed = path.closed;

        // layer transform
        var lpos;
        try { lpos = layer.property("Transform").property("Position").value; }
        catch (e) { lpos = [0, 0]; }

        var SAMPLES_PER_SEG = 80;
        var segments = closed ? verts.length : (verts.length - 1);
        if (segments < 1) return [];

        var samples = [];
        var cumLen = 0;
        var prevPt = null;

        for (var s = 0; s < segments; s++) {
            var i0 = s;
            var i1 = (s + 1) % verts.length;
            var p0 = [verts[i0][0] + lpos[0], verts[i0][1] + lpos[1]];
            var p3 = [verts[i1][0] + lpos[0], verts[i1][1] + lpos[1]];
            var p1 = [p0[0] + outT[i0][0], p0[1] + outT[i0][1]];
            var p2 = [p3[0] + inT[i1][0],  p3[1] + inT[i1][1]];

            for (var k = 0; k <= SAMPLES_PER_SEG; k++) {
                if (s > 0 && k === 0) continue; // не дублируем стык
                var t = k / SAMPLES_PER_SEG;
                var pt = bezierPoint(p0, p1, p2, p3, t);
                var tan = bezierTangent(p0, p1, p2, p3, t);
                var norm = [-tan[1], tan[0]];

                if (prevPt) {
                    var dx = pt[0] - prevPt[0], dy = pt[1] - prevPt[1];
                    cumLen += Math.sqrt(dx * dx + dy * dy);
                }
                prevPt = pt;

                samples.push({ pos: pt, tangent: tan, normal: norm, cumLen: cumLen });
            }
        }
        return samples;
    }

    // ==================== COVERAGE FILTERS ====================

    function passesCoverageStrip(pt, info, cov, opts) {
        if (!cov.strip) return false;
        var s = cov.strip;
        if (!s.top && !s.bottom && !s.left && !s.right && !s.center) return false;

        var cx = info.cx, cy = info.cy;
        var hW = info.w / 2, hH = info.h / 2;
        var pad = opts.padding, spread = opts.spread;
        var buf = opts.microSpacing * 2;
        var x = pt[0], y = pt[1];

        // Center buffer ring around object border
        if (s.center) {
            var inOuterFrame = (x >= cx - hW - pad - buf) && (x <= cx + hW + pad + buf) &&
                               (y >= cy - hH - pad - buf) && (y <= cy + hH + pad + buf);
            var inInnerHole  = (x > cx - hW - pad + buf) && (x < cx + hW + pad - buf) &&
                               (y > cy - hH - pad + buf) && (y < cy + hH + pad - buf);
            if (inOuterFrame && !inInnerHole) return true;
        }

        // Top strip
        if (s.top) {
            if (y < cy - hH - pad && y >= cy - hH - pad - spread &&
                x >= cx - hW && x <= cx + hW) return true;
        }
        if (s.bottom) {
            if (y > cy + hH + pad && y <= cy + hH + pad + spread &&
                x >= cx - hW && x <= cx + hW) return true;
        }
        if (s.left) {
            if (x < cx - hW - pad && x >= cx - hW - pad - spread &&
                y >= cy - hH && y <= cy + hH) return true;
        }
        if (s.right) {
            if (x > cx + hW + pad && x <= cx + hW + pad + spread &&
                y >= cy - hH && y <= cy + hH) return true;
        }
        return false;
    }

    function passesCoverageArc(pt, info, cov, opts) {
        if (!cov.arc) return false;
        var a = cov.arc;
        if (!a.top && !a.bottom && !a.left && !a.right && !a.center) return false;

        var cx = info.cx, cy = info.cy;
        var dx = pt[0] - cx, dy = pt[1] - cy;
        var ang = Math.atan2(dy, dx) * 180 / Math.PI;
        if (ang < 0) ang += 360;

        var arcAngle = opts.arcAngle || 90;
        var half = arcAngle / 2;
        var centerBoost = a.center ? 15 : 0;

        function inSector(centerDeg, hh) {
            var d = Math.abs(ang - centerDeg);
            if (d > 180) d = 360 - d;
            return d <= (hh + centerBoost);
        }

        if (a.top    && inSector(270, half)) return true;
        if (a.right  && inSector(0,   half)) return true;
        if (a.bottom && inSector(90,  half)) return true;
        if (a.left   && inSector(180, half)) return true;
        // ◆ alone — small ring around object
        if (a.center && !a.top && !a.bottom && !a.left && !a.right) {
            var dist = Math.sqrt(dx * dx + dy * dy);
            var rApprox = Math.max(info.w, info.h) / 2 + opts.padding;
            if (dist >= rApprox && dist <= rApprox + opts.microSpacing * 3) return true;
        }
        return false;
    }

    function passesCoverageAround(pt, info, cov, opts) {
        if (passesCoverageStrip(pt, info, cov, opts)) return true;
        if (passesCoverageArc(pt, info, cov, opts)) return true;
        return false;
    }

    // ==================== GENERATION: AROUND ====================

    function generateAroundPattern(info, opts) {
        var cx = info.cx, cy = info.cy;
        var hW = info.w / 2, hH = info.h / 2;
        var pad = opts.padding, spread = opts.spread;
        var spacing = opts.microSpacing;

        var x0 = cx - hW - pad - spread;
        var x1 = cx + hW + pad + spread;
        var y0 = cy - hH - pad - spread;
        var y1 = cy + hH + pad + spread;

        var allPoints = [];

        for (var y = y0; y <= y1; y += spacing) {
            for (var x = x0; x <= x1; x += spacing) {
                // skip inside object + padding
                if (x > cx - hW - pad && x < cx + hW + pad &&
                    y > cy - hH - pad && y < cy + hH + pad) continue;

                var pt = [x, y];
                if (!passesCoverageAround(pt, info, opts.coverage, opts)) continue;
                if (Math.random() > opts.density) continue;

                var distX = Math.max(0, Math.abs(x - cx) - hW);
                var distY = Math.max(0, Math.abs(y - cy) - hH);
                var dist = Math.sqrt(distX * distX + distY * distY);
                var distFromPad = Math.max(0, dist - pad);
                var t = clamp(distFromPad / spread, 0, 1);
                var op = opts.noFade ? 1 : (1 - falloff(t, opts.falloffType));

                allPoints.push({ pos: pt, opacity: op, distRank: t });
            }
        }

        // Split accent / micro
        return splitAccent(allPoints, opts);
    }

    function splitAccent(allPoints, opts) {
        var targets = [];
        if (opts.accentInner)  targets.push(0.0);
        if (opts.accentMiddle) targets.push(0.5);
        if (opts.accentOuter)  targets.push(1.0);

        var ringTol = 0.12;
        var micro = [], accent = [];
        var counter = 0;

        for (var i = 0; i < allPoints.length; i++) {
            var p = allPoints[i];
            var isAccent = false;
            if (targets.length > 0) {
                for (var k = 0; k < targets.length; k++) {
                    if (Math.abs(p.distRank - targets[k]) < ringTol) {
                        counter++;
                        if (counter % opts.accentEveryN === 0) isAccent = true;
                        break;
                    }
                }
            }
            if (isAccent) { p.opacity = 1; accent.push(p); }
            else micro.push(p);
        }
        return { micro: micro, accent: accent };
    }

    // ==================== GENERATION: ALONG ====================

    function generateAlongPattern(samples, opts) {
        var spread = opts.spread, spacing = opts.microSpacing, pad = opts.padding;
        var steps = Math.ceil(spread / spacing);
        if (steps < 1) steps = 1;

        var cov = opts.coverage;
        var allowPos =
            (cov.strip && (cov.strip.top || cov.strip.center)) ||
            (cov.arc   && (cov.arc.top   || cov.arc.center));
        var allowNeg =
            (cov.strip && (cov.strip.bottom || cov.strip.center)) ||
            (cov.arc   && (cov.arc.bottom   || cov.arc.center));
        if (!allowPos && !allowNeg) { allowPos = true; allowNeg = true; }

        var accentSpacing = 60;
        var lastAccentLen = -accentSpacing;
        var allMicro = [];
        var accent = [];
        var accentCounter = 0;

        for (var i = 0; i < samples.length; i++) {
            var s = samples[i];
            var nx = s.normal[0], ny = s.normal[1];

            // accent along path
            if ((s.cumLen - lastAccentLen) >= accentSpacing) {
                lastAccentLen = s.cumLen;
                accentCounter++;
                // simulate "Every N-th" by treating path-accents as ring with N filter
                if (opts.accentEveryN <= 1 || (accentCounter % opts.accentEveryN === 0)) {
                    if (opts.accentInner || opts.accentMiddle || opts.accentOuter) {
                        accent.push({ pos: s.pos, opacity: 1, distRank: 0 });
                    }
                }
            }

            for (var d = 1; d <= steps; d++) {
                var offset = pad + d * spacing;
                if (offset > pad + spread) break;
                var t = clamp((d * spacing) / spread, 0, 1);
                var op = opts.noFade ? 1 : (1 - falloff(t, opts.falloffType));

                if (allowPos && Math.random() <= opts.density) {
                    allMicro.push({
                        pos: [s.pos[0] + nx * offset, s.pos[1] + ny * offset],
                        opacity: op, distRank: t
                    });
                }
                if (allowNeg && Math.random() <= opts.density) {
                    allMicro.push({
                        pos: [s.pos[0] - nx * offset, s.pos[1] - ny * offset],
                        opacity: op, distRank: t
                    });
                }
            }
        }

        return { micro: allMicro, accent: accent };
    }

    // ==================== LAYER CREATION ====================

    function createDotLayer(comp, name, dots, size, color) {
        if (dots.length === 0) return null;

        // Compute bbox center for anchor
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < dots.length; i++) {
            var p = dots[i].pos;
            if (p[0] < minX) minX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] > maxY) maxY = p[1];
        }
        var bbCx = (minX + maxX) / 2;
        var bbCy = (minY + maxY) / 2;
        var bbW = Math.max(10, maxX - minX);
        var bbH = Math.max(10, maxY - minY);

        var layer = comp.layers.addShape();
        layer.name = name;

        // Group by opacity rounded to 0.05 to reduce shape count
        var buckets = {};
        for (var j = 0; j < dots.length; j++) {
            var d = dots[j];
            var key = Math.round(d.opacity * 20) / 20;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(d.pos);
        }

        var contents = layer.property("Contents");

        for (var op in buckets) {
            if (!buckets.hasOwnProperty(op)) continue;
            var pts = buckets[op];
            var group = contents.addProperty("ADBE Vector Group");
            group.name = "Op_" + op;
            var inner = group.property("Contents");

            for (var m = 0; m < pts.length; m++) {
                var x = pts[m][0] - bbCx;
                var y = pts[m][1] - bbCy;
                addCircle(inner, x, y, size);
            }
            var fill = inner.addProperty("ADBE Vector Graphic - Fill");
            fill.property("Color").setValue(color);
            fill.property("Opacity").setValue(parseFloat(op) * 100);
        }

        // Position layer at bbox center, anchor [0,0]
        try {
            layer.property("Transform").property("Position").setValue([bbCx, bbCy]);
            layer.property("Transform").property("Anchor Point").setValue([0, 0]);
        } catch (e) {}

        return layer;
    }

    function addCircle(inner, x, y, size) {
        var g = inner.addProperty("ADBE Vector Group");
        g.name = "Dot";
        var ginner = g.property("Contents");
        var ell = ginner.addProperty("ADBE Vector Shape - Ellipse");
        ell.property("Size").setValue([size, size]);
        ell.property("Position").setValue([0, 0]);
        try {
            g.property("Transform").property("Position").setValue([x, y]);
        } catch (e) {}
    }

    // ==================== MODE DETECTION ====================

    function detectMode(layer) {
        // Returns "around" or "along"
        var path = findPathInLayer(layer);
        if (!path) return "around";
        // если есть маска — однозначно along
        if (path.type === "mask") return "along";
        // shape: проверяем число вершин — если 4 (rect) или ellipse — around, иначе along
        try {
            var v = path.prop.value.vertices;
            if (v.length <= 4) return "around";
        } catch (e) {}
        return "along";
    }

    // ==================== MAIN GENERATE ====================

    function generatePattern(targetLayer, opts) {
        var comp = targetLayer.containingComp;
        var mode = opts.mode;
        if (mode === "auto") mode = detectMode(targetLayer);

        var result = null;
        var info = null;

        if (mode === "along") {
            var pathInfo = findPathInLayer(targetLayer);
            if (!pathInfo) {
                alert("Выделите Mask Path или Shape Path для режима Along Path.\nИли выделите слой с одной маской — путь возьмётся автоматически.");
                return;
            }
            var samples = samplePath(pathInfo, targetLayer, comp);
            if (!samples || samples.length === 0) {
                alert("Не удалось получить точки на пути.");
                return;
            }
            result = generateAlongPattern(samples, opts);
            // info нужен для цвета объекта
            info = { color: getShapeColor(targetLayer) };
        } else {
            info = getSourceInfo(targetLayer);
            result = generateAroundPattern(info, opts);
        }

        var total = result.micro.length + result.accent.length;
        if (total === 0) {
            alert("Нет точек для генерации.\nПроверьте Coverage (включите хотя бы одно направление).");
            return;
        }
        if (total > MAX_DOTS) {
            var go = confirm("Будет создано " + total + " точек (лимит " + MAX_DOTS + ").\nПродолжить?");
            if (!go) return;
        }

        var microColor = (opts.useObjColorMicro && info && info.color) ? info.color : opts.microColor;
        var accentColor = (opts.useObjColorAccent && info && info.color) ? info.color : opts.accentColor;

        app.beginUndoGroup(SCRIPT_NAME + " — Generate");
        var microLayer = null, accentLayer = null;
        if (result.micro.length > 0)
            microLayer = createDotLayer(comp, "DotPattern_Micro", result.micro, opts.microSize, microColor);
        if (result.accent.length > 0)
            accentLayer = createDotLayer(comp, "DotPattern_Accent", result.accent, opts.accentSize, accentColor);

        // Pre-comp
        if (opts.preComp) {
            var idxs = [];
            if (accentLayer) idxs.push(accentLayer.index);
            if (microLayer) idxs.push(microLayer.index);
            if (idxs.length > 0) {
                try { comp.layers.precompose(idxs, "DotPattern_PreComp", true); } catch (e) {}
            }
        } else if (opts.parentToSource) {
            try {
                if (microLayer) microLayer.parent = targetLayer;
                if (accentLayer) accentLayer.parent = targetLayer;
            } catch (e) {}
        }

        app.endUndoGroup();

        lastOpts = cloneOpts(opts);
        lastTargetLayerIndex = targetLayer.index;
    }

    function cloneOpts(o) {
        var n = {};
        for (var k in o) {
            if (o.hasOwnProperty(k)) {
                if (k === "coverage") {
                    n.coverage = {
                        strip: {
                            top: o.coverage.strip.top, bottom: o.coverage.strip.bottom,
                            left: o.coverage.strip.left, right: o.coverage.strip.right,
                            center: o.coverage.strip.center
                        },
                        arc: {
                            top: o.coverage.arc.top, bottom: o.coverage.arc.bottom,
                            left: o.coverage.arc.left, right: o.coverage.arc.right,
                            center: o.coverage.arc.center
                        }
                    };
                } else if (o[k] && o[k].length === 4) {
                    n[k] = [o[k][0], o[k][1], o[k][2], o[k][3]];
                } else {
                    n[k] = o[k];
                }
            }
        }
        return n;
    }

    // ==================== UI HELPERS ====================

    function addDivider(parent) {
        var g = parent.add("group");
        g.alignment = ["fill", "top"];
        g.minimumSize.height = 1;
        g.maximumSize.height = 1;
        g.graphics.backgroundColor = g.graphics.newBrush(g.graphics.BrushType.SOLID_COLOR, COL_DIVIDER);
    }

    function addSectionLabel(parent, text) {
        var st = parent.add("statictext", undefined, text);
        st.graphics.foregroundColor = st.graphics.newPen(st.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);
        return st;
    }

    function styleSwatch(btn, rgb) {
        try {
            btn.fillBrush = btn.graphics.newBrush(btn.graphics.BrushType.SOLID_COLOR, rgb);
            btn.onDraw = function () {
                btn.graphics.drawOSControl();
                btn.graphics.rectPath(2, 2, btn.size.width - 4, btn.size.height - 4);
                btn.graphics.fillPath(btn.fillBrush);
            };
        } catch (e) {}
    }

    function pickColor(currentRgb) {
        var hex = rgbToHex(currentRgb);
        var dec = parseInt(hex.substring(1), 16);
        var res = $.colorPicker(dec);
        if (res === -1) return null;
        var r = ((res >> 16) & 0xFF) / 255;
        var g = ((res >> 8) & 0xFF) / 255;
        var b = (res & 0xFF) / 255;
        return [r, g, b, 1];
    }

    // ==================== UI ====================

    function buildUI(parent) {
        var w = (parent instanceof Panel) ? parent
              : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, { resizeable: true });
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.spacing = 6;
        w.margins = 10;

        try { w.graphics.backgroundColor = w.graphics.newBrush(w.graphics.BrushType.SOLID_COLOR, COL_BG); } catch (e) {}

        // Title
        var title = w.add("statictext", undefined, SCRIPT_NAME + "  " + SCRIPT_VERSION);
        title.graphics.foregroundColor = title.graphics.newPen(title.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);

        // MODE row
        var modeRow = w.add("group");
        modeRow.orientation = "row";
        modeRow.alignChildren = ["left", "center"];
        var modeLbl = modeRow.add("statictext", undefined, "MODE:");
        modeLbl.graphics.foregroundColor = modeLbl.graphics.newPen(modeLbl.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);
        var modeDD = modeRow.add("dropdownlist", undefined, ["Auto-detect", "Around Shape", "Along Path"]);
        modeDD.selection = 0;

        addDivider(w);

        // COVERAGE
        addSectionLabel(w, "COVERAGE");

        var covRow = w.add("group");
        covRow.orientation = "row";
        covRow.alignChildren = ["fill", "top"];
        covRow.spacing = 12;

        function buildCross(parent, title) {
            var box = parent.add("panel", undefined, title);
            box.orientation = "column";
            box.alignChildren = ["center", "center"];
            box.margins = 6;
            box.spacing = 2;

            var topRow = box.add("group"); topRow.alignment = "center";
            var cbT = topRow.add("checkbox", undefined, "▲");

            var midRow = box.add("group"); midRow.alignment = "center"; midRow.spacing = 4;
            var cbL = midRow.add("checkbox", undefined, "◀");
            var cbC = midRow.add("checkbox", undefined, "◆");
            var cbR = midRow.add("checkbox", undefined, "▶");

            var botRow = box.add("group"); botRow.alignment = "center";
            var cbB = botRow.add("checkbox", undefined, "▼");

            return { top: cbT, left: cbL, center: cbC, right: cbR, bottom: cbB };
        }

        var stripCross = buildCross(covRow, "Strip");
        var arcCross   = buildCross(covRow, "Arc");

        // defaults
        stripCross.top.value = true;
        stripCross.center.value = true;

        // Arc Angle slider
        var arcAngleRow = w.add("group");
        arcAngleRow.orientation = "row";
        arcAngleRow.add("statictext", undefined, "Arc Angle:");
        var arcAngleSlider = arcAngleRow.add("slider", undefined, 90, 60, 180);
        arcAngleSlider.preferredSize.width = 120;
        var arcAngleVal = arcAngleRow.add("statictext", undefined, "90°");
        arcAngleVal.preferredSize.width = 40;
        arcAngleSlider.onChanging = function () {
            arcAngleVal.text = Math.round(arcAngleSlider.value) + "°";
        };

        function updateCoverageState() {
            var idx = modeDD.selection ? modeDD.selection.index : 0;
            var isAlong = (idx === 2);
            var stripL = [stripCross.left, stripCross.right];
            var arcL   = [arcCross.left,   arcCross.right];
            if (isAlong) {
                stripL[0].enabled = false; stripL[1].enabled = false;
                arcL[0].enabled = false;   arcL[1].enabled = false;
            } else {
                stripL[0].enabled = true; stripL[1].enabled = true;
                arcL[0].enabled = true;   arcL[1].enabled = true;
            }
            var anyArc = arcCross.top.value || arcCross.bottom.value ||
                         arcCross.left.value || arcCross.right.value || arcCross.center.value;
            arcAngleSlider.enabled = anyArc;
            arcAngleVal.enabled = anyArc;
        }
        modeDD.onChange = updateCoverageState;
        arcCross.top.onClick = updateCoverageState;
        arcCross.bottom.onClick = updateCoverageState;
        arcCross.left.onClick = updateCoverageState;
        arcCross.right.onClick = updateCoverageState;
        arcCross.center.onClick = updateCoverageState;
        updateCoverageState();

        addDivider(w);

        // MICRO GRID
        addSectionLabel(w, "MICRO GRID");

        var microState = { color: [0.788, 0.761, 0.4, 1] };

        var microSizeG = w.add("group");
        microSizeG.add("statictext", undefined, "Size:");
        var microSizeSl = microSizeG.add("slider", undefined, 2, 1, 10);
        microSizeSl.preferredSize.width = 100;
        var microSizeVal = microSizeG.add("statictext", undefined, "2 px");
        microSizeVal.preferredSize.width = 40;
        microSizeSl.onChanging = function () { microSizeVal.text = Math.round(microSizeSl.value) + " px"; };

        var microColorG = w.add("group");
        microColorG.add("statictext", undefined, "Color:");
        var microColorBtn = microColorG.add("button", undefined, " ");
        microColorBtn.preferredSize = [40, 20];
        styleSwatch(microColorBtn, microState.color);
        microColorBtn.onClick = function () {
            var c = pickColor(microState.color);
            if (c) { microState.color = c; styleSwatch(microColorBtn, c); }
        };
        var microUseObjCB = microColorG.add("checkbox", undefined, "Use object color");

        var microSpacingG = w.add("group");
        microSpacingG.add("statictext", undefined, "Spacing:");
        var microSpacingSl = microSpacingG.add("slider", undefined, 8, 3, 30);
        microSpacingSl.preferredSize.width = 100;
        var microSpacingVal = microSpacingG.add("statictext", undefined, "8 px");
        microSpacingVal.preferredSize.width = 40;
        microSpacingSl.onChanging = function () { microSpacingVal.text = Math.round(microSpacingSl.value) + " px"; };

        var padG = w.add("group");
        padG.add("statictext", undefined, "Padding:");
        var padSl = padG.add("slider", undefined, 20, 0, 200);
        padSl.preferredSize.width = 100;
        var padVal = padG.add("statictext", undefined, "20 px");
        padVal.preferredSize.width = 40;
        padSl.onChanging = function () { padVal.text = Math.round(padSl.value) + " px"; };

        var spreadG = w.add("group");
        spreadG.add("statictext", undefined, "Spread:");
        var spreadSl = spreadG.add("slider", undefined, 120, 20, 400);
        spreadSl.preferredSize.width = 100;
        var spreadVal = spreadG.add("statictext", undefined, "120 px");
        spreadVal.preferredSize.width = 40;
        spreadSl.onChanging = function () { spreadVal.text = Math.round(spreadSl.value) + " px"; };

        var densG = w.add("group");
        densG.add("statictext", undefined, "Density:");
        var densSl = densG.add("slider", undefined, 0.7, 0.3, 1);
        densSl.preferredSize.width = 100;
        var densVal = densG.add("statictext", undefined, "0.70");
        densVal.preferredSize.width = 40;
        densSl.onChanging = function () { densVal.text = densSl.value.toFixed(2); };

        var falloffG = w.add("group");
        falloffG.add("statictext", undefined, "Falloff:");
        var falloffDD = falloffG.add("dropdownlist", undefined, ["linear", "ease", "step"]);
        falloffDD.selection = 0;
        var noFadeCB = falloffG.add("checkbox", undefined, "No fade");

        addDivider(w);

        // ACCENT DOTS
        addSectionLabel(w, "ACCENT DOTS");

        var accentState = { color: [1, 0.961, 0.4, 1] };

        var accSizeG = w.add("group");
        accSizeG.add("statictext", undefined, "Size:");
        var accSizeSl = accSizeG.add("slider", undefined, 6, 2, 20);
        accSizeSl.preferredSize.width = 100;
        var accSizeVal = accSizeG.add("statictext", undefined, "6 px");
        accSizeVal.preferredSize.width = 40;
        accSizeSl.onChanging = function () { accSizeVal.text = Math.round(accSizeSl.value) + " px"; };

        var accColorG = w.add("group");
        accColorG.add("statictext", undefined, "Color:");
        var accColorBtn = accColorG.add("button", undefined, " ");
        accColorBtn.preferredSize = [40, 20];
        styleSwatch(accColorBtn, accentState.color);
        accColorBtn.onClick = function () {
            var c = pickColor(accentState.color);
            if (c) { accentState.color = c; styleSwatch(accColorBtn, c); }
        };
        var accUseObjCB = accColorG.add("checkbox", undefined, "Use object color");

        var accNthG = w.add("group");
        accNthG.add("statictext", undefined, "Every N-th:");
        var accNthSl = accNthG.add("slider", undefined, 6, 2, 20);
        accNthSl.preferredSize.width = 100;
        var accNthVal = accNthG.add("statictext", undefined, "6");
        accNthVal.preferredSize.width = 40;
        accNthSl.onChanging = function () { accNthVal.text = String(Math.round(accNthSl.value)); };

        var ringG = w.add("group");
        ringG.add("statictext", undefined, "Rings:");
        var accInnerCB  = ringG.add("checkbox", undefined, "Inner");
        var accMiddleCB = ringG.add("checkbox", undefined, "Middle");
        var accOuterCB  = ringG.add("checkbox", undefined, "Outer");
        accMiddleCB.value = true;

        addDivider(w);

        // OUTPUT
        addSectionLabel(w, "OUTPUT");
        var outG = w.add("group");
        var preCompCB = outG.add("checkbox", undefined, "Pre-comp result");
        var parentCB = outG.add("checkbox", undefined, "Parent to source");

        addDivider(w);

        // BUTTONS
        var btnRow = w.add("group");
        btnRow.alignment = ["fill", "top"];
        var genBtn = btnRow.add("button", undefined, "Create Pattern");
        var regenBtn = btnRow.add("button", undefined, "Re-generate Last");
        var helpBtn = btnRow.add("button", undefined, "?");
        helpBtn.preferredSize.width = 30;

        function readState() {
            return {
                mode: ["auto", "around", "along"][modeDD.selection.index],
                coverage: {
                    strip: {
                        top: stripCross.top.value, bottom: stripCross.bottom.value,
                        left: stripCross.left.value && stripCross.left.enabled,
                        right: stripCross.right.value && stripCross.right.enabled,
                        center: stripCross.center.value
                    },
                    arc: {
                        top: arcCross.top.value, bottom: arcCross.bottom.value,
                        left: arcCross.left.value && arcCross.left.enabled,
                        right: arcCross.right.value && arcCross.right.enabled,
                        center: arcCross.center.value
                    }
                },
                arcAngle: arcAngleSlider.value,
                microSize: Math.round(microSizeSl.value),
                microColor: microState.color,
                useObjColorMicro: microUseObjCB.value,
                microSpacing: Math.round(microSpacingSl.value),
                padding: Math.round(padSl.value),
                spread: Math.round(spreadSl.value),
                density: densSl.value,
                falloffType: falloffDD.selection.text,
                noFade: noFadeCB.value,
                accentSize: Math.round(accSizeSl.value),
                accentColor: accentState.color,
                useObjColorAccent: accUseObjCB.value,
                accentEveryN: Math.round(accNthSl.value),
                accentInner: accInnerCB.value,
                accentMiddle: accMiddleCB.value,
                accentOuter: accOuterCB.value,
                preComp: preCompCB.value,
                parentToSource: parentCB.value
            };
        }

        genBtn.onClick = function () {
            var comp = getComp(); if (!comp) return;
            var layer = getSelLayer(comp);
            if (!layer) { alert("Выделите слой-источник."); return; }
            var opts = readState();
            generatePattern(layer, opts);
        };

        regenBtn.onClick = function () {
            var comp = getComp(); if (!comp) return;
            if (!lastOpts) { alert("Сначала создайте паттерн кнопкой Create Pattern."); return; }
            var layer = getSelLayer(comp);
            if (!layer) {
                if (lastTargetLayerIndex && comp.layer(lastTargetLayerIndex)) {
                    layer = comp.layer(lastTargetLayerIndex);
                } else {
                    alert("Выделите слой-источник."); return;
                }
            }
            generatePattern(layer, lastOpts);
        };

        helpBtn.onClick = function () { alert(getHelpText()); };

        if (w instanceof Window) { w.center(); w.show(); }
        else { w.layout.layout(true); w.layout.resize(); }

        return w;
    }

    function getHelpText() {
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n\n" +
            "MODE\n" +
            "  Auto-detect — определяет режим по выделенному слою.\n" +
            "  Around Shape — паттерн вокруг фигуры (rect/ellipse).\n" +
            "  Along Path — паттерн вдоль маски или Shape Path.\n\n" +
            "COVERAGE — два независимых креста:\n" +
            "  Strip — прямоугольные полосы строго над/под/слева/справа от объекта.\n" +
            "  Arc — угловые сектора (дуги). Ширина сектора — Arc Angle (60-180°).\n" +
            "  ◆ Center — в Strip заполняет узкое кольцо вплотную к границе;\n" +
            "             в Arc расширяет сектор на ±15°.\n" +
            "  Точка проходит если её принимает Strip ИЛИ Arc.\n\n" +
            "В Along Path активны только Top/Bottom/Center (стороны нормали к пути).\n" +
            "Left/Right серые и игнорируются.\n\n" +
            "ACCENT RINGS\n" +
            "  Inner — кольцо у границы объекта.\n" +
            "  Middle — кольцо в середине spread.\n" +
            "  Outer — кольцо на внешнем краю.\n" +
            "  Every N-th — какая часть точек кольца становится акцентом.\n\n" +
            "LIMITS: максимум " + MAX_DOTS + " точек (с подтверждением).\n";
    }

    buildUI(thisObj);
})(this);


Патч UI — точечные правки

Открой ptp_DotPattern.jsx, найди функцию buildCross внутри buildUI() и замени её целиком на эту версию:

function buildCross(parent, title) {
    var box = parent.add("panel", undefined, title);
    box.orientation = "column";
    box.alignChildren = ["center", "center"];
    box.margins = 8;
    box.spacing = 4;
    box.preferredSize.width = 110;

    var CB_W = 28; // фиксированная ширина чекбокса

    var topRow = box.add("group"); topRow.alignment = "center"; topRow.spacing = 4;
    var cbT = topRow.add("checkbox", undefined, "▲");
    cbT.preferredSize = [CB_W, 22];

    var midRow = box.add("group"); midRow.alignment = "center"; midRow.spacing = 4;
    var cbL = midRow.add("checkbox", undefined, "◀");
    cbL.preferredSize = [CB_W, 22];
    var cbC = midRow.add("checkbox", undefined, "◆");
    cbC.preferredSize = [CB_W, 22];
    var cbR = midRow.add("checkbox", undefined, "▶");
    cbR.preferredSize = [CB_W, 22];

    var botRow = box.add("group"); botRow.alignment = "center"; botRow.spacing = 4;
    var cbB = botRow.add("checkbox", undefined, "▼");
    cbB.preferredSize = [CB_W, 22];

    return { top: cbT, left: cbL, center: cbC, right: cbR, bottom: cbB };
}

И сразу после строки

var title = w.add("statictext", undefined, SCRIPT_NAME + "  " + SCRIPT_VERSION);

добавь:

title.preferredSize.width = 200;

Чтобы заголовок целиком влезал.

Также найди строку с covRow:

covRow.spacing = 12;

и замени на:

covRow.spacing = 8;
covRow.alignment = "center";
