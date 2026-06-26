// ============================================================
// ptp_DotPattern.jsx
// v1.2 — v1.0.1 base + Along Path mode (Mask / Shape path)
//       Coverage Top/Down side only in Along Path
// Author: ptp toolkit
// Install: Save into "Support Files/Scripts/ScriptUI Panels/"
// Run via: Window -> ptp_DotPattern.jsx
// ============================================================

(function ptp_DotPattern(thisObj) {

    var SCRIPT_NAME = "ptp_DotPattern";
    var SCRIPT_VERSION = "v1.2";

    var COL = {
        bg:        [0.16, 0.16, 0.17, 1],
        accentTxt: [1.00, 0.65, 0.10, 1],
        divider:   [0.30, 0.30, 0.32, 1]
    };

    var DEFAULT_ACCENT = [1.00, 0.96, 0.40];
    var DEFAULT_MICRO  = [0.79, 0.76, 0.40];

    var MAX_DOTS = 2000;

    var lastOpts = null;
    var lastTargetIdx = null;

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

    function clamp(v, lo, hi){ return v<lo?lo:(v>hi?hi:v); }

    // ============================================================
    // SOURCE OBJECT ANALYSIS (без изменений из v1.0.1)
    // ============================================================
    function getSourceInfo(layer) {
        var info = {kind:"rect", cx:0, cy:0, w:200, h:200, radius:0, color:DEFAULT_ACCENT.slice()};

        try {
            var pos = layer.property("Transform").property("Position").value;
            info.cx = pos[0];
            info.cy = pos[1];
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
                            info.kind = "circle";
                            info.w = sz[0]; info.h = sz[1];
                            info.radius = Math.max(sz[0], sz[1]) / 2;
                        }
                        if (p.matchName === "ADBE Vector Shape - Rect") {
                            var sz2 = p.property("Size").value;
                            info.kind = "rect";
                            info.w = sz2[0]; info.h = sz2[1];
                            try { info.radius = p.property("Roundness").value; } catch(e){}
                        }
                    }
                                      // Сначала ищем Stroke (для линий и обводок), потом Fill (для закрытых фигур)
                    var foundColor = false;
                    for (var k=1; k<=inner.numProperties; k++) {
                        if (inner.property(k).matchName === "ADBE Vector Graphic - Stroke") {
                            try {
                                var strokeColor = inner.property(k).property("Color").value;
                                // проверим что Stroke включён (Opacity > 0)
                                var strokeOp = 100;
                                try { strokeOp = inner.property(k).property("Opacity").value; } catch(e){}
                                if (strokeOp > 0) {
                                    info.color = strokeColor;
                                    foundColor = true;
                                    break;
                                }
                            } catch(e){}
                        }
                    }
                    if (!foundColor) {
                        for (var k2=1; k2<=inner.numProperties; k2++) {
                            if (inner.property(k2).matchName === "ADBE Vector Graphic - Fill") {
                                try {
                                    var fillColor = inner.property(k2).property("Color").value;
                                    var fillOp = 100;
                                    try { fillOp = inner.property(k2).property("Opacity").value; } catch(e){}
                                    if (fillOp > 0) {
                                        info.color = fillColor;
                                        foundColor = true;
                                        break;
                                    }
                                } catch(e){}
                            }
                        }
                    }

                }
            } catch(e) {}
               } else {
            try {
                var rect = layer.sourceRectAtTime(layer.containingComp.time, false);
                info.w = rect.width;
                info.h = rect.height;
                info.kind = "rect";
            } catch(e) {}
            // Цвет солида
            try {
                if (layer.source && layer.source.mainSource && layer.source.mainSource.color) {
                    info.color = layer.source.mainSource.color;
                }
            } catch(e) {}
    
        }


        return info;
    }

    // ============================================================
    // FALLOFF (без изменений из v1.0.1)
    // ============================================================
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
    // RING POINT GENERATION (без изменений из v1.0.1)
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
                    y: info.cy + R * Math.sin(a),
                    ringIndex: 0
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
                points.push({ x: left + t*(right-left)/topCount, y: top, ringIndex: 0 });
            }
            var sideCount = Math.max(1, Math.floor((bottom - top) / spacing));
            for (var s=1; s<sideCount; s++) {
                points.push({ x: right, y: top + s*(bottom-top)/sideCount, ringIndex: 0 });
            }
            for (var b=topCount; b>=0; b--) {
                points.push({ x: left + b*(right-left)/topCount, y: bottom, ringIndex: 0 });
            }
            for (var l=sideCount-1; l>=1; l--) {
                points.push({ x: left, y: top + l*(bottom-top)/sideCount, ringIndex: 0 });
            }
        }

        return points;
    }

    // ============================================================
    // AROUND SHAPE — генерация (без изменений из v1.0.1)
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

            var t = ringDistances.length > 1 ? (i / (ringDistances.length-1)) : 0;
            var op = opts.noFade ? 1.0 : falloff(t, opts.falloff);

            for (var j=0; j<ringPts.length; j++) {
                var pt = ringPts[j];

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
    // ALONG PATH — поиск пути и сэмплирование (из v1.1)
    // ============================================================
    function findPathInLayer(layer) {
        try {
            if (layer.mask && layer.mask.numProperties > 0) {
                var m = layer.mask(1);
                if (m) {
                    var mp = m.property("Mask Path");
                    if (mp) return { prop: mp, type: "mask" };
                }
            }
        } catch (e) {}
        try {
            var contents = layer.property("ADBE Root Vectors Group");
            if (contents) {
                for (var i = 1; i <= contents.numProperties; i++) {
                    var grp = contents.property(i);
                    var inner = grp.property("ADBE Vectors Group");
                    if (!inner) continue;
                    for (var j = 1; j <= inner.numProperties; j++) {
                        var p = inner.property(j);
                        if (p && p.matchName === "ADBE Vector Shape - Group") {
                            var pathProp = p.property("Path");
                            if (pathProp) return { prop: pathProp, type: "shape" };
                        }
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function bezierPoint(p0, p1, p2, p3, t) {
        var u = 1 - t;
        return [
            u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
            u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
        ];
    }

    function bezierTangent(p0, p1, p2, p3, t) {
        var u = 1 - t;
        var tx = 3*u*u*(p1[0]-p0[0]) + 6*u*t*(p2[0]-p1[0]) + 3*t*t*(p3[0]-p2[0]);
        var ty = 3*u*u*(p1[1]-p0[1]) + 6*u*t*(p2[1]-p1[1]) + 3*t*t*(p3[1]-p2[1]);
        var L = Math.sqrt(tx*tx + ty*ty);
        if (L < 0.0001) return [1, 0];
        return [tx/L, ty/L];
    }

    function samplePath(pathInfo, layer) {
        var path = pathInfo.prop.value;
        var verts = path.vertices;
        var inT = path.inTangents;
        var outT = path.outTangents;
        var closed = path.closed;

        var lpos;
        try { lpos = layer.property("Transform").property("Position").value; }
        catch (e) { lpos = [0, 0]; }

        var SAMPLES = 40; // экономно — 40 на сегмент
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

            for (var k = 0; k <= SAMPLES; k++) {
                if (s > 0 && k === 0) continue;
                var t = k / SAMPLES;
                var pt = bezierPoint(p0, p1, p2, p3, t);
                var tan = bezierTangent(p0, p1, p2, p3, t);
                var nrm = [-tan[1], tan[0]];

                if (prevPt) {
                    var dx = pt[0]-prevPt[0], dy = pt[1]-prevPt[1];
                    cumLen += Math.sqrt(dx*dx + dy*dy);
                }
                prevPt = pt;

                samples.push({ pos: pt, normal: nrm, cumLen: cumLen });
            }
        }
        return samples;
    }

    // ============================================================
    // ALONG PATH — генерация (с Coverage Top/Down)
    // ============================================================
    function generateAlongPattern(samples, opts) {
        var microPts = [];
        var accentPts = [];

        var ringCount = Math.max(1, Math.floor(opts.spread / opts.microSpacing));
        var ringDistances = [];
        for (var r=0; r<=ringCount; r++) {
            ringDistances.push(opts.padding + r * opts.microSpacing);
        }

        var innerRing = 0;
        var outerRing = ringDistances.length - 1;
        var middleRing = Math.floor(ringDistances.length / 2);

        var accentRingSet = {};
        if (opts.accentInner)  accentRingSet[innerRing]  = true;
        if (opts.accentMiddle) accentRingSet[middleRing] = true;
        if (opts.accentOuter)  accentRingSet[outerRing]  = true;

        var allowTop = opts.alongTop;       // положительная сторона нормали
        var allowDown = opts.alongDown;     // отрицательная
        if (!allowTop && !allowDown) { allowTop = true; allowDown = true; }

        // прореживание точек вдоль пути по spacing
        var sampleStep = Math.max(1, Math.round(opts.microSpacing / 4));

        for (var i=0; i<samples.length; i += sampleStep) {
            var s = samples[i];
            var nx = s.normal[0], ny = s.normal[1];

            for (var ri=0; ri<ringDistances.length; ri++) {
                var d = ringDistances[ri];
                var t = ringDistances.length > 1 ? (ri / (ringDistances.length-1)) : 0;
                var op = opts.noFade ? 1.0 : falloff(t, opts.falloff);
                var isAccentRing = accentRingSet[ri] === true;

                // Top side (positive normal)
                if (allowTop) {
                    var ptT = { x: s.pos[0] + nx*d, y: s.pos[1] + ny*d };
                    if (isAccentRing && (i % (opts.accentEveryN * sampleStep) === 0)) {
                        accentPts.push({x: ptT.x, y: ptT.y, opacity: 1.0});
                    } else {
                        if (Math.random() <= opts.density) {
                            microPts.push({x: ptT.x, y: ptT.y, opacity: op});
                        }
                    }
                }
                // Down side (negative normal)
                if (allowDown) {
                    var ptD = { x: s.pos[0] - nx*d, y: s.pos[1] - ny*d };
                    if (isAccentRing && (i % (opts.accentEveryN * sampleStep) === 0)) {
                        accentPts.push({x: ptD.x, y: ptD.y, opacity: 1.0});
                    } else {
                        if (Math.random() <= opts.density) {
                            microPts.push({x: ptD.x, y: ptD.y, opacity: op});
                        }
                    }
                }
            }
        }

        return { microPts: microPts, accentPts: accentPts };
    }

    // ============================================================
    // MODE DETECTION
    // ============================================================
    function detectMode(layer) {
        var path = findPathInLayer(layer);
        if (!path) return "around";
        if (path.type === "mask") return "along";
        try {
            var v = path.prop.value.vertices;
            // rect-like shape (4 vertices) и ellipse → around
            if (v.length <= 4) return "around";
        } catch (e) {}
        return "along";
    }

    // ============================================================
    // LAYER CREATION (с правильным anchor — из v1.0.1)
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
        var bbCx = (minX + maxX) / 2;
        var bbCy = (minY + maxY) / 2;

        var layer = comp.layers.addShape();
        layer.name = name;

        // группируем по opacity для экономии
        var buckets = {};
        for (var j=0; j<dots.length; j++) {
            var d = dots[j];
            var key = Math.round(d.opacity * 20) / 20;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push([d.x, d.y]);
        }

        var contents = layer.property("ADBE Root Vectors Group");

        for (var op in buckets) {
            if (!buckets.hasOwnProperty(op)) continue;
            var pts = buckets[op];
            var grp = contents.addProperty("ADBE Vector Group");
            grp.name = "Op_" + op;
            var inner = grp.property("ADBE Vectors Group");

            for (var m=0; m<pts.length; m++) {
                var dotGrp = inner.addProperty("ADBE Vector Group");
                dotGrp.name = "Dot";
                var dotInner = dotGrp.property("ADBE Vectors Group");
                var ell = dotInner.addProperty("ADBE Vector Shape - Ellipse");
                ell.property("Size").setValue([size, size]);
                ell.property("Position").setValue([0, 0]);
                try {
                    dotGrp.property("Transform").property("Position")
                        .setValue([pts[m][0] - bbCx, pts[m][1] - bbCy]);
                } catch(e) {}
            }

            var fill = inner.addProperty("ADBE Vector Graphic - Fill");
            fill.property("Color").setValue(color);
            fill.property("Opacity").setValue(parseFloat(op) * 100);
        }

        try {
            layer.property("Transform").property("Position").setValue([bbCx, bbCy]);
            layer.property("Transform").property("Anchor Point").setValue([0, 0]);
        } catch(e) {}

        return layer;
    }

    // ============================================================
    // MAIN GENERATE
    // ============================================================
    function generatePattern(layer, opts) {
        var comp = layer.containingComp;

        var mode = opts.mode;
        if (mode === "auto") mode = detectMode(layer);

        var result, info;

        if (mode === "along") {
            var pathInfo = findPathInLayer(layer);
            if (!pathInfo) {
                alert("Выделите слой с Mask Path или Shape Path.\nИли слой с одной маской — путь возьмётся автоматически.");
                return;
            }
            var samples = samplePath(pathInfo, layer);
            if (!samples.length) { alert("Не удалось получить точки на пути."); return; }
            result = generateAlongPattern(samples, opts);
            info = getSourceInfo(layer); // для color
        } else {
            info = getSourceInfo(layer);
            result = generateAroundPattern(info, opts);
        }

        var total = result.microPts.length + result.accentPts.length;
        if (total === 0) { alert("Нет точек для генерации."); return; }
        if (total > MAX_DOTS) {
            if (!confirm("Будет создано " + total + " точек (лимит " + MAX_DOTS + ").\nПродолжить?")) return;
        }

        var microColor = (opts.useObjColorMicro && info && info.color) ? info.color : opts.microColor;
        var accentColor = (opts.useObjColorAccent && info && info.color) ? info.color : opts.accentColor;

        app.beginUndoGroup(SCRIPT_NAME + " — Generate");
        var microLayer = createDotLayer(comp, "DotPattern_Micro", result.microPts, opts.microSize, microColor);
        var accentLayer = createDotLayer(comp, "DotPattern_Accent", result.accentPts, opts.accentSize, accentColor);

        if (opts.preComp) {
            var idxs = [];
            if (accentLayer) idxs.push(accentLayer.index);
            if (microLayer) idxs.push(microLayer.index);
            if (idxs.length) {
                try { comp.layers.precompose(idxs, "DotPattern_PreComp", true); } catch(e) {}
            }
        } else if (opts.parentToSource) {
            try {
                if (microLayer) microLayer.parent = layer;
                if (accentLayer) accentLayer.parent = layer;
            } catch(e) {}
        }
        app.endUndoGroup();

        lastOpts = cloneOpts(opts);
        lastTargetIdx = layer.index;
    }

    function cloneOpts(o) {
        var n = {};
        for (var k in o) if (o.hasOwnProperty(k)) {
            if (o[k] && o[k].length === 4) n[k] = [o[k][0],o[k][1],o[k][2],o[k][3]];
            else if (o[k] && o[k].length === 3) n[k] = [o[k][0],o[k][1],o[k][2]];
            else n[k] = o[k];
        }
        return n;
    }

    // ============================================================
    // UI HELPERS
    // ============================================================
    function addDivider(parent) {
        var g = parent.add("group");
        g.alignment = ["fill", "top"];
        g.minimumSize.height = 1;
        g.maximumSize.height = 1;
        g.graphics.backgroundColor = g.graphics.newBrush(g.graphics.BrushType.SOLID_COLOR, COL.divider);
    }
    function addSectionLabel(parent, text) {
        var st = parent.add("statictext", undefined, text);
        st.graphics.foregroundColor = st.graphics.newPen(st.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1);
        return st;
    }
    function styleSwatch(btn, rgb) {
        try {
            btn.fillBrush = btn.graphics.newBrush(btn.graphics.BrushType.SOLID_COLOR, [rgb[0],rgb[1],rgb[2],1]);
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
        return [((res>>16)&0xFF)/255, ((res>>8)&0xFF)/255, (res&0xFF)/255];
    }

    // ============================================================
    // UI
    // ============================================================
    function buildUI(thisObj) {
        var w = (thisObj instanceof Panel) ? thisObj
              : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, {resizeable:true});
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.spacing = 6;
        w.margins = 10;

        try { w.graphics.backgroundColor = w.graphics.newBrush(w.graphics.BrushType.SOLID_COLOR, COL.bg); } catch(e) {}

        var title = w.add("statictext", undefined, SCRIPT_NAME + "  " + SCRIPT_VERSION);
        title.preferredSize.width = 240;
        title.graphics.foregroundColor = title.graphics.newPen(title.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1);

        // MODE
        var modeRow = w.add("group");
        modeRow.orientation = "row";
        modeRow.alignChildren = ["left", "center"];
        var modeLbl = modeRow.add("statictext", undefined, "MODE:");
        modeLbl.graphics.foregroundColor = modeLbl.graphics.newPen(modeLbl.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1);
        var modeDD = modeRow.add("dropdownlist", undefined, ["Auto-detect", "Around Shape", "Along Path"]);
        modeDD.selection = 0;

        addDivider(w);

        // COVERAGE (только для Along Path)
        addSectionLabel(w, "COVERAGE (Along Path only)");
        var covRow = w.add("group");
        covRow.orientation = "row";
        covRow.alignChildren = ["left","center"];
        covRow.spacing = 16;
        var cbTop = covRow.add("checkbox", undefined, "▲ Top side");
        var cbDown = covRow.add("checkbox", undefined, "▼ Down side");
        cbTop.value = true;
        cbDown.value = true;

        function updateCoverageState() {
            var idx = modeDD.selection ? modeDD.selection.index : 0;
            var isAlong = (idx === 2);
            // в Auto-detect оставляем активными (на случай если выделен путь)
            var enabled = (idx !== 1); // 1 = Around Shape явно
            cbTop.enabled = enabled;
            cbDown.enabled = enabled;
        }
        modeDD.onChange = updateCoverageState;
        updateCoverageState();

        addDivider(w);

        // MICRO GRID
        addSectionLabel(w, "MICRO GRID");
        var microState = { color: DEFAULT_MICRO.slice() };

        function mkSlider(parent, label, init, lo, hi, suffix, isFloat) {
            var g = parent.add("group");
            var l = g.add("statictext", undefined, label);
            l.preferredSize.width = 70;
            var s = g.add("slider", undefined, init, lo, hi);
            s.preferredSize.width = 110;
            var v = g.add("statictext", undefined, (isFloat ? init.toFixed(2) : Math.round(init)) + (suffix||""));
            v.preferredSize.width = 50;
            s.onChanging = function(){
                v.text = (isFloat ? s.value.toFixed(2) : Math.round(s.value)) + (suffix||"");
            };
            return s;
        }

        var microSizeSl = mkSlider(w, "Size:", 2, 1, 10, " px");
        var microColorG = w.add("group");
        var mcL = microColorG.add("statictext", undefined, "Color:"); mcL.preferredSize.width = 70;
        var microColorBtn = microColorG.add("button", undefined, " ");
        microColorBtn.preferredSize = [40, 20];
        styleSwatch(microColorBtn, microState.color);
        microColorBtn.onClick = function(){
            var c = pickColor(microState.color);
            if (c) { microState.color = c; styleSwatch(microColorBtn, c); }
        };
        var microUseObjCB = microColorG.add("checkbox", undefined, "Use object color");

        var microSpacingSl = mkSlider(w, "Spacing:", 8, 3, 30, " px");
        var padSl = mkSlider(w, "Padding:", 20, 0, 200, " px");
        var spreadSl = mkSlider(w, "Spread:", 120, 20, 400, " px");
        var densSl = mkSlider(w, "Density:", 0.7, 0.3, 1, "", true);

        var falloffG = w.add("group");
        var fL = falloffG.add("statictext", undefined, "Falloff:"); fL.preferredSize.width = 70;
        var falloffDD = falloffG.add("dropdownlist", undefined, ["linear","ease","step"]);
        falloffDD.selection = 0;
        var noFadeCB = falloffG.add("checkbox", undefined, "No fade");

        addDivider(w);

        // ACCENT DOTS
        addSectionLabel(w, "ACCENT DOTS");
        var accentState = { color: DEFAULT_ACCENT.slice() };

        var accSizeSl = mkSlider(w, "Size:", 6, 2, 20, " px");
        var accColorG = w.add("group");
        var acL = accColorG.add("statictext", undefined, "Color:"); acL.preferredSize.width = 70;
        var accColorBtn = accColorG.add("button", undefined, " ");
        accColorBtn.preferredSize = [40, 20];
        styleSwatch(accColorBtn, accentState.color);
        accColorBtn.onClick = function(){
            var c = pickColor(accentState.color);
            if (c) { accentState.color = c; styleSwatch(accColorBtn, c); }
        };
        var accUseObjCB = accColorG.add("checkbox", undefined, "Use object color");

        var accNthSl = mkSlider(w, "Every N-th:", 6, 2, 20, "");

        var ringG = w.add("group");
        var rL = ringG.add("statictext", undefined, "Rings:"); rL.preferredSize.width = 70;
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

        var btnRow = w.add("group");
        btnRow.alignment = ["fill","top"];
        var genBtn = btnRow.add("button", undefined, "Create Pattern");
        var regenBtn = btnRow.add("button", undefined, "Re-generate Last");
        var helpBtn = btnRow.add("button", undefined, "?");
        helpBtn.preferredSize.width = 30;

        function readState() {
            return {
                mode: ["auto","around","along"][modeDD.selection.index],
                alongTop: cbTop.value,
                alongDown: cbDown.value,
                microSize: Math.round(microSizeSl.value),
                microColor: microState.color,
                useObjColorMicro: microUseObjCB.value,
                microSpacing: Math.round(microSpacingSl.value),
                padding: Math.round(padSl.value),
                spread: Math.round(spreadSl.value),
                density: densSl.value,
                falloff: falloffDD.selection.text,
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

        genBtn.onClick = function(){
            var comp = getComp(); if (!comp) return;
            var l = getSelLayer(); if (!l) { alert("Выделите слой-источник."); return; }
            generatePattern(l, readState());
        };
        regenBtn.onClick = function(){
            var comp = getComp(); if (!comp) return;
            if (!lastOpts) { alert("Сначала создайте паттерн кнопкой Create Pattern."); return; }
            var l = getSelLayer();
            if (!l && lastTargetIdx && comp.layer(lastTargetIdx)) l = comp.layer(lastTargetIdx);
            if (!l) { alert("Выделите слой-источник."); return; }
            generatePattern(l, lastOpts);
        };
        helpBtn.onClick = function(){ alert(getHelpText()); };

        if (w instanceof Window) { w.center(); w.show(); }
        else { w.layout.layout(true); w.layout.resize(); }
        return w;
    }

        function getHelpText() {
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n" +
            "═══════════════════════════════════════\n\n" +
            "НАЗНАЧЕНИЕ\n" +
            "Создаёт паттерн из точек вокруг фигуры или вдоль пути.\n" +
            "После генерации источник можно скрыть/удалить — паттерн остаётся.\n\n" +

            "═══ MODE (режим работы) ═══\n" +
            "• Auto-detect — автоматически выбирает режим по выделенному слою.\n" +
            "    Shape rect/ellipse → Around Shape\n" +
            "    Слой с маской или сложный path → Along Path\n" +
            "• Around Shape — концентрические кольца точек вокруг фигуры.\n" +
            "    Подходит для прямоугольников и кругов.\n" +
            "• Along Path — точки откладываются по нормали от пути.\n" +
            "    Источник пути: Mask Path (маска слоя) или Shape Path (произвольный путь в Shape Layer).\n" +
            "    Авто-fallback: если на слое одна маска, она берётся автоматически.\n\n" +

            "═══ COVERAGE (Along Path only) ═══\n" +
            "• ▲ Top side — точки с положительной стороны нормали пути.\n" +
            "• ▼ Down side — точки с отрицательной стороны нормали пути.\n" +
            "Для замкнутого пути (например овальная маска):\n" +
            "    Top side = снаружи контура, Down side = внутри.\n" +
            "Для открытого пути направление зависит от порядка точек пути.\n" +
            "В режиме Around Shape оба чекбокса серые и не работают.\n\n" +

            "═══ MICRO GRID (мелкая сетка точек) ═══\n" +
            "• Size — размер точки в пикселях (1-10).\n" +
            "• Color — основной цвет точек.\n" +
            "• Use object color — взять цвет из выделенного слоя:\n" +
            "    Shape Layer → цвет Fill, иначе Stroke.\n" +
            "    Solid Layer → цвет самого солида.\n" +
            "    Footage → дефолтный цвет.\n" +
            "• Spacing — расстояние между точками (3-30 px).\n" +
            "• Padding — отступ первого кольца от границы объекта/пути.\n" +
            "• Spread — толщина паттерна (на сколько px колец отойдёт от объекта).\n" +
            "• Density — вероятность отрисовки точки (0.3-1.0). 1.0 = все точки.\n" +
            "• Falloff — закон затухания прозрачности по мере удаления:\n" +
            "    linear — равномерное\n" +
            "    ease — кубическое (быстрое затухание у края)\n" +
            "    step — ступенчатое (3 уровня яркости)\n" +
            "• No fade — отключает затухание, все точки 100% непрозрачные.\n\n" +

            "═══ ACCENT DOTS (крупные акцентные точки) ═══\n" +
            "Акценты заменяют micro-точки в выбранных кольцах.\n" +
            "• Size — размер акцентной точки (2-20 px).\n" +
            "• Color — цвет.\n" +
            "• Use object color — то же, что для micro.\n" +
            "• Every N-th — каждая N-я точка кольца становится акцентом (2-20).\n" +
            "    2 = очень густо, 20 = очень редко.\n" +
            "• Rings — на каких кольцах размещать акценты:\n" +
            "    Inner — ближайшее к объекту\n" +
            "    Middle — среднее\n" +
            "    Outer — самое дальнее\n" +
            "Можно включить несколько одновременно.\n\n" +

            "═══ OUTPUT ═══\n" +
            "• Pre-comp result — упаковать оба слоя точек в pre-comp.\n" +
            "• Parent to source — привязать слои точек к источнику\n" +
            "    (паттерн будет двигаться вместе с фигурой).\n\n" +

            "═══ КНОПКИ ═══\n" +
            "• Create Pattern — создать паттерн на основе выделенного слоя.\n" +
            "• Re-generate Last — пересоздать с теми же параметрами\n" +
            "    (новое случайное распределение density).\n\n" +

            "═══ РАБОЧИЙ ПРОЦЕСС ═══\n" +
            "1. Создай фигуру или маску.\n" +
            "2. Выдели её.\n" +
            "3. Выбери MODE (или оставь Auto).\n" +
            "4. Настрой параметры.\n" +
            "5. Нажми Create Pattern.\n" +
            "6. Создадутся два слоя: DotPattern_Micro и DotPattern_Accent.\n" +
            "7. Источник можно скрыть/удалить.\n\n" +

            "═══ ЛИМИТЫ ═══\n" +
            "Максимум " + MAX_DOTS + " точек на паттерн.\n" +
            "При превышении — запрос подтверждения.\n\n" +

            "═══ ИЗВЕСTНЫЕ ОГРАНИЧЕНИЯ ═══\n" +
            "• Scale/Rotation слоя-источника не учитываются (только Position).\n" +
            "• Color picker может вернуть -1 при отмене — цвет не меняется.\n" +
            "• Для footage/text слоёв 'Use object color' возвращает дефолт.\n\n" +

            "Версия: " + SCRIPT_VERSION + " | Архитектура v1.0.1 + Along Path";
    }


    buildUI(thisObj);

})(this);
