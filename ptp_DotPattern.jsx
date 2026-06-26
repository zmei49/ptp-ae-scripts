// ============================================================
// ptp_DotPattern.jsx
// v1.0.1 — Unified grid + accent rings + anchor fix
// Author: ptp toolkit
// Install: Save into "Support Files/Scripts/ScriptUI Panels/"
// Run via: Window -> ptp_DotPattern.jsx
// ============================================================

(function ptp_DotPattern(thisObj) {

    var SCRIPT_NAME = "ptp_DotPattern";
    var SCRIPT_VERSION = "v1.0.1";

    var COL = {
        bg:        [0.16, 0.16, 0.17, 1],
        accentTxt: [1.00, 0.65, 0.10, 1]
    };

    var DEFAULT_ACCENT = [1.00, 0.96, 0.40];
    var DEFAULT_MICRO  = [0.79, 0.76, 0.40];

    var MAX_DOTS = 2000;

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

    // ============================================================
    // SOURCE OBJECT ANALYSIS
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
                    // color
                    var hasFill = false;
                    for (var k=1; k<=inner.numProperties; k++) {
                        if (inner.property(k).matchName === "ADBE Vector Graphic - Fill") {
                            try { info.color = inner.property(k).property("Color").value; } catch(e){}
                            hasFill = true;
                            break;
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
                info.w = rect.width;
                info.h = rect.height;
                info.kind = "rect";
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
    // RING POINT GENERATION (один ряд точек на заданном расстоянии)
    // ============================================================
    function generateRingPoints(info, distance, spacing) {
        // distance = расстояние от поверхности объекта (внешнее)
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
                    ringIndex: 0  // заполним извне
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

            // верх
            var topCount = Math.max(2, Math.floor((right - left) / spacing));
            for (var t=0; t<=topCount; t++) {
                points.push({ x: left + t*(right-left)/topCount, y: top, ringIndex: 0 });
            }
            // право (без угловых)
            var sideCount = Math.max(1, Math.floor((bottom - top) / spacing));
            for (var s=1; s<sideCount; s++) {
                points.push({ x: right, y: top + s*(bottom-top)/sideCount, ringIndex: 0 });
            }
            // низ
            for (var b=topCount; b>=0; b--) {
                points.push({ x: left + b*(right-left)/topCount, y: bottom, ringIndex: 0 });
            }
            // лево (без угловых)
            for (var l=sideCount-1; l>=1; l--) {
                points.push({ x: left, y: top + l*(bottom-top)/sideCount, ringIndex: 0 });
            }
        }

        return points;
    }

    // ============================================================
    // FULL GRID GENERATION (все кольца micro + accent позиции)
    // ============================================================
    function generateFullPattern(info, opts) {
        // returns {microPts: [...], accentPts: [...]}
        var microPts = [];
        var accentPts = [];

        // определяем кольца от padding до padding+spread с шагом microSpacing
        var ringCount = Math.max(1, Math.floor(opts.spread / opts.microSpacing));
        var ringDistances = []; // расстояние от поверхности объекта
        for (var r=0; r<=ringCount; r++) {
            ringDistances.push(opts.padding + r * opts.microSpacing);
        }

        // вычисляем какие кольца являются accent
        var innerRing  = 0;
        var outerRing  = ringDistances.length - 1;
        var middleRing = Math.floor(ringDistances.length / 2);

        var accentRingSet = {};
        if (opts.accentInner)  accentRingSet[innerRing]  = true;
        if (opts.accentMiddle) accentRingSet[middleRing] = true;
        if (opts.accentOuter)  accentRingSet[outerRing]  = true;

        // генерируем точки на каждом кольце
        for (var i=0; i<ringDistances.length; i++) {
            var ringPts = generateRingPoints(info, ringDistances[i], opts.microSpacing);
            var isAccentRing = accentRingSet[i] === true;

            // opacity для этого кольца
            var t = ringDistances.length > 1 ? (i / (ringDistances.length-1)) : 0;
            var op = opts.noFade ? 1.0 : falloff(t, opts.falloff);

            for (var j=0; j<ringPts.length; j++) {
                var pt = ringPts[j];

                // accent в этом ряду: каждая N-я точка → accent (заменяет micro)
                if (isAccentRing && (j % opts.accentEveryN === 0)) {
                    accentPts.push({x: pt.x, y: pt.y, opacity: 1.0});
                } else {
                    // density проверка только для micro
                    if (Math.random() > opts.density) continue;
                    microPts.push({x: pt.x, y: pt.y, opacity: op});
                }
            }
        }

        return { microPts: microPts, accentPts: accentPts };
    }

    // ============================================================
    // LAYER CREATION (с правильным anchor)
    // ============================================================
    function createDotLayer(comp, name, dots, size, color) {
        if (dots.length === 0) return null;

        // вычисляем центр bounding box
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

        // группируем по уровням opacity
        var buckets = {};
        for (var d=0; d<dots.length; d++) {
            var key = Math.round((dots[d].opacity || 1) * 20) / 20; // 5% шаг
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
            try {
                g.property("Transform").property("Opacity").setValue(parseFloat(bkey) * 100);
            } catch(e){}
        }

        return layer;
    }

    function addCircle(inner, x, y, size) {
        var ell = inner.addProperty("ADBE Vector Shape - Ellipse");
        ell.property("Size").setValue([size, size]);
        try { ell.property("Position").setValue([x, y]); } catch(e){}
    }

    // ============================================================
    // MAIN
    // ============================================================
    function generatePattern(target, opts) {
        var comp = target.containingComp;
        var info = getSourceInfo(target);

        var accentColor = opts.useObjectColorAccent ? info.color : opts.accentColor;
        var microColor  = opts.useObjectColorMicro  ? info.color : opts.microColor;

        var result = generateFullPattern(info, opts);

        var totalDots = result.microPts.length + result.accentPts.length;
        if (totalDots > MAX_DOTS) {
            alert("Слишком много точек (" + totalDots + " > " + MAX_DOTS + ").\n" +
                  "Уменьши Spread / увеличь Spacing / снизь Density.");
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
            try {
                for (var l=0; l<layers.length; l++) layers[l].parent = target;
            } catch(e){}
        }

        return layers;
    }

    // ============================================================
    // STATE
    // ============================================================
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
        header.orientation = "row";
        header.alignChildren = ["fill","center"];
        var titleTxt = header.add("statictext", undefined, SCRIPT_NAME + " " + SCRIPT_VERSION);
        try { titleTxt.graphics.foregroundColor = titleTxt.graphics.newPen(titleTxt.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1); } catch(e){}
        var helpBtn = header.add("button", undefined, "?");
        helpBtn.preferredSize = [26, 22];
        helpBtn.alignment = ["right","center"];
        addDivider(win);

        var state = {
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
        win.add("statictext", undefined, "● Around Shape (Along Path — в v1.1)");
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
        useObjMicro.value = false;

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
        noFadeCheck.value = false;

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
        useObjAccent.value = false;

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

        // ===== OUTPUT =====
        addSectionLabel(win, "OUTPUT");
        var precompCheck = win.add("checkbox", undefined, "Pre-comp result");
        precompCheck.value = false;
        var parentCheck = win.add("checkbox", undefined, "Parent to source");
        parentCheck.value = false;

        addDivider(win);

        var bCreate = win.add("button", undefined, "Create Pattern");
        var bRegen = win.add("button", undefined, "Re-generate Last");

        // ============================================================
        // HANDLERS
        // ============================================================
        function readState() {
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
            if (!L) { alert("Выделите объект-направляющую (Shape Layer / Solid)."); return; }
            readState();
            app.beginUndoGroup("DotPattern: Create");
            try {
                generatePattern(L, state);
                lastOpts = cloneOpts(state);
                lastTargetIndex = L.index;
            } catch(e) {
                alert("Generate error: " + e.toString());
            }
            app.endUndoGroup();
        };

        bRegen.onClick = function() {
            if (!lastOpts) { alert("Нет сохранённых настроек. Сначала создай паттерн."); return; }
            var comp = getComp(); if (!comp) return;
            var target = null;
            try { target = comp.layer(lastTargetIndex); } catch(e){}
            if (!target) {
                var sel = getSelLayer();
                if (!sel) { alert("Источник недоступен. Выдели слой-направляющую."); return; }
                target = sel;
            }
            app.beginUndoGroup("DotPattern: Re-generate");
            try { generatePattern(target, lastOpts); }
            catch(e) { alert("Re-gen error: " + e.toString()); }
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
        w.preferredSize = [600, 640];
        w.margins = 12;
        var txt = w.add("edittext", undefined, getHelpText(), {multiline:true, scrolling:true, readonly:true});
        txt.preferredSize = [580, 560];
        var btn = w.add("button", undefined, "Закрыть");
        btn.onClick = function(){ w.close(); };
        w.center(); w.show();
    }

    function getHelpText() {
        return [
            "ptp_DotPattern v1.0.1 — генератор точечных паттернов",
            "═══════════════════════════════════════════════════════",
            "",
            "ИДЕЯ",
            "Создаёт паттерн из точек вокруг выделенной фигуры.",
            "Архитектура: единая сетка из колец точек (Micro Grid)",
            "+ выделенные акцентные точки на 1-3 кольцах внутри сетки",
            "(Accent Dots). Acent заменяют micro в своей позиции.",
            "",
            "═══ MICRO GRID ═══",
            "Концентрические кольца точек от Padding (отступ от объекта)",
            "до Padding+Spread (внешний край).",
            "  Size    — диаметр точки (1–8 px)",
            "  Color   — цвет; Use obj color — цвет Fill объекта",
            "  Spacing — шаг между кольцами и между точками внутри",
            "  Padding — отступ внутреннего кольца от объекта",
            "  Spread  — насколько далеко наружу простирается сетка",
            "  Density — % точек от полной решётки (рандомные пропуски)",
            "  Falloff — затухание opacity от центра наружу:",
            "    linear / ease / step (три уровня)",
            "  No fade — отключить затухание, все точки 100% opacity",
            "",
            "═══ ACCENT DOTS ═══",
            "Крупные контрастные точки, замещающие micro на выбранных",
            "кольцах. Не зависят от Falloff (всегда 100% opacity).",
            "  Size    — диаметр (2–20 px), обычно в 2-3x больше micro",
            "  Color   — цвет; Use obj color — цвет Fill объекта",
            "  Every N-th — каждая N-я точка ряда становится accent",
            "               (2 = частые, 20 = редкие маркеры)",
            "  Rings:",
            "    Inner  — на самом внутреннем кольце (у объекта)",
            "    Middle — посередине сетки",
            "    Outer  — на внешней границе",
            "    Можно включить любую комбинацию",
            "",
            "═══ OUTPUT ═══",
            "  Pre-comp result — упаковать в pre-comp (рекомендуется",
            "                    для последующей анимации)",
            "  Parent to source — линковать к источнику (двигаются вместе)",
            "",
            "═══ КНОПКИ ═══",
            "  Create Pattern    — сгенерировать",
            "  Re-generate Last  — пересоздать с теми же настройками",
            "                      (даёт новый random pattern)",
            "",
            "═══ WORKFLOW ═══",
            "1. Создай фигуру-направляющую (круг/прямоугольник)",
            "2. Выдели её",
            "3. Настрой параметры. По умолчанию: micro по всей зоне,",
            "   accent на Middle кольце",
            "4. Жми Create Pattern",
            "5. Появятся слои DotPattern_Micro + DotPattern_Accent",
            "6. Источник можно скрыть/удалить — паттерн самостоятельный",
            "",
            "═══ FIX v1.0.1 vs v1.0 ═══",
            "• Anchor Point теперь в центре паттерна (а не в углу комп)",
            "• Accent — выделенные точки ВНУТРИ единой сетки",
            "  (не отдельный ряд с зазором)",
            "• Use object color теперь и для micro (для blend mode)",
            "• Чекбоксы Inner/Middle/Outer для гибких комбинаций",
            "• Every N-th — слайдер плотности accent в ряду",
            "• No fade — равномерная opacity без затухания",
            "",
            "═══ ОГРАНИЧЕНИЯ ═══",
            "• Максимум 2000 точек",
            "• Auto-detect формы — только для одиночных rect/ellipse",
            "• Если объект имеет скругление, сетка идёт по острым",
            "  углам (упрощение v1.0.1, исправим в v1.1)",
            "",
            "═══ ПЛАН ═══",
            "v1.1 — Along Path mode (произвольные кривые, Bezier)",
            "v1.2 — Element types: Cross / Line / Square / Triangle",
            "       (общий шаблон для D37/D38/D39 рефов)",
            "v1.3 — Fill mode (паттерн заполняет весь экран)",
            "v1.4 — Animate Drift (отдельный аниматор)"
        ].join("\n");
    }

    buildUI(thisObj);

})(this);









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
                    var hasFill = false;
                    for (var k=1; k<=inner.numProperties; k++) {
                        if (inner.property(k).matchName === "ADBE Vector Graphic - Fill") {
                            try { info.color = inner.property(k).property("Color").value; } catch(e){}
                            hasFill = true;
                            break;
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
                info.w = rect.width;
                info.h = rect.height;
                info.kind = "rect";
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
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n\n" +
            "MODE:\n" +
            "  Auto-detect — определяется автоматически по выделенному слою.\n" +
            "  Around Shape — кольца точек вокруг фигуры (rect/ellipse).\n" +
            "  Along Path — точки вдоль маски или Shape Path.\n\n" +
            "COVERAGE (только Along Path):\n" +
            "  ▲ Top side — точки с положительной стороны нормали.\n" +
            "  ▼ Down side — точки с отрицательной стороны нормали.\n" +
            "  В Around Shape серые и не работают.\n\n" +
            "ACCENT RINGS: Inner (у границы) / Middle / Outer.\n" +
            "Every N-th: какая часть точек кольца становится акцентом.\n\n" +
            "Лимит: " + MAX_DOTS + " точек с подтверждением.";
    }

    buildUI(thisObj);

})(this);

