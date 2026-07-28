// ============================================================
// ptp_OpacityWave.jsx v1.0.1
// Radar-like concentric rings expanding from a source layer's anchor,
// with optional transparency mask that "erases" the source under the wave.
//
// v1.0.1 changelog:
//   • Fix: matchName для Stroke/Fill (работает на русской локали AE)
//   • Fix: matchName для Glow (индексы вместо display-имён)
//   • Fix: при "Parent rings to source" кольца ставятся в [0,0]
//          — убрано двойное смещение
//   • Fix: Erase mask + Loop → loopOut('pingpong') вместо 'cycle'
//          (нет резкого скачка обратно)
//   • UI переведён на русский (help уже был)
//   • Feature: кнопка "Cleanup" — удаляет все OW_<source>_Ring_*
//              и снимает маску OW_Erase
//   • Removed: "Gradient" из Ring style dropdown (была заглушка = Fill)
// v1.0.2 changelog:
//   • Fix: правильная привязка к parent (Position = anchor point родителя,
//          а не [0,0]) — теперь кольца снова центрируются на объекте
//   • Fix: Cleanup корректно находит source, даже если выделено кольцо
//          (парсит имя OW_<source>_Ring_N) и работает для нескольких
//          выделенных слоёв одновременно
//   • Fix: Erase mask строится по anchor point источника, а не по
//          center=[width/2, height/2] — теперь маска на месте
//   • Fix: убран loopOut на Mask Shape (давал expression error);
//          маска рисуется одним разгоном от 0.01 до maxRadius
//          синхронно с последним кольцом

// ============================================================

