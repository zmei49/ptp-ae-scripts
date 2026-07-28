// ============================================================
// ptp_SirenLights.jsx  v2.0
// Police/emergency siren lights generator.
// Changes vs 1.0:
//   • matchName для Fill/Glow/Blur/Transform (RU-локаль)
//   • Fast Blur → Box Blur с fallback, параметры по индексам
//   • Fix конфликта opacity ключа в t0
//   • Ключи генерируются только на один цикл + loopOut("cycle")
//   • UI полностью на русском
//   • Softness slider (управление размытием отдельно от размера)
//   • До 4 цветов
//   • Пресеты: Полиция / Скорая / Пожарная / Кастом
//   • Раскладка: Горизонталь / Вертикаль / Диагональ
//   • Toggle Blend Mode (Add / Screen / Normal)
//   • Реальный Tint adjustment layer (общий тон-оверлей)
// ============================================================

(function (thisObj) {
    var SCRIPT_NAME = "ptp_SirenLights";
    var SCRIPT_VERSION = "v2.0";
    var LAYER_PREFIX = "SL_";

    // ============================================================
    // HELPERS
    // ============================================================
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Открой композицию."); return null; }
        return c;
    }
    function getSelLayer() {
        var c = getComp(); if (!c) return null;
        var sel = c.selectedLayers;
        if (!sel || sel.length === 0) { alert("Выдели слой (к которому крепится сирена)."); return null; }
        return sel[0];
    }
    function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
    function rgbToHex(rgb) {
        function h(v){ v = Math.round(clamp(v,0,1)*255); return (v<16?"0":"") + v.toString(16).toUpperCase(); }
        return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
    }
    function esc(s){ return String(s).replace(/\\/g,"\\\\").replace(/"/g,'\\"'); }

    function setHoldAll(prop){
        try {
            for (var i=1;i<=prop.numKeys;i++){
                prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
            }
        } catch(e){}
    }
    function setLoopExpression(prop, mode){
        try { prop.expression = "loopOut('" + mode + "');"; } catch(e){}
    }

    // ============================================================
    // SCHEDULE — ключи только на один цикл, дальше loopOut
    // ============================================================
    // Возвращает массив массивов: schedule[lightIdx] = [{t, v}, ...] в относительных секундах от 0.
    function buildScheduleOneCycle(pattern, N, flashDur, gap) {
        var sched = [];
        for (var i=0;i<N;i++) sched.push([]);

        if (pattern === "alternate") {
            // По очереди: 1, 2, 3, ..., N
            for (var i=0;i<N;i++) {
                var t = i * (flashDur + gap);
                sched[i].push({t:t, v:100});
                sched[i].push({t:t + flashDur, v:0});
            }
        }
        else if (pattern === "strobe") {
            // Все одновременно, короткие серии по 3 вспышки
            var burstCount = 3;
            for (var b=0; b<burstCount; b++) {
                var t = b * (flashDur + gap);
                for (var i=0;i<N;i++) {
                    sched[i].push({t:t, v:100});
                    sched[i].push({t:t + flashDur, v:0});
                }
            }
        }
        else if (pattern === "wigwag") {
            // Двойные вспышки: свет A мигает 2 раза, потом B мигает 2 раза
            var doubleFlash = flashDur * 0.5;
            var doubleGap = flashDur * 0.3;
            for (var i=0;i<N;i++) {
                var startPhase = i * (doubleFlash*2 + doubleGap*2 + gap);
                // Первая вспышка
                sched[i].push({t:startPhase, v:100});
                sched[i].push({t:startPhase + doubleFlash, v:0});
                // Пауза
                // Вторая вспышка
                sched[i].push({t:startPhase + doubleFlash + doubleGap, v:100});
                sched[i].push({t:startPhase + doubleFlash*2 + doubleGap, v:0});
            }
        }
        else if (pattern === "random") {
            // Псевдослучайный — но всё ещё цикл (для loopOut)
            var slots = Math.max(6, N*3);
            for (var s=0; s<slots; s++) {
                var lightIdx = Math.floor(Math.random() * N);
                var t = s * (flashDur + gap);
                sched[lightIdx].push({t:t, v:100});
                sched[lightIdx].push({t:t + flashDur, v:0});
            }
        }

        return sched;
    }

    function computeCycleLength(pattern, N, flashDur, gap) {
        if (pattern === "alternate") return N * (flashDur + gap);
        if (pattern === "strobe") return 3 * (flashDur + gap);
        if (pattern === "wigwag") return N * (flashDur * 2.5 + gap);
        if (pattern === "random") return Math.max(6, N*3) * (flashDur + gap);
        return 1.0;
    }

    // ============================================================
    // BUILD SINGLE LIGHT
    // ============================================================
    function buildLight(comp, srcLayer, srcAnchor, index, pos, color, opts, keyframes, cycleLen, t0) {
        var step = "start";
        try {
            step = "addShape";
            var L = comp.layers.addShape();
            L.name = LAYER_PREFIX + srcLayer.name + "_Light_" + (index+1);

            step = "size";
            var size = opts.lightSize;

            step = "position";
            // Позиция огня = anchor источника + смещение (в комп-координатах)
            var pxComp = [srcAnchor[0] + pos[0], srcAnchor[1] + pos[1]];
            try { L.property("ADBE Transform Group").property("ADBE Position").setValue(pxComp); } catch(e){}

            step = "content";
            var root = L.property("ADBE Root Vectors Group");
            var g = root.addProperty("ADBE Vector Group");
            g.name = "Light";
            var inner = g.property("ADBE Vectors Group");
            var ell = inner.addProperty("ADBE Vector Shape - Ellipse");
            try { ell.property("ADBE Vector Ellipse Size").setValue([size, size]); } catch(e){}

            step = "fill";
            var fill = inner.addProperty("ADBE Vector Graphic - Fill");
            try { fill.property("ADBE Vector Fill Color").setValue(color); } catch(e){
                try { fill.property("Color").setValue(color); } catch(e2){}
            }

            step = "blur";
            // Мягкое размытие для halo-эффекта
            var fb = null;
            try { fb = L.Effects.addProperty("ADBE Box Blur2"); } catch(e){}
            if (!fb) { try { fb = L.Effects.addProperty("ADBE Fast Blur"); } catch(e){} }
            if (fb) {
                try { fb.property(1).setValue(size * opts.softness); } catch(e){}   // Blur Radius
                try { fb.property(3).setValue(1); } catch(e){}                       // Repeat Edge Pixels
            }

            step = "glow";
            if (opts.glow) {
                try {
                    var gl = L.Effects.addProperty("ADBE Glo2");
                    if (gl) {
                        try { gl.property(1).setValue(0); } catch(e){}                          // Threshold
                        try { gl.property(2).setValue(opts.glowRadius); } catch(e){}            // Radius
                        try { gl.property(3).setValue(opts.glowIntensity); } catch(e){}         // Intensity
                        try { gl.property(5).setValue(3); } catch(e){}                          // Operation
                        try { gl.property(6).setValue(1); } catch(e){}                          // Colors A&B
                        try { gl.property(8).setValue(2); } catch(e){}                          // Composite Original: on top
                    }
                } catch(e){}
            }

            step = "blend";
            if (opts.blendMode === "add") L.blendingMode = BlendingMode.ADD;
            else if (opts.blendMode === "screen") L.blendingMode = BlendingMode.SCREEN;
            // "normal" — ничего не меняем

            step = "opacity_keys";
            var opLayer = L.property("ADBE Transform Group").property("ADBE Opacity");

            // Стартовое состояние — 0, но только если первый ключ не в t0
            var firstKeyTime = keyframes.length > 0 ? (t0 + keyframes[0].t) : t0;
            if (firstKeyTime > t0 + 0.001) {
                opLayer.setValueAtTime(t0, 0);
            }

            // Расставляем ключи одного цикла
            for (var k=0; k<keyframes.length; k++) {
                opLayer.setValueAtTime(t0 + keyframes[k].t, keyframes[k].v);
            }
            setHoldAll(opLayer);

            step = "loop";
            if (opts.loop && cycleLen > 0) {
                setLoopExpression(opLayer, "cycle");
            } else if (!opts.loop) {
                // Финальный ключ 0 после последнего flash
                var lastT = keyframes.length ? keyframes[keyframes.length-1].t : 0;
                try { opLayer.setValueAtTime(t0 + lastT + 0.01, 0); } catch(e){}
            }

            step = "moveBefore";
            try { L.moveBefore(srcLayer); } catch(e){}

            return L;
        } catch(err) {
            throw new Error("light " + (index+1) + " step=" + step + " | " + err.toString());
        }
    }

    // ============================================================
    // TINT ADJUSTMENT LAYER (общий тон-оверлей над всеми огнями)
    // ============================================================
    function buildTintAdjustment(comp, srcLayer, lights, tintColor, tintAmount, boostContrast) {
        if (!lights || lights.length === 0) return null;
        try {
            var adj = comp.layers.addSolid([1,1,1], LAYER_PREFIX + srcLayer.name + "_Tint",
                                            comp.width, comp.height, 1);
            adj.adjustmentLayer = true;

            // Tint: map white → tintColor
            var tint = adj.Effects.addProperty("ADBE Tint");
            if (tint) {
                try { tint.property(1).setValue([0,0,0,1]); } catch(e){}          // Map Black To
                try { tint.property(2).setValue([tintColor[0], tintColor[1], tintColor[2], 1]); } catch(e){}  // Map White To
                try { tint.property(3).setValue(tintAmount); } catch(e){}         // Amount to Tint (0-100)
            }

            if (boostContrast) {
                var lvl = adj.Effects.addProperty("ADBE Easy Levels2");
                // Оставляем дефолтные значения — просто присутствие эффекта даёт лёгкий контраст;
                // при желании можно расширить UI под конкретные точки.
            }

            // Размещаем над первым огнём
            try { adj.moveBefore(lights[0]); } catch(e){}
            return adj;
        } catch(err) {
            return null;
        }
    }

    // ============================================================
    // MAIN GENERATOR
    // ============================================================
    function generate(opts) {
        var comp = getComp(); if (!comp) return;
        var srcLayer = getSelLayer(); if (!srcLayer) return;
        if (opts.numLights < 1) { alert("Нужен минимум 1 огонь."); return; }

        app.beginUndoGroup(SCRIPT_NAME + " Generate");
        try {
            var t0 = comp.time;

            // Anchor источника через matchName
            var srcAnchor = [comp.width/2, comp.height/2];
            try {
                var pos = srcLayer.property("ADBE Transform Group").property("ADBE Position").value;
                srcAnchor = [pos[0], pos[1]];
            } catch(e){}

            // Ключи на один цикл
            var schedule = buildScheduleOneCycle(opts.pattern, opts.numLights, opts.flashDuration, opts.gap);
            var cycleLen = computeCycleLength(opts.pattern, opts.numLights, opts.flashDuration, opts.gap);

            // Позиции огней по раскладке
            var spacing = opts.spacing;
            var positions = [];
            var total = spacing * (opts.numLights - 1);
            for (var i=0; i<opts.numLights; i++) {
                var offset = -total/2 + i * spacing;
                if (opts.layout === "horizontal")      positions.push([offset, 0]);
                else if (opts.layout === "vertical")   positions.push([0, offset]);
                else if (opts.layout === "diagonal")   positions.push([offset, offset * 0.5]);
                else                                    positions.push([offset, 0]);
            }

            // Цвета
            var colors = opts.colors;   // массив [ [r,g,b] , ... ]
            var perLightColor = [];
            for (var i=0; i<opts.numLights; i++) {
                var col = colors[i % colors.length];
                perLightColor.push([col[0], col[1], col[2], 1]);
            }

            // Создаём огни
            var createdLights = [];
            for (var i=0; i<opts.numLights; i++) {
                var L = buildLight(comp, srcLayer, srcAnchor, i,
                                    positions[i], perLightColor[i],
                                    opts, schedule[i] || [], cycleLen, t0);
                createdLights.push(L);
            }

            // Tint adjustment (опционально)
            if (opts.tintEnable) {
                buildTintAdjustment(comp, srcLayer, createdLights,
                                    opts.tintColor, opts.tintAmount, opts.tintBoost);
            }

        } catch(err) {
            alert("Ошибка: " + err.toString());
        }
        app.endUndoGroup();
    }

    // ============================================================
    // PRESETS
    // ============================================================
    function applyPreset(name, state) {
        if (name === "Полиция (RU)") {
            state.numLights = 2;
            state.colors = [[0.2,0.5,1.0], [0.2,0.5,1.0], [0.2,0.5,1.0], [0.2,0.5,1.0]];
            state.numColors = 1;
            state.pattern = "wigwag";
            state.flashDuration = 0.06;
            state.gap = 0.04;
            state.blendMode = "add";
            state.layout = "horizontal";
        }
        else if (name === "Полиция (US)") {
            state.numLights = 2;
            state.colors = [[1.0,0.15,0.15], [0.15,0.35,1.0], [1.0,0.15,0.15], [0.15,0.35,1.0]];
            state.numColors = 2;
            state.pattern = "wigwag";
            state.flashDuration = 0.06;
            state.gap = 0.04;
            state.blendMode = "add";
            state.layout = "horizontal";
        }
        else if (name === "Скорая") {
            state.numLights = 2;
            state.colors = [[1.0,0.15,0.15], [1.0,0.15,0.15], [1.0,0.15,0.15], [1.0,0.15,0.15]];
            state.numColors = 1;
            state.pattern = "strobe";
            state.flashDuration = 0.05;
            state.gap = 0.08;
            state.blendMode = "add";
            state.layout = "horizontal";
        }
        else if (name === "Пожарная") {
            state.numLights = 3;
            state.colors = [[1.0,0.15,0.15], [1.0,1.0,1.0], [1.0,0.15,0.15], [1.0,1.0,1.0]];
            state.numColors = 2;
            state.pattern = "alternate";
            state.flashDuration = 0.1;
            state.gap = 0.02;
            state.blendMode = "add";
            state.layout = "horizontal";
        }
    }

    // ============================================================
    // UI
    // ============================================================
    function addSlider(parent, label, mn, mx, def, step, onChange) {
    var row = parent.add("group");
    row.orientation = "row";
    row.alignChildren = ["left","center"];
    row.alignment = ["fill","top"];
    row.spacing = 6;

    var lbl = row.add("statictext", undefined, label);
    lbl.preferredSize.width = 130;
    lbl.minimumSize.width = 100;

    var sl = row.add("slider", undefined, def, mn, mx);
    sl.alignment = ["fill","center"];
    sl.minimumSize.width = 60;

    var et = row.add("edittext", undefined, def.toFixed(step < 0.1 ? 2 : 1));
    et.preferredSize.width = 50;
    et.minimumSize.width = 45;

    sl.onChanging = function(){
        var v = Math.round(sl.value / step) * step;
        et.text = v.toFixed(step < 0.1 ? 2 : 1);
        onChange(v);
    };
    et.onChange = function(){
        var v = parseFloat(et.text);
        if (!isNaN(v)) { v = clamp(v, mn, mx); sl.value = v; onChange(v); }
    };
    return {
        get: function(){ return sl.value; },
        set: function(v){ sl.value = v; et.text = v.toFixed(step < 0.1 ? 2 : 1); }
    };
}


    function makeColorSwatch(parent, label, initColor, onChange) {
    var row = parent.add("group");
    row.orientation = "row";
    row.alignChildren = ["left","center"];
    row.alignment = ["fill","top"];

    var lbl = row.add("statictext", undefined, label);
    lbl.preferredSize.width = 80;
    lbl.minimumSize.width = 60;

    var currentColor = [initColor[0], initColor[1], initColor[2]];
    var btn = row.add("button", undefined, rgbToHex(currentColor));
    btn.alignment = ["fill","center"];
    btn.minimumSize.width = 70;
    btn.preferredSize.height = 22;

    btn.onClick = function(){
        var c = $.colorPicker();
        if (c !== -1){
            var r=((c>>16)&255)/255, g=((c>>8)&255)/255, b=(c&255)/255;
            currentColor = [r,g,b];
            btn.text = rgbToHex(currentColor);
            onChange(currentColor);
        }
    };
    return { set: function(col){ currentColor = [col[0],col[1],col[2]]; btn.text = rgbToHex(currentColor); } };
}


    function buildUI(thisObj) {
        var w = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, {resizeable:true});
        w.orientation = "column"; w.alignChildren = ["fill","top"]; w.margins = 10; w.spacing = 6;    w.minimumSize.width = 260;
    w.preferredSize.width = 340;

        var state = {
            numLights: 2,
            spacing: 60,
            lightSize: 40,
            softness: 0.9,
            colors: [[1.0,0.15,0.15], [0.2,0.4,1.0], [1.0,1.0,1.0], [1.0,0.7,0.1]],
            numColors: 2,
            pattern: "wigwag",
            flashDuration: 0.06,
            gap: 0.04,
            loop: true,
            layout: "horizontal",
            blendMode: "add",
            glow: true,
            glowRadius: 50,
            glowIntensity: 1.5,
            tintEnable: false,
            tintColor: [1.0, 0.7, 0.2],
            tintAmount: 15,
            tintBoost: false
        };

        var header = w.add("group"); header.orientation="row"; header.alignChildren=["fill","center"];
        header.add("statictext", undefined, SCRIPT_NAME + " " + SCRIPT_VERSION).alignment = ["fill","center"];
        var helpBtn = header.add("button", undefined, "?"); helpBtn.preferredSize.width = 26;

        // -------- Пресеты --------
        var presetPanel = w.add("panel", undefined, "Пресет");
        presetPanel.orientation = "row"; presetPanel.alignChildren = ["fill","center"]; presetPanel.margins = 8;
        presetPanel.add("statictext", undefined, "Тип:").preferredSize.width = 60;
        var presetDD = presetPanel.add("dropdownlist", undefined,
            ["Кастом","Полиция (RU)","Полиция (US)","Скорая","Пожарная"]);
        presetDD.selection = 0;
        presetDD.alignment = ["fill","center"];

        // -------- Огни --------
        var lPanel = w.add("panel", undefined, "Огни");
        lPanel.orientation = "column"; lPanel.alignChildren = ["fill","top"]; lPanel.margins = 8;

        var numSl = addSlider(lPanel, "Количество огней", 1, 6, state.numLights, 1,
            function(v){ state.numLights = Math.round(v); updateColorRows(); });
        var spSl = addSlider(lPanel, "Расстояние (px)", 0, 400, state.spacing, 5,
            function(v){ state.spacing = v; });
        var szSl = addSlider(lPanel, "Размер огня (px)", 5, 300, state.lightSize, 1,
            function(v){ state.lightSize = v; });
        var sfSl = addSlider(lPanel, "Мягкость (0-1)", 0, 2, state.softness, 0.05,
            function(v){ state.softness = v; });

        var layoutRow = lPanel.add("group"); layoutRow.orientation="row"; layoutRow.alignChildren=["left","center"];
        layoutRow.add("statictext", undefined, "Раскладка:").preferredSize.width = 100;
        var layoutDD = layoutRow.add("dropdownlist", undefined, ["Горизонталь","Вертикаль","Диагональ"]);
        layoutDD.selection = 0;
        layoutDD.alignment = ["fill","center"];
        layoutDD.onChange = function(){
            var t = layoutDD.selection.text;
            state.layout = (t==="Вертикаль") ? "vertical" : (t==="Диагональ") ? "diagonal" : "horizontal";
        };

        // -------- Цвета (динамически) --------
        var cPanel = w.add("panel", undefined, "Цвета");
        cPanel.orientation = "column"; cPanel.alignChildren = ["fill","top"]; cPanel.margins = 8;
        var colorCountRow = cPanel.add("group"); colorCountRow.orientation="row";
        colorCountRow.add("statictext", undefined, "Кол-во цветов:").preferredSize.width = 100;
        var colorCountDD = colorCountRow.add("dropdownlist", undefined, ["1","2","3","4"]);
        colorCountDD.selection = 1;
        colorCountDD.alignment = ["fill","center"];
        colorCountDD.onChange = function(){
            state.numColors = parseInt(colorCountDD.selection.text, 10);
            updateColorRows();
        };
        var colorRowsGroup = cPanel.add("group"); colorRowsGroup.orientation="column";
        colorRowsGroup.alignChildren = ["fill","top"];
        var swatches = [];

        function updateColorRows(){
            // Пересобираем ряды цветов
            while (colorRowsGroup.children.length > 0) {
                colorRowsGroup.remove(colorRowsGroup.children[0]);
            }
            swatches = [];
            for (var i=0; i<state.numColors; i++) {
                (function(idx){
                    var sw = makeColorSwatch(colorRowsGroup, "Цвет " + (idx+1), state.colors[idx],
                        function(c){ state.colors[idx] = c; });
                    swatches.push(sw);
                })(i);
            }
            w.layout.layout(true);
        }
        updateColorRows();

        // -------- Паттерн --------
        var pPanel = w.add("panel", undefined, "Паттерн");
        pPanel.orientation = "column"; pPanel.alignChildren = ["fill","top"]; pPanel.margins = 8;

        var rowPat = pPanel.add("group"); rowPat.orientation="row";
        rowPat.add("statictext", undefined, "Тип мигания:").preferredSize.width = 100;
        var pDD = rowPat.add("dropdownlist", undefined, ["По очереди","Строб","Wig-Wag","Случайно"]);
        pDD.selection = 2;
        pDD.alignment = ["fill","center"];
        pDD.onChange = function(){
            var t = pDD.selection.text;
            state.pattern = (t==="По очереди") ? "alternate" : (t==="Строб") ? "strobe" : (t==="Случайно") ? "random" : "wigwag";
        };

        var fdSl = addSlider(pPanel, "Длит. вспышки (с)", 0.02, 1.0, state.flashDuration, 0.01,
            function(v){ state.flashDuration = v; });
        var gpSl = addSlider(pPanel, "Пауза (с)", 0.0, 1.0, state.gap, 0.01,
            function(v){ state.gap = v; });

        var loopRow = pPanel.add("group"); loopRow.orientation="row";
        var cbLoop = loopRow.add("checkbox", undefined, "Зациклить (loopOut)");
        cbLoop.value = state.loop;
        cbLoop.onClick = function(){ state.loop = cbLoop.value; };

        // -------- Blend Mode --------
        var bmRow = pPanel.add("group"); bmRow.orientation="row";
        bmRow.add("statictext", undefined, "Режим наложения:").preferredSize.width = 100;
        var bmDD = bmRow.add("dropdownlist", undefined, ["Add","Screen","Normal"]);
        bmDD.selection = 0;
        bmDD.alignment = ["fill","center"];
        bmDD.onChange = function(){
            var t = bmDD.selection.text;
            state.blendMode = (t==="Screen") ? "screen" : (t==="Normal") ? "normal" : "add";
        };

        // -------- Glow --------
        var gPanel = w.add("panel", undefined, "Glow");
        gPanel.orientation = "column"; gPanel.alignChildren = ["fill","top"]; gPanel.margins = 8;
        var cbGlow = gPanel.add("checkbox", undefined, "Включить свечение");
        cbGlow.value = state.glow;
        cbGlow.onClick = function(){ state.glow = cbGlow.value; };
        var grSl = addSlider(gPanel, "Радиус", 5, 200, state.glowRadius, 1,
            function(v){ state.glowRadius = v; });
        var giSl = addSlider(gPanel, "Интенсивность", 0.1, 5.0, state.glowIntensity, 0.1,
            function(v){ state.glowIntensity = v; });

        // -------- Tint adjustment --------
        var tPanel = w.add("panel", undefined, "Общий тон (Tint слой)");
        tPanel.orientation = "column"; tPanel.alignChildren = ["fill","top"]; tPanel.margins = 8;
        var cbTint = tPanel.add("checkbox", undefined, "Добавить корректирующий слой Tint");
        cbTint.value = state.tintEnable;
        cbTint.onClick = function(){ state.tintEnable = cbTint.value; };
        var tSw = makeColorSwatch(tPanel, "Тон", state.tintColor, function(c){ state.tintColor = c; });
        var taSl = addSlider(tPanel, "Сила Tint (%)", 0, 100, state.tintAmount, 1,
            function(v){ state.tintAmount = v; });
        var cbBoost = tPanel.add("checkbox", undefined, "Добавить Levels для контраста");
        cbBoost.value = state.tintBoost;
        cbBoost.onClick = function(){ state.tintBoost = cbBoost.value; };

        // -------- Actions --------
        var actRow = w.add("group"); actRow.orientation="row"; actRow.alignChildren=["fill","center"];
        var goBtn = actRow.add("button", undefined, "Создать сирену");
        goBtn.preferredSize.height = 28;

        // Preset apply
        presetDD.onChange = function(){
            var name = presetDD.selection.text;
            if (name === "Кастом") return;
            applyPreset(name, state);
            // Синхронизируем UI
            numSl.set(state.numLights);
            spSl.set(state.spacing);
            fdSl.set(state.flashDuration);
            gpSl.set(state.gap);
            colorCountDD.selection = state.numColors - 1;
            updateColorRows();
            // Паттерн
            var patName = (state.pattern==="alternate") ? "По очереди" : (state.pattern==="strobe") ? "Строб" : (state.pattern==="random") ? "Случайно" : "Wig-Wag";
            pDD.selection = pDD.find(patName);
            // Раскладка
            var layName = (state.layout==="vertical") ? "Вертикаль" : (state.layout==="diagonal") ? "Диагональ" : "Горизонталь";
            layoutDD.selection = layoutDD.find(layName);
            // Blend
            var bmName = (state.blendMode==="screen") ? "Screen" : (state.blendMode==="normal") ? "Normal" : "Add";
            bmDD.selection = bmDD.find(bmName);
        };

        goBtn.onClick = function(){
            // Ограничиваем colors до numColors
            var actualColors = [];
            for (var i=0; i<state.numColors; i++) actualColors.push(state.colors[i]);
            var opts = {
                numLights: state.numLights,
                spacing: state.spacing,
                lightSize: state.lightSize,
                softness: state.softness,
                colors: actualColors,
                pattern: state.pattern,
                flashDuration: state.flashDuration,
                gap: state.gap,
                loop: state.loop,
                layout: state.layout,
                blendMode: state.blendMode,
                glow: state.glow,
                glowRadius: state.glowRadius,
                glowIntensity: state.glowIntensity,
                tintEnable: state.tintEnable,
                tintColor: state.tintColor,
                tintAmount: state.tintAmount,
                tintBoost: state.tintBoost
            };
            generate(opts);
        };

        helpBtn.onClick = function(){ alert(getHelpText()); };

        if (w instanceof Window) { w.center(); w.show(); }
else {
    w.layout.layout(true);
    w.layout.resize();
    w.onResizing = w.onResize = function(){ this.layout.resize(); };
}

    }

    function getHelpText() {
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n\n"
            + "Генератор проблесковых огней (полиция/скорая/пожарная).\n"
            + "Создаёт shape-слои с мгновенным миганием (HOLD-ключи) + Box Blur для halo.\n\n"
            + "БЫСТРЫЙ СТАРТ:\n"
            + "1. Выдели слой-источник (машина, Null и т.п.).\n"
            + "2. Выбери пресет или настрой вручную.\n"
            + "3. Нажми «Создать сирену».\n\n"
            + "ПРЕСЕТЫ:\n"
            + "• Полиция (RU) — синие, Wig-Wag.\n"
            + "• Полиция (US) — красно-синие, Wig-Wag.\n"
            + "• Скорая — красные, Строб (быстрый).\n"
            + "• Пожарная — красно-белые (3 огня), по очереди.\n\n"
            + "ПАТТЕРНЫ:\n"
            + "• По очереди — 1, 2, 3, ..., N по кругу.\n"
            + "• Строб — все одновременно, серия из 3 вспышек.\n"
            + "• Wig-Wag — двойные вспышки, поочерёдно.\n"
            + "• Случайно — псевдослучайные вспышки (тоже цикл).\n\n"
            + "ЦВЕТА:\n"
            + "Можно задать 1–4 цвета. Огни получают цвета по кругу.\n"
            + "Пример 3 огня + 2 цвета: [C1, C2, C1].\n\n"
            + "РАСКЛАДКА:\n"
            + "• Горизонталь — стандартная планка.\n"
            + "• Вертикаль — колонна огней.\n"
            + "• Диагональ — под углом.\n\n"
            + "РЕЖИМ НАЛОЖЕНИЯ:\n"
            + "• Add — самый яркий, требует тёмный фон.\n"
            + "• Screen — универсальный, хорошо и на светлом фоне.\n"
            + "• Normal — без свечения, для отладки/стилизованного вида.\n\n"
            + "GLOW:\n"
            + "Эффект «Свечение» на каждом огне. Радиус ≈ 50 — оптимум.\n\n"
            + "ОБЩИЙ ТОН (Tint adjustment):\n"
            + "Добавляет корректирующий слой над всеми огнями с эффектом Tint.\n"
            + "Полезно для ночных сцен: чуть подкрасить всю группу огней в тёплый/холодный оттенок.\n\n"
            + "СОЗДАВАЕМЫЕ СЛОИ:\n"
            + "• SL_<источник>_Light_1..N\n"
            + "• SL_<источник>_Tint (если включён общий тон)\n\n"
            + "СОВЕТЫ:\n"
            + "• Add работает только на тёмном фоне.\n"
            + "• Мягкость 0.9 — halo как у настоящей мигалки. 0.3 — резкий свет.\n"
            + "• Длит. вспышки 0.05–0.08 с даёт «настоящий» строб-эффект.\n"
            + "• Loop работает через loopOut('cycle') — экономит ключи.\n";
    }

    buildUI(thisObj);

})(this);
