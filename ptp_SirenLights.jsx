// ============================================================
// ptp_SirenLights.jsx  v1.0
// Police/emergency siren lights generator.
// Creates 2+ shape-layer lights with hard-flash opacity animation,
// optional Glow and Tint adjustment layer.
// ============================================================

(function (thisObj) {
    var SCRIPT_NAME = "ptp_SirenLights";
    var SCRIPT_VERSION = "v1.0";
    var LAYER_PREFIX = "SL_";
    var COL_ACCENT = [1.00, 0.55, 0.10];

    // ============================================================
    // HELPERS
    // ============================================================
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Open a composition first."); return null; }
        return c;
    }
    function getSelLayer() {
        var c = getComp(); if (!c) return null;
        var sel = c.selectedLayers;
        if (!sel || sel.length === 0) { alert("Select a layer (siren attach target)."); return null; }
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
    function setHoldAll(prop) {
        for (var i = 1; i <= prop.numKeys; i++) {
            try {
                prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
            } catch(e){}
        }
    }
    function setLoopExpression(prop, mode) {
        try {
            prop.expression = 'loopOut("' + (mode || "cycle") + '")';
            prop.expressionEnabled = true;
        } catch(e) {}
    }

    // ============================================================
    // PATTERN BUILDER
    // Returns array of arrays: schedule[lightIdx] = [flashStart1, flashStart2, ...]
    // ============================================================
    function buildSchedule(pattern, numLights, compDur, t0, flashDur, gap) {
        var schedule = [];
        for (var i = 0; i < numLights; i++) schedule.push([]);
        var step = flashDur + gap;

        if (pattern === "alternate") {
            var t = t0, idx = 0;
            while (t + flashDur <= t0 + compDur) {
                schedule[idx % numLights].push(t);
                t += step;
                idx++;
            }
        } else if (pattern === "strobe") {
            var t = t0;
            while (t + flashDur <= t0 + compDur) {
                for (var k = 0; k < numLights; k++) schedule[k].push(t);
                t += step;
            }
        } else if (pattern === "wigwag") {
            // Each light flashes twice in a row, then next light, etc.
            var t = t0, idx = 0, sub = 0;
            while (t + flashDur <= t0 + compDur) {
                schedule[idx % numLights].push(t);
                t += step;
                sub++;
                if (sub >= 2) { sub = 0; idx++; }
            }
        } else if (pattern === "random") {
            var t = t0;
            while (t + flashDur <= t0 + compDur) {
                var r = Math.floor(Math.random() * numLights);
                schedule[r].push(t);
                t += step;
            }
        }
        return schedule;
    }

    // Compute cycle length so loopOut("cycle") repeats the WHOLE pattern.
    function computeCycleLength(pattern, numLights, flashDur, gap) {
        var step = flashDur + gap;
        if (pattern === "alternate") return step * numLights;
        if (pattern === "strobe")    return step;
        if (pattern === "wigwag")    return step * numLights * 2;
        if (pattern === "random")    return 0; // random не лупится
        return step * numLights;
    }

    // ============================================================
    // LIGHT BUILDER
    // ============================================================
    function buildLight(comp, srcLayer, opts, lightIdx, color, flashTimes, cycleLen, attachPos) {
    var step = "init";
    try {
        step = "addShape";
        var L = comp.layers.addShape();
        L.name = LAYER_PREFIX + srcLayer.name + "_Light_" + (lightIdx + 1);

        step = "blendingMode";
        try { L.blendingMode = BlendingMode.ADD; } catch(e){}

        step = "getContents";
        var contents = L.property("ADBE Root Vectors Group");

        // ---- HALO (outer soft ring) ----
        step = "haloGroup";
        var grpHalo = contents.addProperty("ADBE Vector Group");
        grpHalo.name = "Halo";
        var innerHalo = grpHalo.property("ADBE Vectors Group");

        step = "haloEllipse";
        innerHalo.addProperty("ADBE Vector Shape - Ellipse");

        step = "haloFill";
        var fillHalo = innerHalo.addProperty("ADBE Vector Graphic - Fill");
        try { fillHalo.property("Color").setValue(color); } catch(e){}
        try { fillHalo.property("Opacity").setValue(40); } catch(e){}

        step = "haloSize";
        var haloEll = null;
        for (var ei = 1; ei <= innerHalo.numProperties; ei++) {
            var p = innerHalo.property(ei);
            if (p && p.matchName === "ADBE Vector Shape - Ellipse") { haloEll = p; break; }
        }
        if (!haloEll) throw new Error("Halo ellipse not found");
        var haloSize = opts.lightSize * 3.0;
        haloEll.property("ADBE Vector Ellipse Size").setValue([haloSize, haloSize]);

        // ---- CORE (bright center) ----
        step = "coreGroup";
        var grpCore = contents.addProperty("ADBE Vector Group");
        grpCore.name = "Core";
        var innerCore = grpCore.property("ADBE Vectors Group");

        step = "coreEllipse";
        innerCore.addProperty("ADBE Vector Shape - Ellipse");

        step = "coreFill";
        var fillCore = innerCore.addProperty("ADBE Vector Graphic - Fill");
        // brighten core toward white
        var coreColor = [
            Math.min(1, color[0] * 0.5 + 0.5),
            Math.min(1, color[1] * 0.5 + 0.5),
            Math.min(1, color[2] * 0.5 + 0.5)
        ];
        try { fillCore.property("Color").setValue(coreColor); } catch(e){}

        step = "coreSize";
        var coreEll = null;
        for (var ei2 = 1; ei2 <= innerCore.numProperties; ei2++) {
            var p2 = innerCore.property(ei2);
            if (p2 && p2.matchName === "ADBE Vector Shape - Ellipse") { coreEll = p2; break; }
        }
        if (!coreEll) throw new Error("Core ellipse not found");
        coreEll.property("ADBE Vector Ellipse Size").setValue([opts.lightSize, opts.lightSize]);

        // ---- POSITION ----
        step = "position";
        var posProp = L.property("Transform").property("Position");
        if (opts.parentToSource) {
            try { L.parent = srcLayer; } catch(e){}
            var anc = [0, 0];
            try { anc = srcLayer.property("Transform").property("Anchor Point").value; } catch(e){}
            posProp.setValue([anc[0] + attachPos[0], anc[1] + attachPos[1]]);
        } else {
            posProp.setValue([attachPos[0], attachPos[1]]);
        }

        // ---- LAYER OPACITY KEYS (flash on/off) ----
        step = "opacityKeys";
        var opLayer = L.property("Transform").property("Opacity");
        opLayer.setValueAtTime(comp.time, 0);
        for (var f = 0; f < flashTimes.length; f++) {
            var ft = flashTimes[f];
            opLayer.setValueAtTime(ft, 100);
            opLayer.setValueAtTime(ft + opts.flashDuration, 0);
        }
        setHoldAll(opLayer);

        // ---- GLOW EFFECT ----
        step = "glow";
        if (opts.glow) {
            try {
                var gl = L.Effects.addProperty("ADBE Glow");
                try { gl.property("Glow Threshold").setValue(0); } catch(e){}
                try { gl.property("Glow Radius").setValue(opts.glowRadius); } catch(e){}
                try { gl.property("Glow Intensity").setValue(opts.glowIntensity); } catch(e){}
                try { gl.property("Glow Operation").setValue(3); } catch(e){}      // Add
                try { gl.property("Glow Colors").setValue(1); } catch(e){}         // Original
                try { gl.property("Composite Original").setValue(2); } catch(e){}  // On Top
            } catch(e){}

            // Second pass — bigger glow
            try {
                var gl2 = L.Effects.addProperty("ADBE Glow");
                try { gl2.property("Glow Threshold").setValue(0); } catch(e){}
                try { gl2.property("Glow Radius").setValue(opts.glowRadius * 2.5); } catch(e){}
                try { gl2.property("Glow Intensity").setValue(opts.glowIntensity * 0.6); } catch(e){}
                try { gl2.property("Glow Operation").setValue(3); } catch(e){}
                try { gl2.property("Glow Colors").setValue(1); } catch(e){}
                try { gl2.property("Composite Original").setValue(2); } catch(e){}
            } catch(e){}
        }

        // ---- LOOP ----
        step = "loop";
        if (opts.loop && cycleLen > 0 && opts.pattern !== "random") {
            setLoopExpression(opLayer, "cycle");
        }

        step = "moveBefore";
        try { L.moveBefore(srcLayer); } catch(e){}

        return L;
    } catch(err) {
        throw new Error("step=" + step + " | " + err.toString());
    }
}


  

    // ============================================================
    // MAIN GENERATOR
    // ============================================================
    function generate(opts) {
        var comp = getComp(); if (!comp) return;
        var srcLayer = getSelLayer(); if (!srcLayer) return;
        if (opts.numLights < 1) { alert("Need at least 1 light."); return; }

        var t0 = comp.time;
        var compDur = comp.duration - t0;

        // Schedule of flash times per light
        var schedule = buildSchedule(opts.pattern, opts.numLights, compDur, t0,
                                     opts.flashDuration, opts.gap);
        var cycleLen = computeCycleLength(opts.pattern, opts.numLights, opts.flashDuration, opts.gap);

        // Positions: horizontal row, centered around anchor
        var spacing = opts.spacing;
        var positions = [];
        var totalWidth = spacing * (opts.numLights - 1);
        for (var i = 0; i < opts.numLights; i++) {
            var x = -totalWidth/2 + i * spacing;
            positions.push([x, 0]);
        }

        // Colors: cycle through opts.colors array
        var colors = opts.colors;
        var lightColors = [];
        for (var i = 0; i < opts.numLights; i++) {
            lightColors.push(colors[i % colors.length]);
        }

        // Build lights
        for (var i = 0; i < opts.numLights; i++) {
            try {
                buildLight(comp, srcLayer, opts, i, lightColors[i], schedule[i], cycleLen, positions[i]);
            } catch(err) {
                alert("Light " + (i+1) + " failed at: " + err.toString());
                return;
            }
        }

        // Tint adjustment
        
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
        lbl.preferredSize.width = 140;
        lbl.minimumSize.width = 140;
        var sld = row.add("slider", undefined, val, mn, mx);
        sld.preferredSize.width = 100;
        var box = row.add("edittext", undefined, (step >= 1) ? String(val) : Number(val).toFixed(2));
        box.preferredSize.width = 50;
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
        var lbl = row.add("statictext", undefined, label + ":");
        lbl.preferredSize.width = 140;
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
        w.preferredSize.width = 380;
        w.minimumSize.width = 360;

        var title = w.add("statictext", undefined, SCRIPT_NAME + "  " + SCRIPT_VERSION);
        title.graphics.foregroundColor = title.graphics.newPen(title.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);

        var state = {
            numLights:     2,
            colors:        [[1.0,0.0,0.0], [0.0,0.4,1.0]],  // red, blue
            lightSize:     30,
            spacing:       30,
            parentToSource: true,
            pattern:       "alternate",
            flashDuration: 0.08,
            gap:           0.04,
            loop:          true,
            glow:          true,
            glowIntensity: 3.0,
            glowRadius:    60
            
        };

        // -------- Lights --------
        var lPanel = w.add("panel", undefined, "Lights");
        lPanel.orientation = "column";
        lPanel.alignChildren = ["fill","top"];
        lPanel.margins = 8;

        addSlider(lPanel, "Number of lights", 1, 6, state.numLights, 1,
            function(v){ state.numLights = v; });
        addSlider(lPanel, "Light size (px)", 5, 200, state.lightSize, 1,
            function(v){ state.lightSize = v; });
        addSlider(lPanel, "Spacing (px)", 0, 500, state.spacing, 1,
            function(v){ state.spacing = v; });

        makeColorSwatch(lPanel, "Color 1", state.colors[0],
            function(c){ state.colors[0] = c; });
        makeColorSwatch(lPanel, "Color 2", state.colors[1],
            function(c){ state.colors[1] = c; });

        // -------- Pattern --------
        var pPanel = w.add("panel", undefined, "Pattern");
        pPanel.orientation = "column";
        pPanel.alignChildren = ["fill","top"];
        pPanel.margins = 8;

        var rowPat = pPanel.add("group");
        var pLbl = rowPat.add("statictext", undefined, "Flash pattern:");
        pLbl.preferredSize.width = 140;
        var pDD = rowPat.add("dropdownlist", undefined, ["Alternate","Strobe","Wig-Wag","Random"]);
        pDD.selection = pDD.find("Alternate");
        pDD.preferredSize.width = 130;
        pDD.onChange = function(){
            var t = pDD.selection.text;
            if (t === "Alternate") state.pattern = "alternate";
            else if (t === "Strobe") state.pattern = "strobe";
            else if (t === "Wig-Wag") state.pattern = "wigwag";
            else state.pattern = "random";
        };

        addSlider(pPanel, "Flash duration (s)", 0.02, 1.0, state.flashDuration, 0.01,
            function(v){ state.flashDuration = v; });
        addSlider(pPanel, "Gap (s)", 0.0, 1.0, state.gap, 0.01,
            function(v){ state.gap = v; });

        var cbLoop = pPanel.add("checkbox", undefined, "Loop pattern (cycle)");
        cbLoop.value = state.loop;
        cbLoop.onClick = function(){ state.loop = cbLoop.value; };

        // -------- Glow --------
        var gPanel = w.add("panel", undefined, "Glow");
        gPanel.orientation = "column";
        gPanel.alignChildren = ["fill","top"];
        gPanel.margins = 8;

        var cbGlow = gPanel.add("checkbox", undefined, "Enable Glow");
        cbGlow.value = state.glow;
        cbGlow.onClick = function(){ state.glow = cbGlow.value; };

        addSlider(gPanel, "Glow intensity", 0.1, 10.0, state.glowIntensity, 0.1,
            function(v){ state.glowIntensity = v; });
        addSlider(gPanel, "Glow radius (px)", 1, 200, state.glowRadius, 1,
            function(v){ state.glowRadius = v; });


        // -------- Behavior --------
        var bPanel = w.add("panel", undefined, "Behavior");
        bPanel.orientation = "column";
        bPanel.alignChildren = ["fill","top"];
        bPanel.margins = 8;

        var cbParent = bPanel.add("checkbox", undefined, "Parent lights to source layer");
        cbParent.value = state.parentToSource;
        cbParent.onClick = function(){ state.parentToSource = cbParent.value; };

        divider(w);

        var btnRow = w.add("group");
        btnRow.orientation = "row";
        var btnGo = btnRow.add("button", undefined, "Create Siren");
        btnGo.preferredSize.height = 30;
        btnGo.preferredSize.width = 240;
        var btnHelp = btnRow.add("button", undefined, "?");
        btnHelp.preferredSize.width = 28;

        btnGo.onClick = function(){
            app.beginUndoGroup(SCRIPT_NAME + ": Create Siren");
            try { generate(state); }
            catch(err) { alert("Error: " + err.toString()); }
            app.endUndoGroup();
        };

        btnHelp.onClick = function(){ alert(getHelpText()); };

        if (w instanceof Window) { w.center(); w.show(); }
        else {
            w.layout.layout(true);
            w.layout.resize();
            w.onResizing = w.onResize = function(){ this.layout.resize(); };
        }
        return w;
    }

    function getHelpText() {
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n" +
            "Полицейские/спецсигнальные мигалки на выбранном слое.\n\n" +
            "БЫСТРЫЙ СТАРТ:\n" +
            "1. Выдели слой, к которому привязать мигалку (машина, объект).\n" +
            "2. Поставь CTI на время старта.\n" +
            "3. Настрой параметры и нажми Create Siren.\n\n" +
            "LIGHTS:\n" +
            "• Number of lights — количество огней (1-6).\n" +
            "• Light size — диаметр круга огня в px.\n" +
            "• Spacing — расстояние между огнями по горизонтали.\n" +
            "• Color 1 / Color 2 — цвета (для 3+ огней циклически повторяются).\n\n" +
            "PATTERN:\n" +
            "• Alternate — поочерёдно (red, blue, red, blue, ...).\n" +
            "• Strobe — все вместе короткими вспышками.\n" +
            "• Wig-Wag — двойная вспышка каждого огня по очереди.\n" +
            "• Random — случайный порядок (не лупится корректно).\n" +
            "• Flash duration — длительность одной вспышки.\n" +
            "• Gap — пауза между вспышками.\n" +
            "• Loop — добавляет loopOut('cycle') для бесшовного повтора.\n\n" +
            "GLOW:\n" +
            "• Свечение вокруг огней. Лучше виден на тёмном фоне.\n\n" +
            "BACKGROUND TINT:\n" +
            "• Adjustment-слой с эффектом Tint, окрашивающий всю сцену\n" +
            "  в цвет текущей вспышки. Tint strength — сила окрашивания (0-100%).\n\n" +
            "BEHAVIOR:\n" +
            "• Parent to source — огни и tint становятся child выбранного слоя.\n\n" +
            "СОЗДАВАЕМЫЕ СЛОИ:\n" +
            "• " + LAYER_PREFIX + "<source>_Light_1..N — shape-слои огней.\n" +
            "• " + LAYER_PREFIX + "<source>_Tint — adjustment-слой (если включён).\n\n" +
            "СОВЕТЫ:\n" +
            "• Стандартная мигалка: 2 огня, Alternate, Flash 0.08s, Gap 0.04s.\n" +
            "• Стробоскоп: Strobe + Flash 0.05s + Gap 0.05s.\n" +
            "• Если tint слишком резкий — снизь Tint strength до 15-20%.\n" +
            "• Random не лупится — используй для коротких сцен.\n" +
            "• Undo откатывает создание целиком.";
    }

    buildUI(thisObj);

})(this);