(function (thisObj) {
    var SCRIPT_NAME = "ptp_OpacityWave";
    var SCRIPT_VERSION = "v1.0.2";
    var LAYER_PREFIX = "OW_";
    var ERASE_MASK_NAME = "OW_Erase";

    var COL_ACCENT = [1.00, 0.55, 0.10];

    // ============================================================
    // GENERIC HELPERS
    // ============================================================
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Откройте композицию."); return null; }
        return c;
    }
    function getSelLayer() {
        var c = getComp(); if (!c) return null;
        var sel = c.selectedLayers;
        if (!sel || sel.length === 0) { alert("Выделите слой-источник для волны."); return null; }
        return sel[0];
    }
    function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

    function rgbToHex(rgb) {
        function h(v){ v = Math.round(clamp(v,0,1)*255); return (v<16?"0":"") + v.toString(16).toUpperCase(); }
        return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
    }
    function hexToRgb(hex) {
        hex = String(hex).replace(/^#/, "").replace(/\s/g,"");
        if (hex.length === 3) hex = hex.charAt(0)+hex.charAt(0)+hex.charAt(1)+hex.charAt(1)+hex.charAt(2)+hex.charAt(2);
        if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
        return [parseInt(hex.substr(0,2),16)/255, parseInt(hex.substr(2,2),16)/255, parseInt(hex.substr(4,2),16)/255];
    }

    function setEaseOut(prop) {
        for (var i = 1; i <= prop.numKeys; i++) {
            try { prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch(e){}
            var dim = 1;
            try {
                var v = prop.keyValue(i);
                if (v instanceof Array) dim = v.length;
            } catch(e){}
            var ein = [], eout = [];
            for (var d = 0; d < dim; d++) {
                ein.push(new KeyframeEase(0, 75));
                eout.push(new KeyframeEase(0, 15));
            }
            try {
                if (dim === 1) prop.setTemporalEaseAtKey(i, [ein[0]], [eout[0]]);
                else           prop.setTemporalEaseAtKey(i, ein, eout);
            } catch(e){}
        }
    }
    function setLinear(prop) {
        for (var i = 1; i <= prop.numKeys; i++) {
            try { prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); } catch(e){}
        }
    }

    function setLoopExpression(prop, mode) {
        try {
            prop.expression = 'loopOut("' + (mode || "cycle") + '")';
            prop.expressionEnabled = true;
        } catch(e) {}
    }

    // ============================================================
    // SOURCE INFO
    // ============================================================
    function getSourceCenter(srcLayer) {
        try {
            var pos = srcLayer.property("Transform").property("Position").value;
            return [pos[0], pos[1]];
        } catch(e) {
            var c = getComp();
            return c ? [c.width/2, c.height/2] : [0, 0];
        }
    }

    // ============================================================
    // RING BUILDER
    // ============================================================
    function buildRing(comp, srcLayer, opts, ringIdx, totalRings) {
        var step = "init";
        try {
            step = "addShape";
            var ring = comp.layers.addShape();

            step = "setName";
            ring.name = LAYER_PREFIX + srcLayer.name + "_Ring_" + (ringIdx + 1);

            step = "getContents";
            var contents = ring.property("ADBE Root Vectors Group");

            step = "addGroup";
            var grp = contents.addProperty("ADBE Vector Group");
            grp.name = "Ring";

            step = "getInner";
            var inner = grp.property("ADBE Vectors Group");

            step = "addEllipse";
            var ell = inner.addProperty("ADBE Vector Shape - Ellipse");

            step = "addStyle:" + opts.ringStyle;
            if (opts.ringStyle === "stroke") {
                var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
                try { stroke.property("ADBE Vector Stroke Color").setValue(opts.ringColor); } catch(e){}
                try { stroke.property("ADBE Vector Stroke Width").setValue(opts.strokeWidth); } catch(e){}
            } else {
                var fill = inner.addProperty("ADBE Vector Graphic - Fill");
                try { fill.property("ADBE Vector Fill Color").setValue(opts.ringColor); } catch(e){}
            }

            step = "getEllipseSize";
            var ellipseSize = null;
            for (var i = 1; i <= inner.numProperties; i++) {
                var pp = inner.property(i);
                if (pp && pp.matchName === "ADBE Vector Shape - Ellipse") {
                    ellipseSize = pp.property("ADBE Vector Ellipse Size");
                    break;
                }
            }
            if (!ellipseSize) throw new Error("Ellipse Size property not found");

            step = "position";
var posProp = ring.property("Transform").property("Position");
if (opts.parentToSource) {
    step = "parent";
    try { ring.parent = srcLayer; } catch(e){}
    // Position parented-слоя = anchor родителя (тогда кольцо совпадает с anchor)
    var anc = [0, 0];
    try { anc = srcLayer.property("Transform").property("Anchor Point").value; } catch(e){}
    posProp.setValue([anc[0], anc[1]]);
} else {
    var sc = getSourceCenter(srcLayer);
    posProp.setValue([sc[0], sc[1]]);
}


            step = "timing";
            var stagger = opts.waveDuration / opts.ringCount;
            var t0 = comp.time + ringIdx * stagger;
            var t1 = t0 + opts.waveDuration;
            var maxD = opts.maxRadius * 2;

            step = "sizeKeys";
            ellipseSize.setValueAtTime(t0, [0, 0]);
            ellipseSize.setValueAtTime(t1, [maxD, maxD]);
            setLinear(ellipseSize);

            step = "opacityKeys";
            var opProp = ring.property("Transform").property("Opacity");
            opProp.setValueAtTime(t0, 100);
            opProp.setValueAtTime(t1, 0);
            if (opts.easing === "easeout") setEaseOut(opProp);
            else setLinear(opProp);

            step = "loop";
            if (opts.loop) {
                setLoopExpression(ellipseSize, "cycle");
                setLoopExpression(opProp, "cycle");
            }

    

            step = "glow";
            if (opts.glowEnable) {
                var glow = ring.property("ADBE Effect Parade").addProperty("ADBE Glo2");
                if (!glow) glow = ring.property("ADBE Effect Parade").addProperty("ADBE Glow");
                if (glow) {
                    // Устанавливаем параметры по индексам (стабильно на всех локалях)
                    // Glow (ADBE Glo2): 1=Based On, 2=Threshold, 3=Radius, 4=Intensity, ...
                    try { glow.property(2).setValue(50); } catch(e){}                     // Threshold
                    try { glow.property(3).setValue(opts.glowRadius); } catch(e){}        // Radius
                    try { glow.property(4).setValue(opts.glowIntensity); } catch(e){}     // Intensity
                }
            }

            step = "moveOrder";
            try {
                if (opts.parentToSource) ring.moveAfter(srcLayer);
                else ring.moveBefore(srcLayer);
            } catch(e){}

            return ring;
        } catch(err) {
            throw new Error("buildRing step=" + step + " | " + err.toString());
        }
    }

    // ============================================================
    // ERASE MASK
    // ============================================================
    function addEraseMask(srcLayer, opts) {
    var comp = getComp(); if (!comp) return null;
    var maskGroup;
    try { maskGroup = srcLayer.property("ADBE Mask Parade"); } catch(e){ return null; }
    if (!maskGroup) throw new Error("Слой не поддерживает маски (Camera/Light/Audio).");

    // Удаляем старую маску OW_Erase
    for (var m = maskGroup.numProperties; m >= 1; m--) {
        var mp = maskGroup.property(m);
        if (mp && mp.name === ERASE_MASK_NAME) mp.remove();
    }

    var mask = maskGroup.addProperty("ADBE Mask Atom");
    mask.name = ERASE_MASK_NAME;
    try { mask.maskMode = MaskMode.SUBTRACT; } catch(e){}

    // Центр маски = anchor point источника (в его локальной системе координат)
    var anc = [0, 0];
    try { anc = srcLayer.property("Transform").property("Anchor Point").value; } catch(e){}

    var maskShape = mask.property("ADBE Mask Shape");
    var t0 = comp.time;
    var dur = opts.waveDuration;

    function makeCircle(radius) {
        var s = new Shape();
        var k = 0.5522847498 * radius;
        s.vertices = [
            [anc[0],          anc[1] - radius],
            [anc[0] + radius, anc[1]],
            [anc[0],          anc[1] + radius],
            [anc[0] - radius, anc[1]]
        ];
        s.inTangents  = [[-k, 0], [0, -k], [ k, 0], [0,  k]];
        s.outTangents = [[ k, 0], [0,  k], [-k, 0], [0, -k]];
        s.closed = true;
        return s;
    }

    // Стирание синхронизировано с ПОСЛЕДНИМ кольцом
    var staggerLast = (opts.ringCount > 0) ? (dur / opts.ringCount) * (opts.ringCount - 1) : 0;
    var startT = t0 + staggerLast;
    var endT   = startT + dur;

    try {
        maskShape.setValueAtTime(startT, makeCircle(0.01));
        maskShape.setValueAtTime(endT,   makeCircle(opts.maxRadius));
    } catch(e) {
        throw new Error("Erase mask keyframe error: " + e.toString());
    }

    try {
        var feather = mask.property("ADBE Mask Feather");
        feather.setValue([20, 20]);
    } catch(e){}

    // loopOut на Mask Shape через выражение работает нестабильно и часто выдаёт
    // "expressions was not enabled as a result of any error". Оставляем без loop.
    // Для повторяющейся волны используй ключи вручную или Undo→другие параметры.

    return mask;
}


    // ============================================================
    // CLEANUP
    // ============================================================
    function cleanup() {
    var comp = getComp(); if (!comp) return;
    var sel = comp.selectedLayers;
    if (!sel || sel.length === 0) {
        alert("Выделите слой-источник (или любое из его колец OW_*_Ring_*).");
        return;
    }

    // Собираем множество имён "source", которые надо чистить
    var sourceNames = {};
    for (var i = 0; i < sel.length; i++) {
        var nm = sel[i].name;
        if (nm.indexOf(LAYER_PREFIX) === 0) {
            // Это кольцо: OW_<sourceName>_Ring_N → извлекаем sourceName
            var body = nm.substring(LAYER_PREFIX.length);
            var idx = body.lastIndexOf("_Ring_");
            if (idx > 0) sourceNames[body.substring(0, idx)] = true;
            else         sourceNames[body] = true;
        } else {
            sourceNames[nm] = true;
        }
    }

    app.beginUndoGroup(SCRIPT_NAME + ": Cleanup");
    var removedRings = 0;
    var removedMasks = 0;
    try {
        // Удаляем кольца
        for (var k = comp.numLayers; k >= 1; k--) {
            var L = comp.layer(k);
            if (!L) continue;
            for (var srcName in sourceNames) {
                var prefix = LAYER_PREFIX + srcName + "_Ring_";
                if (L.name.indexOf(prefix) === 0) {
                    L.remove();
                    removedRings++;
                    break;
                }
            }
        }
        // Снимаем маски OW_Erase со слоёв-источников
        for (var srcName2 in sourceNames) {
            for (var j = 1; j <= comp.numLayers; j++) {
                var Lj = comp.layer(j);
                if (Lj && Lj.name === srcName2) {
                    try {
                        var mg = Lj.property("ADBE Mask Parade");
                        if (mg) {
                            for (var mm = mg.numProperties; mm >= 1; mm--) {
                                var mp2 = mg.property(mm);
                                if (mp2 && mp2.name === ERASE_MASK_NAME) {
                                    mp2.remove();
                                    removedMasks++;
                                }
                            }
                        }
                    } catch(e){}
                    break;
                }
            }
        }
    } catch(err) {
        alert("Cleanup error: " + err.toString());
    }
    app.endUndoGroup();

    alert("Удалено колец: " + removedRings + "\nСнято масок OW_Erase: " + removedMasks);
}


    // ============================================================
    // MAIN GENERATOR
    // ============================================================
    function generate(opts) {
        var comp = getComp(); if (!comp) return;
        var srcLayer = getSelLayer(); if (!srcLayer) return;

        if (opts.ringCount < 1) { alert("Кол-во колец должно быть ≥ 1."); return; }

        var createdRings = [];
        for (var i = 0; i < opts.ringCount; i++) {
            try {
                var r = buildRing(comp, srcLayer, opts, i, opts.ringCount);
                createdRings.push(r);
            } catch(err) {
                alert("Кольцо " + (i+1) + " не создано: " + err.toString());
                break;
            }
        }

        if (opts.eraseUnderWave) {
            try { addEraseMask(srcLayer, opts); }
            catch(err) { alert("Ошибка маски Erase: " + err.toString()); }
        }

        return createdRings;
    }

    // ============================================================
    // UI HELPERS
    // ============================================================
    function divider(parent) {
        var d = parent.add("panel");
        d.alignment = ["fill","top"];
        d.preferredSize.height = 2;
    }
    function addSlider(parent, label, mn, mx, val, step, onChange) {
        var row = parent.add("group");
        row.orientation = "row";
        row.alignment = ["fill","top"];
        row.minimumSize.width = 300;
        var lbl = row.add("statictext", undefined, label + ":");
        lbl.preferredSize.width = 130;
        lbl.minimumSize.width = 130;
        var sld = row.add("slider", undefined, val, mn, mx);
        sld.preferredSize.width = 110;
        sld.minimumSize.width = 90;
        var box = row.add("edittext", undefined, (step >= 1) ? String(val) : Number(val).toFixed(2));
        box.preferredSize.width = 50;
        box.minimumSize.width = 50;
        sld.onChanging = function(){
            var v = (step >= 1) ? Math.round(sld.value) : Math.round(sld.value/step)*step;
            box.text = (step >= 1) ? String(v) : v.toFixed(2);
            if (onChange) onChange(v);
        };
        box.onChange = function(){
            var v = parseFloat(box.text);
            if (isNaN(v)) return;
            v = clamp(v, mn, mx);
            sld.value = v;
            box.text = (step >= 1) ? String(Math.round(v)) : v.toFixed(2);
            if (onChange) onChange(v);
        };
        return { slider: sld, box: box };
    }
    function makeColorSwatch(parent, label, initialColor, onChange) {
        var row = parent.add("group");
        row.orientation = "row";
        row.minimumSize.width = 300;
        var lbl = row.add("statictext", undefined, label + ":");
        lbl.preferredSize.width = 130;
        lbl.minimumSize.width = 130;
        var sw = row.add("button", undefined, "");
        sw.preferredSize = [30, 22];
        sw._color = initialColor.slice();
        sw.fillBrush = sw.graphics.newBrush(sw.graphics.BrushType.SOLID_COLOR, sw._color);
        sw.onDraw = function(){
            sw.graphics.rectPath(0, 0, sw.size.width, sw.size.height);
            sw.graphics.fillPath(sw.fillBrush);
        };
        var hex = row.add("edittext", undefined, rgbToHex(initialColor));
        hex.preferredSize.width = 70;
        hex.minimumSize.width = 70;
        function update(rgb) {
            sw._color = rgb.slice();
            sw.fillBrush = sw.graphics.newBrush(sw.graphics.BrushType.SOLID_COLOR, sw._color);
            sw.notify("onDraw");
            hex.text = rgbToHex(sw._color);
            if (onChange) onChange(sw._color);
        }
        sw.onClick = function(){
            var c = $.colorPicker(); if (c < 0) return;
            update([((c>>16)&0xFF)/255, ((c>>8)&0xFF)/255, (c&0xFF)/255]);
        };
        hex.onChange = function(){
            var rgb = hexToRgb(hex.text);
            if (rgb) update(rgb); else hex.text = rgbToHex(sw._color);
        };
    }

    // ============================================================
    // MAIN UI
    // ============================================================
    function buildUI(thisObj) {
        var w = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, {resizeable:true});
        w.orientation = "column";
        w.alignChildren = ["fill","top"];
        w.spacing = 6;
        w.margins = 10;
        w.preferredSize.width = 360;
        w.minimumSize.width = 340;

        var title = w.add("statictext", undefined, SCRIPT_NAME + "  " + SCRIPT_VERSION);
        title.graphics.foregroundColor = title.graphics.newPen(title.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);

        var state = {
            maxRadius:       300,
            ringCount:       4,
            waveDuration:    2.0,
            ringStyle:       "stroke",
            strokeWidth:     3,
            ringColor:       [0.0, 1.0, 0.53],   // #00FF88
            opacity:         100,
            easing:          "easeout",
            loop:            true,
            parentToSource:  true,
            eraseUnderWave:  false,
            glowEnable:      false,
            glowIntensity:   2.0,
            glowRadius:      40
        };

        // ---- Geometry ----
        var gGeom = w.add("panel", undefined, "Геометрия");
        gGeom.orientation = "column"; gGeom.alignChildren = ["fill","top"]; gGeom.margins = 8; gGeom.spacing = 4;
        addSlider(gGeom, "Макс. радиус",  10, 2000, state.maxRadius,    1,  function(v){ state.maxRadius = v; });
        addSlider(gGeom, "Кол-во колец",  1,  12,   state.ringCount,    1,  function(v){ state.ringCount = v; });
        addSlider(gGeom, "Длит. волны",   0.2,10,   state.waveDuration, 0.1,function(v){ state.waveDuration = v; });

        // ---- Style ----
        var gStyle = w.add("panel", undefined, "Стиль");
        gStyle.orientation = "column"; gStyle.alignChildren = ["fill","top"]; gStyle.margins = 8; gStyle.spacing = 4;

        var styleRow = gStyle.add("group");
        styleRow.orientation = "row";
        styleRow.add("statictext", undefined, "Тип кольца:").preferredSize.width = 130;
        var styleDD = styleRow.add("dropdownlist", undefined, ["Stroke (контур)","Fill (заливка)"]);
        styleDD.selection = 0;
        styleDD.onChange = function(){
            state.ringStyle = (styleDD.selection.index === 0) ? "stroke" : "fill";
        };

        addSlider(gStyle, "Толщина", 0.5, 20, state.strokeWidth, 0.5, function(v){ state.strokeWidth = v; });
        makeColorSwatch(gStyle, "Цвет", state.ringColor, function(rgb){ state.ringColor = rgb; });

        var easeRow = gStyle.add("group");
        easeRow.orientation = "row";
        easeRow.add("statictext", undefined, "Затухание:").preferredSize.width = 130;
        var easeDD = easeRow.add("dropdownlist", undefined, ["Ease Out","Линейное"]);
        easeDD.selection = 0;
        easeDD.onChange = function(){
            state.easing = (easeDD.selection.index === 0) ? "easeout" : "linear";
        };

        // ---- Behavior ----
        var gBeh = w.add("panel", undefined, "Поведение");
        gBeh.orientation = "column"; gBeh.alignChildren = ["fill","top"]; gBeh.margins = 8; gBeh.spacing = 4;

        var cbLoop = gBeh.add("checkbox", undefined, "Цикл (loopOut)");
        cbLoop.value = state.loop;
        cbLoop.onClick = function(){ state.loop = cbLoop.value; };

        var cbParent = gBeh.add("checkbox", undefined, "Parent колец к источнику");
        cbParent.value = state.parentToSource;
        cbParent.onClick = function(){ state.parentToSource = cbParent.value; };

        var cbErase = gBeh.add("checkbox", undefined, "Стирать под волной (маска)");
        cbErase.value = state.eraseUnderWave;
        cbErase.onClick = function(){ state.eraseUnderWave = cbErase.value; };

        // ---- Glow ----
        var gGlow = w.add("panel", undefined, "Glow");
        gGlow.orientation = "column"; gGlow.alignChildren = ["fill","top"]; gGlow.margins = 8; gGlow.spacing = 4;

        var cbGlow = gGlow.add("checkbox", undefined, "Включить Glow");
        cbGlow.value = state.glowEnable;
        cbGlow.onClick = function(){ state.glowEnable = cbGlow.value; };

        addSlider(gGlow, "Интенсивность", 0.1, 10, state.glowIntensity, 0.1, function(v){ state.glowIntensity = v; });
        addSlider(gGlow, "Радиус",         1,  200, state.glowRadius,    1,   function(v){ state.glowRadius = v; });

        // ---- Buttons ----
        divider(w);
        var btnRow = w.add("group");
        btnRow.orientation = "row";
        btnRow.alignment = ["fill","top"];

        var btnGo = btnRow.add("button", undefined, "Создать волну");
        btnGo.preferredSize.height = 28;
        btnGo.alignment = ["fill","center"];

        var btnClean = btnRow.add("button", undefined, "Cleanup");
        btnClean.preferredSize.width = 70;
        btnClean.helpTip = "Удалить все OW_*_Ring_* для выделенного слоя и снять маску OW_Erase";

        var btnHelp = btnRow.add("button", undefined, "?");
        btnHelp.preferredSize.width = 28;

        btnGo.onClick = function(){
            app.beginUndoGroup(SCRIPT_NAME + ": Create Wave");
            try { generate(state); }
            catch(err) { alert("Ошибка: " + err.toString()); }
            app.endUndoGroup();
        };
        btnClean.onClick = function(){ cleanup(); };
        btnHelp.onClick = function(){ alert(getHelpText()); };

        if (w instanceof Window) {
            w.center();
            w.show();
        } else {
            w.layout.layout(true);
            w.layout.resize();
            w.onResizing = w.onResize = function(){ this.layout.resize(); };
        }
        return w;
    }

    function getHelpText() {
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n" +
            "Радиальные кольца, расходящиеся от выбранного слоя (sonar/radar effect).\n\n" +
            "БЫСТРЫЙ СТАРТ:\n" +
            "1. Выдели слой, который будет центром волны.\n" +
            "2. Поставь CTI на время старта.\n" +
            "3. Настрой параметры и нажми «Создать волну».\n\n" +
            "GEOMETRY:\n" +
            "• Макс. радиус — до какого радиуса дорастает кольцо (px).\n" +
            "• Кол-во колец — сколько колец работает одновременно\n" +
            "  (сдвиг по времени = длит. волны / кол-во колец).\n" +
            "• Длит. волны — время роста одного кольца от 0 до макс. радиуса.\n\n" +
            "STYLE:\n" +
            "• Тип кольца:\n" +
            "   - Stroke: только контур (классический радар).\n" +
            "   - Fill: сплошная заливка.\n" +
            "• Толщина — толщина контура (только для Stroke).\n" +
            "• Цвет — цвет колец.\n" +
            "• Затухание — Линейное или Ease Out.\n\n" +
            "BEHAVIOR:\n" +
            "• Цикл — добавляет loopOut('cycle') на размер и прозрачность.\n" +
            "• Parent к источнику — кольца становятся child-слоями\n" +
            "  источника и двигаются вместе с ним.\n" +
            "• Стирать под волной — добавляет маску Subtract на слой;\n" +
            "  внутри максимального радиуса слой становится прозрачным.\n" +
            "  При включённом Цикле маска использует loopOut('pingpong') —\n" +
            "  плавно возвращается назад.\n" +
            "  Не работает на Camera/Light/Audio.\n\n" +
            "GLOW:\n" +
            "• Включить Glow — добавляет эффект AE Glow на каждое кольцо.\n" +
            "• Интенсивность, Радиус.\n" +
            "• На тёмном фоне эффект заметнее.\n\n" +
            "CLEANUP:\n" +
            "• Кнопка Cleanup — удаляет все кольца OW_<имя>_Ring_*\n" +
            "  для выделенного слоя и снимает маску OW_Erase.\n" +
            "  Полезно, если ты уже сохранил проект и Undo не поможет.\n\n" +
            "СОЗДАВАЕМЫЕ СЛОИ:\n" +
            "• " + LAYER_PREFIX + "<source>_Ring_1..N — shape-слои колец.\n" +
            "• Маска 'OW_Erase' внутри исходного слоя (если Erase включён).\n\n" +
            "УГАСАНИЕ:\n" +
            "• В v1.0.1 нет встроенного Outro. Для затухания волны в\n" +
            "  нужный момент — ставь ключи Opacity на кольцах вручную\n" +
            "  или используй ptp_AnimPresets (fade-out preset).\n\n" +
            "СОВЕТЫ:\n" +
            "• Sonar: Stroke, цвет #00FF88, Glow on, Loop on.\n" +
            "• Огненная волна: Fill, цвет #FF6600, Glow интенсивность 5+,\n" +
            "  радиус 80+.\n" +
            "• Если кольца не видны — проверь, что CTI стоит до startT\n" +
            "  первого кольца.";
    }

    buildUI(thisObj);

})(this);
