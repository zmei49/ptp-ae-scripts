// ============================================================
// ptp_DotPattern.jsx
// v1.3 — Element types (10), per-section stroke width, rotate to path
// Author: ptp toolkit
// Install: Save into "Support Files/Scripts/ScriptUI Panels/"
// Run via: Window -> ptp_DotPattern.jsx
// ============================================================

(function ptp_DotPattern(thisObj) {

    var SCRIPT_NAME = "ptp_DotPattern";
    var SCRIPT_VERSION = "v1.3";

    var COL = {
        bg:        [0.16, 0.16, 0.17, 1],
        accentTxt: [1.00, 0.65, 0.10, 1],
        divider:   [0.30, 0.30, 0.32, 1]
    };

    var DEFAULT_ACCENT = [1.00, 0.96, 0.40];
    var DEFAULT_MICRO  = [0.79, 0.76, 0.40];

    var SOFT_WARN_DOTS = 5000;

    var ELEMENT_TYPES = [
        "Dot",
        "Circle (stroke)",
        "Circle + dot",
        "Circle + plus",
        "Cross (+)",
        "X (×)",
        "Square (stroke)",
        "Square (filled)",
        "Concentric rings",
        "Dashed circle"
    ];

    // Дефолтные размеры по типу (используются если юзер сам не менял Size)
    var DEFAULT_SIZE_BY_TYPE = {
        "Dot": 2,
        "Circle (stroke)": 12,
        "Circle + dot": 14,
        "Circle + plus": 14,
        "Cross (+)": 10,
        "X (×)": 10,
        "Square (stroke)": 12,
        "Square (filled)": 12,
        "Concentric rings": 16,
        "Dashed circle": 14
    };

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
    // SOURCE OBJECT ANALYSIS (с приоритетом Stroke и проверкой Opacity)
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
            try {
                if (layer.source && layer.source.mainSource && layer.source.mainSource.color) {
                    info.color = layer.source.mainSource.color;
                }
            } catch(e) {}
        }

        return info;
    }

    // ============================================================
    // FALLOFF
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
    // RING POINT GENERATION
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
                    rot: 0
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
                points.push({ x: left + t*(right-left)/topCount, y: top, rot: 0 });
            }
            var sideCount = Math.max(1, Math.floor((bottom - top) / spacing));
            for (var s=1; s<sideCount; s++) {
                points.push({ x: right, y: top + s*(bottom-top)/sideCount, rot: 0 });
            }
            for (var b=topCount; b>=0; b--) {
                points.push({ x: left + b*(right-left)/topCount, y: bottom, rot: 0 });
            }
            for (var l=sideCount-1; l>=1; l--) {
                points.push({ x: left, y: top + l*(bottom-top)/sideCount, rot: 0 });
            }
        }

        return points;
    }

    // ============================================================
    // AROUND SHAPE
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
                    accentPts.push({x: pt.x, y: pt.y, opacity: 1.0, rot: 0});
                } else {
                    if (Math.random() > opts.density) continue;
                    microPts.push({x: pt.x, y: pt.y, opacity: op, rot: 0});
                }
            }
        }

        return { microPts: microPts, accentPts: accentPts };
    }

    // ============================================================
    // ALONG PATH — поиск пути и сэмплирование
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

        var SAMPLES = 40;
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
                var ang = Math.atan2(nrm[1], nrm[0]) * 180 / Math.PI;

                if (prevPt) {
                    var dx = pt[0]-prevPt[0], dy = pt[1]-prevPt[1];
                    cumLen += Math.sqrt(dx*dx + dy*dy);
                }
                prevPt = pt;

                samples.push({ pos: pt, normal: nrm, angle: ang, cumLen: cumLen });
            }
        }
        return samples;
    }

    // ============================================================
    // ALONG PATH — генерация
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

        var allowTop = opts.alongTop;
        var allowDown = opts.alongDown;
        if (!allowTop && !allowDown) { allowTop = true; allowDown = true; }

        var sampleStep = Math.max(1, Math.round(opts.microSpacing / 4));
        var rotate = opts.rotateToPath;

        for (var i=0; i<samples.length; i += sampleStep) {
            var s = samples[i];
            var nx = s.normal[0], ny = s.normal[1];
            var ang = rotate ? s.angle : 0;

            for (var ri=0; ri<ringDistances.length; ri++) {
                var d = ringDistances[ri];
                var t = ringDistances.length > 1 ? (ri / (ringDistances.length-1)) : 0;
                var op = opts.noFade ? 1.0 : falloff(t, opts.falloff);
                var isAccentRing = accentRingSet[ri] === true;
                var isAccentSample = (i % (opts.accentEveryN * sampleStep) === 0);

                if (allowTop) {
                    var ptT = { x: s.pos[0] + nx*d, y: s.pos[1] + ny*d };
                    if (isAccentRing && isAccentSample) {
                        accentPts.push({x: ptT.x, y: ptT.y, opacity: 1.0, rot: ang});
                    } else {
                        if (Math.random() <= opts.density) {
                            microPts.push({x: ptT.x, y: ptT.y, opacity: op, rot: ang});
                        }
                    }
                }
                if (allowDown) {
                    var ptD = { x: s.pos[0] - nx*d, y: s.pos[1] - ny*d };
                    if (isAccentRing && isAccentSample) {
                        accentPts.push({x: ptD.x, y: ptD.y, opacity: 1.0, rot: ang + 180});
                    } else {
                        if (Math.random() <= opts.density) {
                            microPts.push({x: ptD.x, y: ptD.y, opacity: op, rot: ang + 180});
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
            if (v.length <= 4) return "around";
        } catch (e) {}
        return "along";
    }

    // ============================================================
    // ELEMENT CREATION — создаёт примитивы внутри переданной inner Group
    // ============================================================
    function addEllipse(inner, size, name) {
        var ell = inner.addProperty("ADBE Vector Shape - Ellipse");
        ell.property("Size").setValue([size, size]);
        ell.property("Position").setValue([0, 0]);
        if (name) try { ell.name = name; } catch(e){}
        return ell;
    }
    function addRect(inner, size, name) {
        var r = inner.addProperty("ADBE Vector Shape - Rect");
        r.property("Size").setValue([size, size]);
        r.property("Position").setValue([0, 0]);
        if (name) try { r.name = name; } catch(e){}
        return r;
    }
    function addLine(inner, x1, y1, x2, y2) {
        var sp = inner.addProperty("ADBE Vector Shape - Group");
        var pathVal = new Shape();
        pathVal.vertices = [[x1, y1], [x2, y2]];
        pathVal.inTangents = [[0,0],[0,0]];
        pathVal.outTangents = [[0,0],[0,0]];
        pathVal.closed = false;
        sp.property("Path").setValue(pathVal);
        return sp;
    }
    function addFill(inner, color, opacity) {
        var f = inner.addProperty("ADBE Vector Graphic - Fill");
        f.property("Color").setValue(color);
        f.property("Opacity").setValue(opacity != null ? opacity : 100);
        return f;
    }
    function addStroke(inner, color, width, opacity) {
        var s = inner.addProperty("ADBE Vector Graphic - Stroke");
        s.property("Color").setValue(color);
        s.property("Stroke Width").setValue(width);
        s.property("Opacity").setValue(opacity != null ? opacity : 100);
        return s;
    }
    function addDashes(strokeProp, dashLen, gapLen) {
        try {
            var dashes = strokeProp.property("ADBE Vector Stroke Dashes");
            if (dashes) {
                var d = dashes.addProperty("ADBE Vector Stroke Dash 1");
                d.setValue(dashLen);
                var g = dashes.addProperty("ADBE Vector Stroke Gap 1");
                g.setValue(gapLen);
            }
        } catch(e) {}
    }

    // Создаёт один штамп заданного типа в group (которая уже добавлена в layer)
    function buildElement(group, type, size, color, strokeWidth, opacity) {
        var inner = group.property("ADBE Vectors Group");

        if (type === "Dot") {
            addEllipse(inner, size);
            addFill(inner, color, opacity);

        } else if (type === "Circle (stroke)") {
            addEllipse(inner, size);
            addStroke(inner, color, strokeWidth, opacity);

        } else if (type === "Circle + dot") {
            // outer circle stroke
            var oG = inner.addProperty("ADBE Vector Group"); oG.name = "outer";
            var oIn = oG.property("ADBE Vectors Group");
            addEllipse(oIn, size);
            addStroke(oIn, color, strokeWidth, opacity);
            // inner dot
            var iG = inner.addProperty("ADBE Vector Group"); iG.name = "dot";
            var iIn = iG.property("ADBE Vectors Group");
            addEllipse(iIn, size * 0.3);
            addFill(iIn, color, opacity);

        } else if (type === "Circle + plus") {
            // outer circle stroke
            var oG2 = inner.addProperty("ADBE Vector Group"); oG2.name = "outer";
            var oIn2 = oG2.property("ADBE Vectors Group");
            addEllipse(oIn2, size);
            addStroke(oIn2, color, strokeWidth, opacity);
            // inner plus
            var pG = inner.addProperty("ADBE Vector Group"); pG.name = "plus";
            var pIn = pG.property("ADBE Vectors Group");
            var plusLen = size * 0.4;
            addLine(pIn, -plusLen/2, 0, plusLen/2, 0);
            addLine(pIn, 0, -plusLen/2, 0, plusLen/2);
            addStroke(pIn, color, strokeWidth, opacity);

        } else if (type === "Cross (+)") {
            addLine(inner, -size/2, 0, size/2, 0);
            addLine(inner, 0, -size/2, 0, size/2);
            addStroke(inner, color, strokeWidth, opacity);

        } else if (type === "X (×)") {
            var h = size/2;
            addLine(inner, -h, -h, h, h);
            addLine(inner, -h, h, h, -h);
            addStroke(inner, color, strokeWidth, opacity);

        } else if (type === "Square (stroke)") {
            addRect(inner, size);
            addStroke(inner, color, strokeWidth, opacity);

        } else if (type === "Square (filled)") {
            addRect(inner, size);
            addFill(inner, color, opacity);

        } else if (type === "Concentric rings") {
            // 3 кольца
            var r1G = inner.addProperty("ADBE Vector Group"); r1G.name = "ring1";
            addEllipse(r1G.property("ADBE Vectors Group"), size);
            addStroke(r1G.property("ADBE Vectors Group"), color, strokeWidth, opacity);
            var r2G = inner.addProperty("ADBE Vector Group"); r2G.name = "ring2";
            addEllipse(r2G.property("ADBE Vectors Group"), size * 0.65);
            addStroke(r2G.property("ADBE Vectors Group"), color, strokeWidth, opacity);
            var r3G = inner.addProperty("ADBE Vector Group"); r3G.name = "ring3";
            addEllipse(r3G.property("ADBE Vectors Group"), size * 0.35);
            addStroke(r3G.property("ADBE Vectors Group"), color, strokeWidth, opacity);

        } else if (type === "Dashed circle") {
            addEllipse(inner, size);
            var strokeP = addStroke(inner, color, strokeWidth, opacity);
            addDashes(strokeP, 4, 3);

        } else {
            // fallback
            addEllipse(inner, size);
            addFill(inner, color, opacity);
        }
    }

    // ============================================================
    // LAYER CREATION
    // ============================================================
    function createDotLayer(comp, name, dots, type, size, color, strokeWidth) {
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
        var contents = layer.property("ADBE Root Vectors Group");

        for (var j=0; j<dots.length; j++) {
            var d = dots[j];
            var elemGrp = contents.addProperty("ADBE Vector Group");
            elemGrp.name = "Elem_" + j;
            buildElement(elemGrp, type, size, color, strokeWidth, d.opacity * 100);

            // позиция и поворот через Transform группы
            try {
                var tr = elemGrp.property("Transform");
                tr.property("Position").setValue([d.x - bbCx, d.y - bbCy]);
                if (d.rot) tr.property("Rotation").setValue(d.rot);
            } catch(e) {}
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
            info = getSourceInfo(layer);
        } else {
            info = getSourceInfo(layer);
            result = generateAroundPattern(info, opts);
        }

        var total = result.microPts.length + result.accentPts.length;
        if (total === 0) { alert("Нет точек для генерации."); return; }
        if (total > SOFT_WARN_DOTS) {
            if (!confirm("Будет создано " + total + " элементов. Это может занять время.\nПродолжить?")) return;
        }

        var microColor = (opts.useObjColorMicro && info && info.color) ? info.color : opts.microColor;
        var accentColor = (opts.useObjColorAccent && info && info.color) ? info.color : opts.accentColor;

        app.beginUndoGroup(SCRIPT_NAME + " — Generate");
        var microLayer = createDotLayer(
            comp, "DotPattern_Micro",
            result.microPts, opts.microElement, opts.microSize, microColor, opts.microStrokeWidth
        );
        var accentLayer = createDotLayer(
            comp, "DotPattern_Accent",
            result.accentPts, opts.accentElement, opts.accentSize, accentColor, opts.accentStrokeWidth
        );

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

        // COVERAGE
        addSectionLabel(w, "COVERAGE (Along Path only)");
        var covRow = w.add("group");
        covRow.orientation = "row";
        covRow.alignChildren = ["left","center"];
        covRow.spacing = 16;
        var cbTop = covRow.add("checkbox", undefined, "▲ Top side");
        var cbDown = covRow.add("checkbox", undefined, "▼ Down side");
        cbTop.value = true;
        cbDown.value = true;
        var rotateRow = w.add("group");
        var cbRotate = rotateRow.add("checkbox", undefined, "Rotate elements to path");

        function updateCoverageState() {
            var idx = modeDD.selection ? modeDD.selection.index : 0;
            var enabled = (idx !== 1);
            cbTop.enabled = enabled;
            cbDown.enabled = enabled;
            cbRotate.enabled = enabled;
        }
        modeDD.onChange = updateCoverageState;
        updateCoverageState();

        addDivider(w);

        function mkSlider(parent, label, init, lo, hi, suffix, isFloat) {
            var g = parent.add("group");
            var l = g.add("statictext", undefined, label);
            l.preferredSize.width = 80;
            var s = g.add("slider", undefined, init, lo, hi);
            s.preferredSize.width = 110;
            var v = g.add("statictext", undefined, (isFloat ? init.toFixed(2) : Math.round(init)) + (suffix||""));
            v.preferredSize.width = 50;
            s.onChanging = function(){
                v.text = (isFloat ? s.value.toFixed(2) : Math.round(s.value)) + (suffix||"");
            };
            return s;
        }

        // ===== MICRO GRID =====
        addSectionLabel(w, "MICRO GRID");
        var microState = { color: DEFAULT_MICRO.slice() };

        var microElemG = w.add("group");
        var meL = microElemG.add("statictext", undefined, "Element:");
        meL.preferredSize.width = 80;
        var microElemDD = microElemG.add("dropdownlist", undefined, ELEMENT_TYPES);
        microElemDD.selection = 0;
        microElemDD.preferredSize.width = 160;

        var microSizeSl = mkSlider(w, "Size:", 2, 1, 30, " px");
        var microStrokeSl = mkSlider(w, "Stroke W:", 2, 1, 5, " px");

        var microColorG = w.add("group");
        var mcL = microColorG.add("statictext", undefined, "Color:"); mcL.preferredSize.width = 80;
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
        var fL = falloffG.add("statictext", undefined, "Falloff:"); fL.preferredSize.width = 80;
        var falloffDD = falloffG.add("dropdownlist", undefined, ["linear","ease","step"]);
        falloffDD.selection = 0;
        var noFadeCB = falloffG.add("checkbox", undefined, "No fade");

        addDivider(w);

        // ===== ACCENT DOTS =====
        addSectionLabel(w, "ACCENT DOTS");
        var accentState = { color: DEFAULT_ACCENT.slice() };

        var accElemG = w.add("group");
        var aeL = accElemG.add("statictext", undefined, "Element:");
        aeL.preferredSize.width = 80;
        var accElemDD = accElemG.add("dropdownlist", undefined, ELEMENT_TYPES);
        accElemDD.selection = 0;
        accElemDD.preferredSize.width = 160;

        var accSizeSl = mkSlider(w, "Size:", 6, 2, 40, " px");
        var accStrokeSl = mkSlider(w, "Stroke W:", 2, 1, 5, " px");

        var accColorG = w.add("group");
        var acL = accColorG.add("statictext", undefined, "Color:"); acL.preferredSize.width = 80;
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
        var rL = ringG.add("statictext", undefined, "Rings:"); rL.preferredSize.width = 80;
        var accInnerCB  = ringG.add("checkbox", undefined, "Inner");
        var accMiddleCB = ringG.add("checkbox", undefined, "Middle");
        var accOuterCB  = ringG.add("checkbox", undefined, "Outer");
        accMiddleCB.value = true;

        addDivider(w);

        // ===== OUTPUT =====
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

        // Авто-подсказка размера при смене Element Type (только если юзер не менял)
        var microSizeUserChanged = false;
        var accSizeUserChanged = false;
        microSizeSl.onChange = function(){ microSizeUserChanged = true; };
        accSizeSl.onChange = function(){ accSizeUserChanged = true; };
        microElemDD.onChange = function(){
            if (!microSizeUserChanged) {
                var def = DEFAULT_SIZE_BY_TYPE[microElemDD.selection.text] || 2;
                microSizeSl.value = def;
                microSizeSl.notify("onChanging");
            }
        };
        accElemDD.onChange = function(){
            if (!accSizeUserChanged) {
                var def = DEFAULT_SIZE_BY_TYPE[accElemDD.selection.text] || 6;
                accSizeSl.value = def;
                accSizeSl.notify("onChanging");
            }
        };

        function readState() {
            return {
                mode: ["auto","around","along"][modeDD.selection.index],
                alongTop: cbTop.value,
                alongDown: cbDown.value,
                rotateToPath: cbRotate.value,

                microElement: microElemDD.selection.text,
                microSize: Math.round(microSizeSl.value),
                microStrokeWidth: Math.round(microStrokeSl.value),
                microColor: microState.color,
                useObjColorMicro: microUseObjCB.value,
                microSpacing: Math.round(microSpacingSl.value),
                padding: Math.round(padSl.value),
                spread: Math.round(spreadSl.value),
                density: densSl.value,
                falloff: falloffDD.selection.text,
                noFade: noFadeCB.value,

                accentElement: accElemDD.selection.text,
                accentSize: Math.round(accSizeSl.value),
                accentStrokeWidth: Math.round(accStrokeSl.value),
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
            "Создаёт паттерн из элементов (точки, круги, плюсы и т.д.)\n" +
            "вокруг фигуры или вдоль пути. Источник можно скрыть/удалить —\n" +
            "паттерн остаётся.\n\n" +

            "═══ MODE ═══\n" +
            "Auto-detect — авто-выбор режима по выделенному слою.\n" +
            "Around Shape — концентрические кольца вокруг фигуры.\n" +
            "Along Path — элементы вдоль маски или Shape Path.\n\n" +

            "═══ COVERAGE (Along Path only) ═══\n" +
            "▲ Top side / ▼ Down side — стороны нормали к пути.\n" +
            "Rotate elements to path — поворот штампов по нормали.\n" +
            "Заметно для асимметричных элементов (Cross, X, Square, Dashed).\n\n" +

            "═══ ELEMENT TYPES ═══\n" +
            "Dot — заливная точка.\n" +
            "Circle (stroke) — окружность с обводкой.\n" +
            "Circle + dot — окружность с точкой по центру.\n" +
            "Circle + plus — окружность с плюсом по центру.\n" +
            "Cross (+) — крестик из двух линий.\n" +
            "X (×) — диагональный крест.\n" +
            "Square (stroke) — квадрат с обводкой.\n" +
            "Square (filled) — закрашенный квадрат.\n" +
            "Concentric rings — 3 концентрические окружности.\n" +
            "Dashed circle — окружность с прерывистой обводкой.\n\n" +

            "═══ MICRO GRID ═══\n" +
            "Element — тип элемента (10 вариантов).\n" +
            "Size — размер элемента (1-30 px).\n" +
            "Stroke W — толщина обводки (1-5 px) для всех элементов с обводкой.\n" +
            "Color / Use object color — основной цвет.\n" +
            "Spacing — расстояние между элементами.\n" +
            "Padding — отступ первого кольца от границы объекта.\n" +
            "Spread — толщина паттерна.\n" +
            "Density — вероятность отрисовки (0.3-1.0).\n" +
            "Falloff — закон затухания: linear / ease / step.\n" +
            "No fade — отключает затухание.\n\n" +

            "═══ ACCENT DOTS ═══\n" +
            "Отдельный Element, Size, Stroke W, Color от micro.\n" +
            "Every N-th — каждый N-й элемент кольца становится акцентом.\n" +
            "Rings — на каких кольцах размещать (Inner/Middle/Outer).\n\n" +

            "═══ OUTPUT ═══\n" +
            "Pre-comp result — упаковать в pre-comp.\n" +
            "Parent to source — привязать к источнику.\n\n" +

            "═══ КНОПКИ ═══\n" +
            "Create Pattern — создать с текущими настройками.\n" +
            "Re-generate Last — пересоздать с теми же параметрами.\n\n" +

            "═══ ПРИМЕРЫ ═══\n" +
            "Точки + крупные круги-акценты: micro=Dot, accent=Circle+plus.\n" +
            "Технический фон: micro=Cross, accent=Concentric rings.\n" +
            "LED-эффект: micro=Dot, accent=Dashed circle.\n" +
            "Штрих-код вдоль пути: micro=Cross, Rotate to path=ON.\n\n" +

            "Версия: " + SCRIPT_VERSION + " | 10 element types";
    }

    buildUI(thisObj);

})(this);
