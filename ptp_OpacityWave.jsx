// ============================================================
// ptp_OpacityWave.jsx
// Radar-like concentric rings expanding from a source layer's anchor,
// with optional transparency mask that "erases" the source under the wave.
// var SCRIPT_VERSION = "v1.0";
// ============================================================

(function (thisObj) {
    var SCRIPT_NAME = "ptp_OpacityWave";
    var SCRIPT_VERSION = "v1.0";
    var LAYER_PREFIX = "OW_";

    var COL_ACCENT = [1.00, 0.55, 0.10];

    // ============================================================
    // GENERIC HELPERS
    // ============================================================
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Open a composition first."); return null; }
        return c;
    }
    function getSelLayer() {
        var c = getComp(); if (!c) return null;
        var sel = c.selectedLayers;
        if (!sel || sel.length === 0) { alert("Select a layer to attach the wave to."); return null; }
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
    // Get anchor of source layer in composition space (taking Position into account).
    function getSourceCenter(srcLayer) {
    try {
        // Use transform.toWorld(anchorPoint) approximation via expression-free math:
        // For simple case (no source parent) — Position == comp-space center.
        // If source has parent — we still take Position; user can adjust.
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
    try { stroke.property("Color").setValue(opts.ringColor); } catch(e){}
    try { stroke.property("Stroke Width").setValue(opts.strokeWidth); } catch(e){}
} else {
    var fill = inner.addProperty("ADBE Vector Graphic - Fill");
    try { fill.property("Color").setValue(opts.ringColor); } catch(e){}
}

step = "getEllipseSize";
// Re-acquire ellipse and its Size after style added (refs may be invalidated)
var ellipseRef = null;
for (var ei = 1; ei <= inner.numProperties; ei++) {
    var p = inner.property(ei);
    if (p && p.matchName === "ADBE Vector Shape - Ellipse") { ellipseRef = p; break; }
}
if (!ellipseRef) throw new Error("Ellipse property not found after style add");
var sizeProp = ellipseRef.property("ADBE Vector Ellipse Size");


        step = "timing";
        var t0 = comp.time;
        var dur = opts.waveDuration;
        var stagger = (totalRings > 0) ? (dur / totalRings) : 0;
        var startT = t0 + ringIdx * stagger;
        var endT   = startT + dur;
        var maxD = opts.maxRadius * 2;

        step = "sizeKeys";
        sizeProp.setValueAtTime(startT, [0, 0]);
        sizeProp.setValueAtTime(endT,   [maxD, maxD]);
        setLinear(sizeProp);

        step = "opacityKeys";
        var gt = grp.property("ADBE Vector Transform Group");
        var op = gt.property("ADBE Vector Group Opacity");
        op.setValueAtTime(startT, 100);
        op.setValueAtTime(endT,   0);
        if (opts.opacityEasing === "easeOut") setEaseOut(op); else setLinear(op);

        step = "position";
        var posProp = ring.property("Transform").property("Position");
        if (opts.parentToSource) {
            step = "parent";
            try { ring.parent = srcLayer; } catch(e){}
            var anc = [0, 0];
            try { anc = srcLayer.property("Transform").property("Anchor Point").value; } catch(e){}
            step = "posSetValueParented";
            posProp.setValue([anc[0], anc[1]]);
        } else {
            step = "posSetValueComp";
            var sc = getSourceCenter(srcLayer);
            posProp.setValue([sc[0], sc[1]]);
        }

       step = "glow";
if (opts.glow) {
    try {
        var glow = ring.Effects.addProperty("ADBE Glow");
        try { glow.property("Glow Threshold").setValue(20); } catch(e){}        // ниже порог = больше glow
        try { glow.property("Glow Radius").setValue(opts.glowRadius); } catch(e){}
        try { glow.property("Glow Intensity").setValue(opts.glowIntensity); } catch(e){}
        try { glow.property("Glow Operation").setValue(3); } catch(e){}         // Add
        try { glow.property("Glow Colors").setValue(1); } catch(e){}            // Original Colors
        try { glow.property("Composite Original").setValue(2); } catch(e){}     // On Top
    } catch(e){}
}


        step = "loop";
        if (opts.loop) {
            setLoopExpression(sizeProp, "cycle");
            setLoopExpression(op, "cycle");
        }

        step = "moveBefore";
        try { ring.moveBefore(srcLayer); } catch(e){}

        return ring;
    } catch(err) {
        throw new Error("step=" + step + " | " + err.toString());
    }
}



    // ============================================================
    // ERASE MASK ON SOURCE
    // ============================================================
        function addEraseMask(srcLayer, opts) {
        var comp = getComp(); if (!comp) return null;
        var maskGroup;
        try { maskGroup = srcLayer.property("ADBE Mask Parade"); } catch(e){ return null; }
        if (!maskGroup) return null;

        var mask;
        try { mask = maskGroup.addProperty("ADBE Mask Atom"); }
        catch(e) { alert("Cannot add mask to '" + srcLayer.name + "'. Layer type may not support masks (e.g. Camera/Light)."); return null; }

        try { mask.name = "OW_Erase"; } catch(e){}
        try { mask.maskMode = MaskMode.SUBTRACT; } catch(e){}

        // Anchor of source in source's local space
        var anc;
        try { anc = srcLayer.property("Transform").property("Anchor Point").value; }
        catch(e){ anc = [0,0]; }

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

        var staggerLast = (opts.ringCount > 0) ? (dur / opts.ringCount) * (opts.ringCount - 1) : 0;
        var startT = t0 + staggerLast;
        var endT   = startT + dur;

        try {
            maskShape.setValueAtTime(startT, makeCircle(0.01));
            maskShape.setValueAtTime(endT,   makeCircle(opts.maxRadius));
        } catch(e) {
            alert("Erase mask keyframe error: " + e.toString());
        }

        try {
            var feather = mask.property("ADBE Mask Feather");
            feather.setValue([20, 20]);
        } catch(e){}

        if (opts.loop) {
            setLoopExpression(maskShape, "cycle");
        }

        return mask;
    }


    // ============================================================
    // MAIN GENERATOR
    // ============================================================
       function generate(opts) {
        var comp = getComp(); if (!comp) return;
        var srcLayer = getSelLayer(); if (!srcLayer) return;

        if (opts.ringCount < 1) { alert("Ring count must be at least 1."); return; }

        var createdRings = [];
        for (var i = 0; i < opts.ringCount; i++) {
            try {
                var r = buildRing(comp, srcLayer, opts, i, opts.ringCount);
                createdRings.push(r);
           } catch(err) {
    alert("Ring " + (i+1) + " failed at: " + err.toString());
    break;
}

        }

        if (opts.eraseUnderWave) {
            try { addEraseMask(srcLayer, opts); }
            catch(err) { alert("Erase mask failed: " + err.toString()); }
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
            sw.graphics.rectPath(0,0,sw.size[0],sw.size[1]);
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
            opacityEasing:   "easeOut",
            loop:            true,
            parentToSource:  true,
            eraseUnderWave:  true,
            glow:            true,
            glowIntensity:   1.0,
            glowRadius:      15
        };

        // -------- Geometry --------
        var gPanel = w.add("panel", undefined, "Geometry");
        gPanel.orientation = "column";
        gPanel.alignChildren = ["fill","top"];
        gPanel.margins = 8;
        gPanel.minimumSize.width = 330;

        addSlider(gPanel, "Max radius (px)", 50, 2000, state.maxRadius, 1,
            function(v){ state.maxRadius = v; });
        addSlider(gPanel, "Ring count", 1, 10, state.ringCount, 1,
            function(v){ state.ringCount = v; });
        addSlider(gPanel, "Wave duration (s)", 0.3, 10.0, state.waveDuration, 0.05,
            function(v){ state.waveDuration = v; });

        // -------- Style --------
        var sPanel = w.add("panel", undefined, "Style");
        sPanel.orientation = "column";
        sPanel.alignChildren = ["fill","top"];
        sPanel.margins = 8;
        sPanel.minimumSize.width = 330;

        var rowStyle = sPanel.add("group");
        rowStyle.orientation = "row";
        rowStyle.minimumSize.width = 290;
        var styleLbl = rowStyle.add("statictext", undefined, "Ring style:");
        styleLbl.preferredSize.width = 130;
        styleLbl.minimumSize.width = 130;
        var styleDD = rowStyle.add("dropdownlist", undefined, ["Stroke", "Fill", "Gradient"]);
        styleDD.selection = styleDD.find("Stroke");
        styleDD.preferredSize.width = 130;
        styleDD.minimumSize.width = 100;
        styleDD.onChange = function(){
            state.ringStyle = styleDD.selection.text.toLowerCase();
        };

        addSlider(sPanel, "Stroke width (px)", 1, 20, state.strokeWidth, 1,
            function(v){ state.strokeWidth = v; });
        makeColorSwatch(sPanel, "Ring color", state.ringColor,
            function(c){ state.ringColor = c; });

        var rowEase = sPanel.add("group");
        rowEase.orientation = "row";
        rowEase.minimumSize.width = 290;
        var eLbl = rowEase.add("statictext", undefined, "Opacity easing:");
        eLbl.preferredSize.width = 130;
        eLbl.minimumSize.width = 130;
        var eDD = rowEase.add("dropdownlist", undefined, ["Linear", "Ease Out"]);
        eDD.selection = eDD.find("Ease Out");
        eDD.preferredSize.width = 130;
        eDD.minimumSize.width = 100;
        eDD.onChange = function(){
            state.opacityEasing = (eDD.selection.text === "Linear") ? "linear" : "easeOut";
        };

        // -------- Behavior --------
        var bPanel = w.add("panel", undefined, "Behavior");
        bPanel.orientation = "column";
        bPanel.alignChildren = ["fill","top"];
        bPanel.margins = 8;
        bPanel.minimumSize.width = 330;

        var cbLoop = bPanel.add("checkbox", undefined, "Loop (cycle)");
        cbLoop.value = state.loop;
        cbLoop.onClick = function(){ state.loop = cbLoop.value; };

        var cbParent = bPanel.add("checkbox", undefined, "Parent rings to source layer");
        cbParent.value = state.parentToSource;
        cbParent.onClick = function(){ state.parentToSource = cbParent.value; };

        var cbErase = bPanel.add("checkbox", undefined, "Erase under wave (mask source)");
        cbErase.value = state.eraseUnderWave;
        cbErase.onClick = function(){ state.eraseUnderWave = cbErase.value; };

        // -------- Glow --------
        var glPanel = w.add("panel", undefined, "Glow");
        glPanel.orientation = "column";
        glPanel.alignChildren = ["fill","top"];
        glPanel.margins = 8;
        glPanel.minimumSize.width = 330;

        var cbGlow = glPanel.add("checkbox", undefined, "Enable Glow");
        cbGlow.value = state.glow;
        cbGlow.onClick = function(){ state.glow = cbGlow.value; };

        addSlider(glPanel, "Glow intensity", 0.1, 5.0, state.glowIntensity, 0.1,
            function(v){ state.glowIntensity = v; });
        addSlider(glPanel, "Glow radius (px)", 1, 100, state.glowRadius, 1,
            function(v){ state.glowRadius = v; });

        divider(w);

        var btnRow = w.add("group");
        btnRow.orientation = "row";
        btnRow.minimumSize.width = 290;
        var btnGo = btnRow.add("button", undefined, "Create Wave");
        btnGo.preferredSize.height = 30;
        btnGo.preferredSize.width = 220;
        var btnHelp = btnRow.add("button", undefined, "?");
        btnHelp.preferredSize.width = 28;

        btnGo.onClick = function(){
            app.beginUndoGroup(SCRIPT_NAME + ": Create Wave");
            try { generate(state); }
            catch(err) { alert("Error: " + err.toString()); }
            app.endUndoGroup();
        };

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
        "3. Настрой параметры и нажми Create Wave.\n\n" +
        "GEOMETRY:\n" +
        "• Max radius — до какого радиуса дорастает кольцо (px).\n" +
        "• Ring count — сколько колец работает одновременно\n" +
        "  (сдвиг по времени = waveDuration / ringCount).\n" +
        "• Wave duration — время роста одного кольца от 0 до Max radius.\n\n" +
        "STYLE:\n" +
        "• Ring style:\n" +
        "   - Stroke: только контур (классический радар).\n" +
        "   - Fill: сплошная заливка.\n" +
        "   - Gradient: пока заглушка = Fill (v1.0.1 — настоящий радиальный градиент).\n" +
        "• Stroke width — толщина контура (только для Stroke).\n" +
        "• Ring color — цвет колец.\n" +
        "• Opacity easing — Linear или Ease Out (плавное затухание).\n\n" +
        "BEHAVIOR:\n" +
        "• Loop — добавляет loopOut('cycle') на размер и прозрачность.\n" +
        "• Parent rings to source — кольца становятся child-слоями источника\n" +
        "  и двигаются вместе с ним.\n" +
        "• Erase under wave — добавляет маску Subtract на исходный слой;\n" +
        "  внутри максимального радиуса слой становится прозрачным.\n" +
        "  Не работает на Camera/Light/Audio.\n\n" +
        "GLOW:\n" +
        "• Enable Glow — добавляет эффект AE Glow на каждое кольцо.\n" +
        "• Glow intensity, Glow radius.\n" +
        "• На тёмном фоне эффект заметнее.\n\n" +
        "СОЗДАВАЕМЫЕ СЛОИ:\n" +
        "• " + LAYER_PREFIX + "<source>_Ring_1..N — shape-слои колец.\n" +
        "• Маска 'OW_Erase' внутри исходного слоя (если Erase включён).\n\n" +
        "СОВЕТЫ:\n" +
        "• Sonar: Stroke, цвет #00FF88, Glow on, Loop on.\n" +
        "• Огненная волна: Fill, цвет #FF6600, Glow intensity 5+, Radius 80+.\n" +
        "• Если кольца не видны — проверь, что CTI стоит до startT первого кольца.\n" +
        "• Undo откатывает создание целиком (отдельной кнопки cleanup нет в v1.0).";
}


    buildUI(thisObj);

})(this);
