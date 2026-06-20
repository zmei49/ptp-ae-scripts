// ============================================================
// ptp_ShapeFX.jsx
// v1.0 — Shape effects + animations (D35 Ring Pulse combo)
// Author: ptp toolkit
// Install: Save into "Support Files/Scripts/ScriptUI Panels/"
// Run via: Window -> ptp_ShapeFX.jsx
// ============================================================

(function ptp_ShapeFX(thisObj) {

    // ---------- CONSTANTS ----------
    var SCRIPT_NAME = "ptp_ShapeFX";
    var SCRIPT_VERSION = "v1.0";

    var COL = {
        bg:        [0.16, 0.16, 0.17, 1],
        panel:     [0.20, 0.20, 0.22, 1],
        accent:    [1.00, 0.55, 0.00, 1],   // orange
        accentTxt: [1.00, 0.65, 0.10, 1],
        text:      [0.92, 0.92, 0.92, 1],
        textDim:   [0.65, 0.65, 0.65, 1],
        divider:   [0.30, 0.30, 0.32, 1],
        btnBg:     [0.26, 0.26, 0.28, 1]
    };

    // D35 preset colors
    var D35_ACCENT = [1.00, 0.53, 0.00];  // #FF8800
    var D35_WHITE  = [1.00, 1.00, 1.00];

    // ---------- HELPERS ----------
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) {
            alert("Откройте композицию.");
            return null;
        }
        return c;
    }

    function getSelLayer() {
        var c = getComp();
        if (!c) return null;
        var s = c.selectedLayers;
        if (s.length === 0) return null;
        return s[0];
    }

    function hexToRgb(hex) {
        hex = hex.replace("#","");
        return [
            parseInt(hex.substr(0,2),16)/255,
            parseInt(hex.substr(2,2),16)/255,
            parseInt(hex.substr(4,2),16)/255
        ];
    }

    function rgbToHex(rgb) {
        function p(n){ var h=Math.round(n*255).toString(16); return h.length<2?"0"+h:h; }
        return "#" + p(rgb[0]) + p(rgb[1]) + p(rgb[2]);
    }

    function safeSet(prop, val, t) {
        try {
            if (t === undefined) prop.setValue(val);
            else prop.setValueAtTime(t, val);
            return true;
        } catch(e) { return false; }
    }

    function setEase(prop, kIdx, inInfl, outInfl) {
        try {
            var ei = new KeyframeEase(0, (inInfl  != null ? inInfl  : 33));
            var eo = new KeyframeEase(0, (outInfl != null ? outInfl : 66));
            var dim = prop.propertyValueType === PropertyValueType.TwoD ||
                      prop.propertyValueType === PropertyValueType.TwoD_SPATIAL ? 2 :
                      prop.propertyValueType === PropertyValueType.ThreeD ||
                      prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL ? 3 : 1;
            var inArr = [], outArr = [];
            for (var i=0;i<dim;i++){ inArr.push(eo); outArr.push(ei); }
            // we want easeOut on outgoing and easeIn on incoming
            prop.setTemporalEaseAtKey(kIdx, inArr, outArr);
        } catch(e){}
    }

    function getShapeBounds(layer) {
        // returns {w, h, cx, cy} in layer coords, approximate
        try {
            var r = layer.sourceRectAtTime(layer.containingComp.time, false);
            return {
                w: r.width,
                h: r.height,
                cx: r.left + r.width/2,
                cy: r.top + r.height/2
            };
        } catch(e) { return {w:200,h:200,cx:0,cy:0}; }
    }

    function detectShapeType(layer) {
        // returns "rect" | "ellipse" | "diamond" | "unknown"
        if (!(layer instanceof ShapeLayer)) return "unknown";
        try {
            var contents = layer.property("ADBE Root Vectors Group");
            for (var i=1; i<=contents.numProperties; i++) {
                var grp = contents.property(i);
                if (!grp.property("ADBE Vectors Group")) continue;
                var inner = grp.property("ADBE Vectors Group");
                for (var j=1; j<=inner.numProperties; j++) {
                    var p = inner.property(j);
                    if (p.matchName === "ADBE Vector Shape - Rect") return "rect";
                    if (p.matchName === "ADBE Vector Shape - Ellipse") return "ellipse";
                    if (p.matchName === "ADBE Vector Shape - Star") return "polygon";
                }
            }
        } catch(e){}
        return "unknown";
    }

    // ============================================================
    // CORE: создание Ring (повторяет форму выделенного слоя)
    // ============================================================
    function createRing(targetLayer, opts) {
        var comp = targetLayer.containingComp;
        var b = getShapeBounds(targetLayer);
        var shapeType = detectShapeType(targetLayer);
        if (shapeType === "unknown") shapeType = "rect";

        var ring = comp.layers.addShape();
        ring.name = targetLayer.name + "_Ring";

        // позиция = позиция target
        var tpos = targetLayer.property("Transform").property("Position").value;
        ring.property("Transform").property("Position").setValue([tpos[0], tpos[1]]);
        ring.property("Transform").property("Anchor Point").setValue([0,0]);

        var contents = ring.property("ADBE Root Vectors Group");
        var grp = contents.addProperty("ADBE Vector Group");
        grp.name = "RingGroup";
        var inner = grp.property("ADBE Vectors Group");

        // shape path
        var pathProp;
        if (shapeType === "ellipse") {
            pathProp = inner.addProperty("ADBE Vector Shape - Ellipse");
            pathProp.property("Size").setValue([b.w, b.h]);
        } else if (shapeType === "diamond") {
            pathProp = inner.addProperty("ADBE Vector Shape - Rect");
            pathProp.property("Size").setValue([b.w*0.7, b.h*0.7]);
            // повернуть на 45 — через transform группы
        } else {
            pathProp = inner.addProperty("ADBE Vector Shape - Rect");
            pathProp.property("Size").setValue([b.w, b.h]);
            try { pathProp.property("Roundness").setValue(15); } catch(e){}
        }

        // stroke (только обводка, без заливки)
        var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("Color").setValue(opts.color);
        stroke.property("Stroke Width").setValue(opts.strokeStart);

        // diamond rotation
        if (shapeType === "diamond") {
            grp.property("Transform").property("Rotation").setValue(45);
        }

        // motion blur
        try { ring.motionBlur = true; } catch(e){}

        // анимация: Scale + Opacity + Stroke Width
        var t0 = comp.time;
        var dur = opts.duration;
        var cycle = dur + opts.pause;
        var repeats = Math.max(1, opts.repeats);

        var scaleProp = ring.property("Transform").property("Scale");
        var opacityProp = ring.property("Transform").property("Opacity");
        var widthProp = stroke.property("Stroke Width");

        for (var r=0; r<repeats; r++) {
            var ofs = t0 + r * cycle;
            scaleProp.setValueAtTime(ofs, [100,100]);
            scaleProp.setValueAtTime(ofs + dur, [opts.scaleMax, opts.scaleMax]);

            opacityProp.setValueAtTime(ofs, 100);
            opacityProp.setValueAtTime(ofs + dur*0.8, 0);
            opacityProp.setValueAtTime(ofs + dur, 0);

            widthProp.setValueAtTime(ofs, opts.strokeStart);
            widthProp.setValueAtTime(ofs + dur, opts.strokeEnd);
        }

        // ease out на scale и opacity
        try {
            for (var k=1; k<=scaleProp.numKeys; k++) setEase(scaleProp, k, 33, 80);
            for (var k=1; k<=opacityProp.numKeys; k++) setEase(opacityProp, k, 33, 80);
        } catch(e){}

        // loop через expression если loop forever
        if (opts.loopForever) {
            try { scaleProp.expression   = 'loopOut("cycle")'; } catch(e){}
            try { opacityProp.expression = 'loopOut("cycle")'; } catch(e){}
            try { widthProp.expression   = 'loopOut("cycle")'; } catch(e){}
        }

        // поставить ring ПОД целевой слой
        try { ring.moveAfter(targetLayer); } catch(e){}

        return ring;
    }

    // ============================================================
    // POP BOUNCE на выделенный слой
    // ============================================================
    function applyPopBounce(layer, opts) {
        var comp = layer.containingComp;
        var t0 = comp.time;
        var dur = opts.duration;
        var cycle = dur + opts.pause;
        var amp = opts.amplitude;
        var reps = Math.max(1, opts.repeats);

        var scale = layer.property("Transform").property("Scale");
        var base = scale.value;
        if (!base) base = [100,100];

        for (var r=0; r<reps; r++) {
            var ofs = t0 + r*cycle;
            scale.setValueAtTime(ofs, [base[0], base[1]]);
            scale.setValueAtTime(ofs + dur*0.3, [base[0]*amp/100, base[1]*amp/100]);
            scale.setValueAtTime(ofs + dur, [base[0], base[1]]);
        }

        // easeOutBack эмулируем сильным outgoing influence
        try {
            for (var k=1; k<=scale.numKeys; k++) setEase(scale, k, 20, 90);
        } catch(e){}

        if (opts.loopForever) {
            try { scale.expression = 'loopOut("cycle")'; } catch(e){}
        }
    }

    // ============================================================
    // FLASH BLOOM на выделенный слой
    // ============================================================
    function applyFlashBloom(layer, opts) {
        var comp = layer.containingComp;
        var t0 = comp.time;
        var dur = opts.duration;
        var cycle = dur + opts.pause;
        var reps = Math.max(1, opts.repeats);

        // добавляем эффект Glow
        var fx;
        try {
            fx = layer.property("ADBE Effect Parade").addProperty("ADBE Glo2");
        } catch(e) {
            try { fx = layer.property("ADBE Effect Parade").addProperty("ADBE Glow"); } catch(e2){
                alert("Не удалось добавить эффект Glow.");
                return;
            }
        }

        // настройка цвета
        try {
            var colorProp = fx.property("Glow Colors");
            if (colorProp) colorProp.setValue(2); // A & B colors
            var aColor = fx.property("Color A");
            if (aColor) aColor.setValue(opts.color);
            var bColor = fx.property("Color B");
            if (bColor) bColor.setValue(opts.color);
        } catch(e){}

        // анимация интенсивности
        var intensity;
        try { intensity = fx.property("Glow Intensity"); } catch(e){}
        if (!intensity) return;

        for (var r=0; r<reps; r++) {
            var ofs = t0 + r*cycle;
            intensity.setValueAtTime(ofs, 0);
            intensity.setValueAtTime(ofs + dur*0.15, opts.intensity);
            intensity.setValueAtTime(ofs + dur, 0);
        }

        try {
            for (var k=1; k<=intensity.numKeys; k++) setEase(intensity, k, 20, 80);
        } catch(e){}

        if (opts.loopForever) {
            try { intensity.expression = 'loopOut("cycle")'; } catch(e){}
        }
    }

    // ============================================================
    // DROP SHADOW
    // ============================================================
    function applyDropShadow(layer) {
        try {
            var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
            fx.property("Opacity").setValue(255*0.3);
            fx.property("Direction").setValue(90);
            fx.property("Distance").setValue(4);
            fx.property("Softness").setValue(20);
        } catch(e){ alert("Не удалось добавить Drop Shadow."); }
    }

    // ============================================================
    // СОЗДАНИЕ ФИГУРЫ С НУЛЯ (как D35 — rounded rect)
    // ============================================================
    function createBaseShape(comp, opts) {
        var layer = comp.layers.addShape();
        layer.name = "ShapeFX_Base";

        var contents = layer.property("ADBE Root Vectors Group");
        var grp = contents.addProperty("ADBE Vector Group");
        var inner = grp.property("ADBE Vectors Group");

        var path;
        if (opts.shape === "ellipse") {
            path = inner.addProperty("ADBE Vector Shape - Ellipse");
            path.property("Size").setValue([opts.size, opts.size]);
        } else if (opts.shape === "polygon") {
            path = inner.addProperty("ADBE Vector Shape - Star");
            try {
                path.property("Type").setValue(2);
                path.property("Points").setValue(6);
                path.property("Outer Radius").setValue(opts.size/2);
            } catch(e){}
        } else {
            path = inner.addProperty("ADBE Vector Shape - Rect");
            path.property("Size").setValue([opts.size, opts.size]);
            try { path.property("Roundness").setValue(opts.shape === "rounded" ? 20 : 0); } catch(e){}
        }

        // fill
        var fill = inner.addProperty("ADBE Vector Graphic - Fill");
        fill.property("Color").setValue(opts.fillColor);

        // stroke
        var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("Color").setValue(opts.strokeColor);
        stroke.property("Stroke Width").setValue(opts.strokeWidth);

        // позиция в центре композиции
        layer.property("Transform").property("Position").setValue([comp.width/2, comp.height/2]);

        return layer;
    }

    // ============================================================
    // D35 COMBO — всё вместе
    // ============================================================
    function applyD35Combo(layer, p) {
        app.beginUndoGroup("ShapeFX: D35 Combo");
        try {
            // 1. Pop bounce
            applyPopBounce(layer, {
                duration: 0.3,
                pause: p.pause + 1.2,  // совмещаем с длинным ringPulse
                amplitude: p.popAmp,
                repeats: p.repeats,
                loopForever: p.loopForever
            });

            // 2. Flash bloom
            applyFlashBloom(layer, {
                duration: 0.4,
                pause: p.pause + 1.1,
                intensity: p.flashIntensity,
                color: p.flashColor,
                repeats: p.repeats,
                loopForever: p.loopForever
            });

            // 3. Ring pulse
            createRing(layer, {
                duration: 1.2,
                pause: p.pause + 0.3,
                color: p.ringColor,
                scaleMax: p.scaleMax,
                strokeStart: 3,
                strokeEnd: 1,
                repeats: p.repeats,
                loopForever: p.loopForever
            });
        } catch(e) {
            alert("D35 Combo error: " + e.toString());
        }
        app.endUndoGroup();
    }

    // ============================================================
    // ====================== UI ==================================
    // ============================================================
    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel) ? thisObj :
                  new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION,
                  undefined, {resizeable:true, closeButton:true});

        win.bg = COL.bg;
        win.margins = 10;
        win.spacing = 6;
        win.orientation = "column";
        win.alignChildren = ["fill","top"];

        // header with help button
        var header = win.add("group");
        header.orientation = "row";
        header.alignChildren = ["fill","center"];
        var titleTxt = header.add("statictext", undefined, SCRIPT_NAME + " " + SCRIPT_VERSION);
        titleTxt.graphics.foregroundColor = titleTxt.graphics.newPen(titleTxt.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1);
        var helpBtn = header.add("button", undefined, "?");
        helpBtn.preferredSize = [26, 22];
        helpBtn.alignment = ["right","center"];

        addDivider(win);

        // ===== STATE =====
        var state = {
            ringColor:    D35_ACCENT,
            flashColor:   D35_WHITE,
            fillColor:    [0.85, 0.85, 0.85],
            strokeColor:  D35_ACCENT,
            duration: 1.2,
            pause: 0.5,
            scaleMax: 150,
            popAmp: 107,
            flashIntensity: 100,
            repeats: 3,
            loopForever: true,
            strokeWidth: 6
        };

        // ===== CREATE SHAPE =====
        addSectionLabel(win, "CREATE SHAPE");
        var shapeRow1 = win.add("group");
        shapeRow1.orientation = "row";
        shapeRow1.alignChildren = ["fill","center"];
        shapeRow1.spacing = 4;
        var bRect = shapeRow1.add("button", undefined, "▭ Rect");
        var bRound = shapeRow1.add("button", undefined, "▢ Rounded");

        var shapeRow2 = win.add("group");
        shapeRow2.orientation = "row";
        shapeRow2.alignChildren = ["fill","center"];
        shapeRow2.spacing = 4;
        var bEllipse = shapeRow2.add("button", undefined, "⬭ Ellipse");
        var bPoly = shapeRow2.add("button", undefined, "⬡ Polygon");

        var sizeRow = win.add("group");
        sizeRow.orientation = "row";
        sizeRow.alignChildren = ["fill","center"];
        sizeRow.add("statictext", undefined, "Size:");
        var sizeInput = sizeRow.add("edittext", undefined, "300");
        sizeInput.preferredSize = [50, 22];
        sizeRow.add("statictext", undefined, "px");
        sizeRow.add("statictext", undefined, "  Fill:");
        var fillSwatch = sizeRow.add("button", undefined, "");
        fillSwatch.preferredSize = [24, 22];
        styleSwatch(fillSwatch, state.fillColor);

        addDivider(win);

        // ===== RING PULSE =====
        addSectionLabel(win, "RING PULSE (D35)");
        var ringRow1 = win.add("group");
        ringRow1.add("statictext", undefined, "Color:");
        var ringSwatch = ringRow1.add("button", undefined, "");
        ringSwatch.preferredSize = [24, 22];
        styleSwatch(ringSwatch, state.ringColor);
        ringRow1.add("statictext", undefined, "  Max scale:");
        var scaleMaxInput = ringRow1.add("edittext", undefined, "150");
        scaleMaxInput.preferredSize = [40, 22];
        ringRow1.add("statictext", undefined, "%");

        // ===== POP BOUNCE =====
        addSectionLabel(win, "POP BOUNCE");
        var popRow = win.add("group");
        popRow.add("statictext", undefined, "Amplitude:");
        var popSlider = popRow.add("slider", undefined, 107, 105, 130);
        popSlider.preferredSize = [110, 20];
        var popValTxt = popRow.add("statictext", undefined, "107%");
        popValTxt.preferredSize = [40,20];

        // ===== FLASH BLOOM =====
        addSectionLabel(win, "FLASH BLOOM");
        var flashRow = win.add("group");
        flashRow.add("statictext", undefined, "Color:");
        var flashSwatch = flashRow.add("button", undefined, "");
        flashSwatch.preferredSize = [24, 22];
        styleSwatch(flashSwatch, state.flashColor);
        flashRow.add("statictext", undefined, "  Intensity:");
        var flashSlider = flashRow.add("slider", undefined, 100, 30, 200);
        flashSlider.preferredSize = [80, 20];
        var flashValTxt = flashRow.add("statictext", undefined, "100");
        flashValTxt.preferredSize = [30,20];

        addDivider(win);

        // ===== TIMING =====
        addSectionLabel(win, "TIMING");
        var pauseRow = win.add("group");
        pauseRow.add("statictext", undefined, "Pause:");
        var pauseSlider = pauseRow.add("slider", undefined, 0.5, 0.0, 3.0);
        pauseSlider.preferredSize = [120, 20];
        var pauseValTxt = pauseRow.add("statictext", undefined, "0.5s");
        pauseValTxt.preferredSize = [40,20];

        var repRow = win.add("group");
        repRow.add("statictext", undefined, "Repeats:");
        var repInput = repRow.add("edittext", undefined, "3");
        repInput.preferredSize = [40, 22];
        var loopCheck = repRow.add("checkbox", undefined, "Loop forever");
        loopCheck.value = true;

        addDivider(win);

        // ===== ACTIONS =====
        addSectionLabel(win, "APPLY");
        var actRow1 = win.add("group");
        actRow1.orientation = "row";
        actRow1.alignChildren = ["fill","center"];
        actRow1.spacing = 4;
        var bRing = actRow1.add("button", undefined, "Ring Pulse");
        var bPop = actRow1.add("button", undefined, "Pop");

        var actRow2 = win.add("group");
        actRow2.orientation = "row";
        actRow2.alignChildren = ["fill","center"];
        actRow2.spacing = 4;
        var bFlash = actRow2.add("button", undefined, "Flash");
        var bShadow = actRow2.add("button", undefined, "+ Shadow");

        var bCombo = win.add("button", undefined, "★ Apply D35 Combo to Selected");
        var bD35Preset = win.add("button", undefined, "Load D35 Color Preset");

        // ===== EVENT HANDLERS =====
        function readState() {
            state.scaleMax = parseFloat(scaleMaxInput.text) || 150;
            state.popAmp = popSlider.value;
            state.flashIntensity = flashSlider.value;
            state.pause = pauseSlider.value;
            state.repeats = parseInt(repInput.text) || 3;
            state.loopForever = loopCheck.value;
        }

        popSlider.onChanging = function(){ popValTxt.text = Math.round(popSlider.value) + "%"; };
        flashSlider.onChanging = function(){ flashValTxt.text = Math.round(flashSlider.value); };
        pauseSlider.onChanging = function(){ pauseValTxt.text = pauseSlider.value.toFixed(2) + "s"; };

        // color pickers
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
        ringSwatch.onClick  = pickColor(ringSwatch, "ringColor");
        flashSwatch.onClick = pickColor(flashSwatch, "flashColor");
        fillSwatch.onClick  = pickColor(fillSwatch, "fillColor");

        // shape creation
        function createAndMaybeSelect(shape) {
            var c = getComp(); if (!c) return null;
            readState();
            app.beginUndoGroup("ShapeFX: Create " + shape);
            var L = createBaseShape(c, {
                shape: shape,
                size: parseInt(sizeInput.text) || 300,
                fillColor: state.fillColor,
                strokeColor: state.ringColor,
                strokeWidth: state.strokeWidth
            });
            // снять выделение и выделить новый
            for (var i=1; i<=c.numLayers; i++) c.layer(i).selected = false;
            L.selected = true;
            app.endUndoGroup();
            return L;
        }

        bRect.onClick    = function(){ createAndMaybeSelect("rect"); };
        bRound.onClick   = function(){ createAndMaybeSelect("rounded"); };
        bEllipse.onClick = function(){ createAndMaybeSelect("ellipse"); };
        bPoly.onClick    = function(){ createAndMaybeSelect("polygon"); };

        bRing.onClick = function() {
            var L = getSelLayer();
            if (!L) { alert("Выделите слой."); return; }
            readState();
            app.beginUndoGroup("ShapeFX: Ring Pulse");
            createRing(L, {
                duration: 1.2,
                pause: state.pause,
                color: state.ringColor,
                scaleMax: state.scaleMax,
                strokeStart: 3,
                strokeEnd: 1,
                repeats: state.repeats,
                loopForever: state.loopForever
            });
            app.endUndoGroup();
        };

        bPop.onClick = function() {
            var L = getSelLayer();
            if (!L) { alert("Выделите слой."); return; }
            readState();
            app.beginUndoGroup("ShapeFX: Pop Bounce");
            applyPopBounce(L, {
                duration: 0.3,
                pause: state.pause + 0.9,
                amplitude: state.popAmp,
                repeats: state.repeats,
                loopForever: state.loopForever
            });
            app.endUndoGroup();
        };

        bFlash.onClick = function() {
            var L = getSelLayer();
            if (!L) { alert("Выделите слой."); return; }
            readState();
            app.beginUndoGroup("ShapeFX: Flash Bloom");
            applyFlashBloom(L, {
                duration: 0.4,
                pause: state.pause + 0.8,
                intensity: state.flashIntensity,
                color: state.flashColor,
                repeats: state.repeats,
                loopForever: state.loopForever
            });
            app.endUndoGroup();
        };

        bShadow.onClick = function() {
            var L = getSelLayer();
            if (!L) { alert("Выделите слой."); return; }
            app.beginUndoGroup("ShapeFX: Drop Shadow");
            applyDropShadow(L);
            app.endUndoGroup();
        };

        bCombo.onClick = function() {
            var L = getSelLayer();
            if (!L) { alert("Выделите слой или создайте фигуру."); return; }
            readState();
            applyD35Combo(L, state);
        };

        bD35Preset.onClick = function() {
            state.ringColor = D35_ACCENT.slice();
            state.flashColor = D35_WHITE.slice();
            state.strokeColor = D35_ACCENT.slice();
            styleSwatch(ringSwatch, state.ringColor);
            styleSwatch(flashSwatch, state.flashColor);
            scaleMaxInput.text = "150";
            popSlider.value = 107;  popValTxt.text = "107%";
            flashSlider.value = 100; flashValTxt.text = "100";
            pauseSlider.value = 0.5; pauseValTxt.text = "0.50s";
            repInput.text = "3";
            loopCheck.value = true;
        };

        helpBtn.onClick = showHelp;

        // layout
        win.layout.layout(true);
        if (win instanceof Window) {
            win.center();
            win.show();
        }
        return win;
    }

    // ---------- UI HELPERS ----------
    function addDivider(parent) {
        var d = parent.add("panel");
        d.preferredSize.height = 1;
        d.alignment = ["fill","top"];
    }

    function addSectionLabel(parent, text) {
        var t = parent.add("statictext", undefined, text);
        t.graphics.foregroundColor = t.graphics.newPen(t.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1);
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

    // ---------- HELP ----------
    function showHelp() {
        var w = new Window("dialog", "ptp_ShapeFX — Справка", undefined, {resizeable:true});
        w.preferredSize = [560, 600];
        w.margins = 12;
        var txt = w.add("edittext", undefined, getHelpText(), {multiline:true, scrolling:true, readonly:true});
        txt.preferredSize = [540, 520];
        var btn = w.add("button", undefined, "Закрыть");
        btn.onClick = function(){ w.close(); };
        w.center();
        w.show();
    }

    function getHelpText() {
        return [
            "ptp_ShapeFX v1.0 — анимации для фигур и UI-элементов",
            "═══════════════════════════════════════════════════",
            "",
            "ЧТО ДЕЛАЕТ СКРИПТ",
            "Создаёт фигуры с нуля и/или добавляет к выделенному слою набор",
            "эффектов «пинг успеха» (Ring Pulse + Pop + Flash) — как в D35.",
            "",
            "═══ СЕКЦИЯ CREATE SHAPE ═══",
            "Кнопки создают новую фигуру в центре композиции:",
            "  ▭ Rect     — прямоугольник",
            "  ▢ Rounded  — со скруглением 20px",
            "  ⬭ Ellipse  — эллипс",
            "  ⬡ Polygon  — шестиугольник",
            "Size — сторона/диаметр в px. Fill — цвет заливки.",
            "Stroke берётся из «Ring Color» в секции Ring Pulse.",
            "",
            "═══ СЕКЦИЯ RING PULSE ═══",
            "Создаёт расширяющийся контур-кольцо вокруг выделенного слоя.",
            "Автоматически определяет форму (rect/ellipse) и повторяет её.",
            "  Color    — цвет обводки кольца",
            "  Max scale — на сколько % расширяется (150 = до 1.5x)",
            "",
            "═══ СЕКЦИЯ POP BOUNCE ═══",
            "Лёгкое «подпрыгивание» Scale: 100→amp→100 с easeOutBack.",
            "  Amplitude — пик масштаба (107% по умолчанию, как в D35)",
            "",
            "═══ СЕКЦИЯ FLASH BLOOM ═══",
            "Кратковременная вспышка через эффект Glow.",
            "  Color     — цвет вспышки (белый по умолчанию)",
            "  Intensity — яркость пика (100 = стандарт Glow)",
            "",
            "═══ СЕКЦИЯ TIMING ═══",
            "  Pause   — пауза между повторами цикла (0.0–3.0 сек)",
            "            0.0   — непрерывный нервный пульс",
            "            0.5   — спокойное дыхание (как в D35)",
            "            1.0+  — редкое привлечение внимания",
            "  Repeats — сколько повторов отрисовать ключами (1–8)",
            "  Loop forever — добавить loopOut(\"cycle\") вместо ключей",
            "",
            "═══ КНОПКИ ПРИМЕНЕНИЯ ═══",
            "  Ring Pulse  — только кольцо к выделенному слою",
            "  Pop         — только pop bounce",
            "  Flash       — только вспышка Glow",
            "  + Shadow    — добавить мягкую тень (отдельно)",
            "  ★ Apply D35 Combo — всё сразу с правильной синхронизацией",
            "  Load D35 Color Preset — сбросить цвета к оранж+белый",
            "",
            "═══ WORKFLOW ═══",
            "Вариант A (с нуля):",
            "  1. Создай фигуру кнопкой ▭/▢/⬭/⬡",
            "  2. Нажми ★ Apply D35 Combo",
            "  3. Готово",
            "",
            "Вариант B (на существующий слой):",
            "  1. Выдели shape/solid/footage слой",
            "  2. Нажми ★ Apply D35 Combo или отдельные кнопки",
            "",
            "═══ СОВЕТЫ ═══",
            "• Перед применением убедись, что CTI стоит в начале нужного",
            "  диапазона — ключи ставятся от текущего времени.",
            "• Drop Shadow добавляется отдельной кнопкой, чтобы не мешать,",
            "  если фон уже тёмный.",
            "• Чтобы остановить loopOut — удали expression в timeline.",
            "• Reset: Ctrl+Z (Cmd+Z) отменяет в пределах одного действия.",
            "",
            "═══ ИЗВЕСТНЫЕ ОГРАНИЧЕНИЯ ═══",
            "• Auto-detect формы работает только для shape-слоёв с одним",
            "  rect/ellipse контуром. Для footage/solid создаётся rect-ring.",
            "• Polygon ring пока не реализован — fallback на rect.",
            "• Glow матчится по matchName 'ADBE Glo2'; если в твоей версии",
            "  AE другой matchName, Flash может не применить цвет.",
            "",
            "═══ ВЕРСИЯ ═══",
            "ptp_ShapeFX v1.0 — D35 Ring Pulse combo",
            "Следующее: D36+, добавление новых эффектов по референсам."
        ].join("\n");
    }

    // ---------- START ----------
    buildUI(thisObj);

})(this);

