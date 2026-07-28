// ============================================================
// ptp_ColorBatch.jsx
// Batch recoloring for shape/solid/text layers
// Version: 1.1
// Install: Adobe After Effects/Support Files/Scripts/ScriptUI Panels/
// Open:    Window → ptp_ColorBatch.jsx
// ============================================================
// v1.1 changelog:
//   • Fix: Fill/Stroke Color через matchName (не англ.-only)
//   • Fix: Hue/Saturation через display name Master Hue с fallback
//   • Fix: forEachShapeColorProp корректно останавливается при !allOccurrences
//   • Feature: Save/Load Palette через app.settings (сохраняется между сессиями)
//   • Feature: Randomize palette кнопка
//   • UI: scroll для palette при 5+ цветах
//   • UI: полный перевод на русский
//   • Help: предупреждения о shared Solid и порядке selectedLayers

(function (thisObj) {
    var SCRIPT_NAME = "ptp_ColorBatch";
    var SCRIPT_VERSION = "v1.1";
    var SETTINGS_SECTION = "ptp_ColorBatch";
    var SETTINGS_PALETTE_KEY = "palette_v1";

    var COL_ACCENT = [1.00, 0.55, 0.10];

    // ============================================================
    // HELPERS
    // ============================================================
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Откройте композицию."); return null; }
        return c;
    }
    function getSelLayers() {
        var c = getComp(); if (!c) return [];
        var sel = c.selectedLayers;
        if (!sel || sel.length === 0) { alert("Выделите хотя бы один слой."); return []; }
        return sel;
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

    // RGB ↔ HSL
    function rgbToHsl(rgb) {
        var r=rgb[0],g=rgb[1],b=rgb[2];
        var mx=Math.max(r,g,b),mn=Math.min(r,g,b);
        var h,s,l=(mx+mn)/2;
        if (mx===mn) { h=0; s=0; }
        else {
            var d=mx-mn;
            s=l>0.5?d/(2-mx-mn):d/(mx+mn);
            switch(mx){
                case r: h=(g-b)/d+(g<b?6:0); break;
                case g: h=(b-r)/d+2; break;
                case b: h=(r-g)/d+4; break;
            }
            h/=6;
        }
        return [h,s,l];
    }
    function hslToRgb(hsl) {
        var h=hsl[0],s=hsl[1],l=hsl[2];
        function hue2rgb(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }
        var r,g,b;
        if (s===0) { r=g=b=l; }
        else {
            var q=l<0.5?l*(1+s):l+s-l*s;
            var p=2*l-q;
            r=hue2rgb(p,q,h+1/3);
            g=hue2rgb(p,q,h);
            b=hue2rgb(p,q,h-1/3);
        }
        return [r,g,b];
    }
    function shiftHue(rgb, degrees) {
        var hsl = rgbToHsl(rgb);
        hsl[0] = (hsl[0] + degrees/360) % 1;
        if (hsl[0] < 0) hsl[0] += 1;
        return hslToRgb(hsl);
    }

    // ============================================================
    // SETTINGS (Save/Load Palette)
    // ============================================================
    function savePaletteToSettings(palette) {
        try {
            var arr = [];
            for (var i = 0; i < palette.length; i++) arr.push(rgbToHex(palette[i]));
            app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_PALETTE_KEY, arr.join(","));
        } catch(e) {}
    }
    function loadPaletteFromSettings() {
        try {
            if (!app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_PALETTE_KEY)) return null;
            var str = app.settings.getSetting(SETTINGS_SECTION, SETTINGS_PALETTE_KEY);
            if (!str) return null;
            var hexes = str.split(",");
            var out = [];
            for (var i = 0; i < hexes.length; i++) {
                var rgb = hexToRgb(hexes[i]);
                if (rgb) out.push(rgb);
            }
            return out.length > 0 ? out : null;
        } catch(e) { return null; }
    }

    // ============================================================
    // LAYER COLOR ACCESS
    // ============================================================

    // Iterate all Fill/Stroke properties inside a Shape Layer.
    // Uses matchName for cross-locale compatibility.
    // Returns true if walking was aborted early (!allOccurrences flag).
    function forEachShapeColorProp(layer, kind, allOccurrences, fn) {
        // matchName для color properties
        var effectMN = (kind === "Fill") ? "ADBE Vector Graphic - Fill"  : "ADBE Vector Graphic - Stroke";
        var colorMN  = (kind === "Fill") ? "ADBE Vector Fill Color"      : "ADBE Vector Stroke Color";

        var abort = { done: false }; // shared flag через closure

        function walk(group) {
            for (var i = 1; i <= group.numProperties; i++) {
                if (abort.done) return;
                var p = group.property(i);
                if (!p) continue;
                if (p.matchName === "ADBE Vector Group") {
                    var inner = p.property("ADBE Vectors Group");
                    if (inner) walk(inner);
                } else if (p.matchName === effectMN) {
                    var colorProp = null;
                    try { colorProp = p.property(colorMN); } catch(e) {}
                    if (colorProp) {
                        fn(colorProp);
                        if (!allOccurrences) { abort.done = true; return; }
                    }
                }
            }
        }
        try {
            var contents = layer.property("ADBE Root Vectors Group");
            if (contents) walk(contents);
        } catch(e) {}
    }

    // Читает цвет reference-слоя (первого выделенного) — берёт первый доступный.
    function getReferenceColor(layer) {
        try {
            if (layer instanceof ShapeLayer) {
                var found = null;
                forEachShapeColorProp(layer, "Fill", false, function(p){ found = p.value; });
                if (found) return [found[0], found[1], found[2]];
                forEachShapeColorProp(layer, "Stroke", false, function(p){ found = p.value; });
                if (found) return [found[0], found[1], found[2]];
            }
            if (layer instanceof TextLayer) {
                var td = layer.property("Source Text").value;
                if (td && td.fillColor) return [td.fillColor[0], td.fillColor[1], td.fillColor[2]];
            }
            if (layer.source && layer.source.mainSource && layer.source.mainSource instanceof SolidSource) {
                var c = layer.source.mainSource.color;
                return [c[0], c[1], c[2]];
            }
        } catch(e) {}
        return null;
    }

    // ============================================================
    // APPLY COLOR
    // ============================================================
    function applyColorToLayer(layer, color, scope, destructive) {
        var did = false;
        try {
            if (layer instanceof ShapeLayer) {
                if (scope.fill) {
                    forEachShapeColorProp(layer, "Fill", scope.allOccurrences, function(p){
                        try { p.setValue([color[0], color[1], color[2], 1]); did = true; } catch(e){}
                    });
                }
                if (scope.stroke) {
                    forEachShapeColorProp(layer, "Stroke", scope.allOccurrences, function(p){
                        try { p.setValue([color[0], color[1], color[2], 1]); did = true; } catch(e){}
                    });
                }
            }
            else if (layer instanceof TextLayer && scope.text) {
                var td = layer.property("Source Text").value;
                td.applyFill = true;
                td.fillColor = [color[0], color[1], color[2]];
                layer.property("Source Text").setValue(td);
                did = true;
            }
            else if (scope.solid && layer.source && layer.source.mainSource && layer.source.mainSource instanceof SolidSource) {
                layer.source.mainSource.color = [color[0], color[1], color[2]];
                did = true;
            }
        } catch(e){}
        return did;
    }

    function applyHueShift(layer, degrees, scope, destructive) {
        if (destructive) {
            if (layer instanceof ShapeLayer) {
                if (scope.fill) {
                    forEachShapeColorProp(layer, "Fill", scope.allOccurrences, function(p){
                        try {
                            var cur = p.value;
                            var shifted = shiftHue([cur[0],cur[1],cur[2]], degrees);
                            p.setValue([shifted[0], shifted[1], shifted[2], cur[3] || 1]);
                        } catch(e){}
                    });
                }
                if (scope.stroke) {
                    forEachShapeColorProp(layer, "Stroke", scope.allOccurrences, function(p){
                        try {
                            var cur2 = p.value;
                            var sh2 = shiftHue([cur2[0],cur2[1],cur2[2]], degrees);
                            p.setValue([sh2[0], sh2[1], sh2[2], cur2[3] || 1]);
                        } catch(e){}
                    });
                }
            }
            else if (layer instanceof TextLayer && scope.text) {
                try {
                    var td = layer.property("Source Text").value;
                    if (td.fillColor) {
                        var sh = shiftHue([td.fillColor[0],td.fillColor[1],td.fillColor[2]], degrees);
                        td.fillColor = sh;
                        layer.property("Source Text").setValue(td);
                    }
                } catch(e){}
            }
            else if (scope.solid && layer.source && layer.source.mainSource && layer.source.mainSource instanceof SolidSource) {
                try {
                    var c = layer.source.mainSource.color;
                    var sh3 = shiftHue([c[0],c[1],c[2]], degrees);
                    layer.source.mainSource.color = sh3;
                } catch(e){}
            }
        } else {
            // Non-destructive: Hue/Saturation effect
            try {
                var fx = layer.property("Effects").addProperty("ADBE HUE SATURATION");
                // Master Hue — пробуем display name, fallback по индексам
                var hueProp = null;
                try { hueProp = fx.property("Master Hue"); } catch(e){}
                if (!hueProp) {
                    // индексы Hue/Saturation в разных AE:
                    // (1) Channel Control, (2) Channel Range, (3) Master Hue,
                    // (4) Master Lightness, (5) Master Saturation
                    var candidates = [3, 2, 4];
                    for (var ci = 0; ci < candidates.length; ci++) {
                        try {
                            var candProp = fx.property(candidates[ci]);
                            if (candProp && candProp.name.toLowerCase().indexOf("hue") >= 0) {
                                hueProp = candProp;
                                break;
                            }
                        } catch(e){}
                    }
                }
                if (hueProp) hueProp.setValue(degrees);
                else alert("Не удалось найти Master Hue в эффекте Hue/Saturation на слое '" + layer.name + "'.");
            } catch(e){
                alert("Не удалось добавить Hue/Saturation к слою '" + layer.name + "'.");
            }
        }
    }

    // ============================================================
    // OPERATIONS
    // ============================================================
    function opSetSingle(sel, color, scope) {
        for (var i = 0; i < sel.length; i++) applyColorToLayer(sel[i], color, scope, true);
    }

    function opSetBoth(sel, fillColor, strokeColor, scope) {
        var fScope = { fill:true, stroke:false, solid:scope.solid, text:scope.text, allOccurrences:scope.allOccurrences };
        var sScope = { fill:false, stroke:true, solid:false, text:false, allOccurrences:scope.allOccurrences };
        for (var i = 0; i < sel.length; i++) {
            applyColorToLayer(sel[i], fillColor, fScope, true);
            applyColorToLayer(sel[i], strokeColor, sScope, true);
        }
    }

    function opSwap(sel, scope) {
        for (var i = 0; i < sel.length; i++) {
            var lyr = sel[i];
            if (!(lyr instanceof ShapeLayer)) continue;
            var fillProp = null, strokeProp = null;
            forEachShapeColorProp(lyr, "Fill", false, function(p){ fillProp = p; });
            forEachShapeColorProp(lyr, "Stroke", false, function(p){ strokeProp = p; });
            if (fillProp && strokeProp) {
                try {
                    var fv = fillProp.value, sv = strokeProp.value;
                    fillProp.setValue(sv);
                    strokeProp.setValue(fv);
                } catch(e){}
            }
        }
    }

    function opPalette(sel, palette, mode, scope) {
        if (palette.length === 0) { alert("Палитра пуста."); return; }
        var n = sel.length;
        var order = [];
        if (mode === "cyclic") {
            for (var i = 0; i < n; i++) order.push(i % palette.length);
        } else if (mode === "random") {
            for (var j = 0; j < n; j++) order.push(Math.floor(Math.random() * palette.length));
        } else if (mode === "byX" || mode === "byY") {
            var dimIdx = (mode === "byX") ? 0 : 1;
            var arr = [];
            for (var k = 0; k < n; k++) {
                var p = sel[k].property("Transform").property("Position").value;
                arr.push({ idx: k, v: p[dimIdx] });
            }
            arr.sort(function(a,b){ return a.v - b.v; });
            order.length = n;
            for (var m = 0; m < n; m++) {
                var rank = m / Math.max(1, n - 1);
                var palIdx = Math.min(palette.length - 1, Math.floor(rank * palette.length));
                order[arr[m].idx] = palIdx;
            }
        }
        for (var q = 0; q < n; q++) {
            applyColorToLayer(sel[q], palette[order[q]], scope, true);
        }
    }

    function opHueShift(sel, degrees, scope, destructive) {
        for (var i = 0; i < sel.length; i++) applyHueShift(sel[i], degrees, scope, destructive);
    }

    function opTintByReference(sel, scope) {
        if (sel.length < 2) { alert("Выделите минимум 2 слоя (верхний = reference)."); return; }
        var ref = getReferenceColor(sel[0]);
        if (!ref) { alert("Не удалось прочитать цвет reference-слоя '" + sel[0].name + "'."); return; }
        for (var i = 1; i < sel.length; i++) applyColorToLayer(sel[i], ref, scope, true);
    }

    // ============================================================
    // UI HELPERS
    // ============================================================
    function divider(parent) {
        var d = parent.add("panel");
        d.alignment = ["fill","top"];
        d.preferredSize.height = 2;
    }

    function makeColorSwatch(parent, initialColor, onChange) {
        var grp = parent.add("group");
        grp.orientation = "row";
        grp.spacing = 4;
        var sw = grp.add("button", undefined, "");
        sw.preferredSize = [30, 22];
        sw._color = initialColor.slice();
        sw.fillBrush = sw.graphics.newBrush(sw.graphics.BrushType.SOLID_COLOR, sw._color);
        sw.onDraw = function(){
            sw.graphics.rectPath(0, 0, sw.size.width, sw.size.height);
            sw.graphics.fillPath(sw.fillBrush);
        };
        var hex = grp.add("edittext", undefined, rgbToHex(initialColor));
        hex.preferredSize.width = 70;

        function updateFromRgb(rgb) {
            sw._color = rgb.slice();
            sw.fillBrush = sw.graphics.newBrush(sw.graphics.BrushType.SOLID_COLOR, sw._color);
            sw.notify("onDraw");
            hex.text = rgbToHex(sw._color);
            if (onChange) onChange(sw._color);
        }
        sw.onClick = function(){
            var c = $.colorPicker();
            if (c < 0) return;
            var r = ((c>>16)&0xFF)/255, g=((c>>8)&0xFF)/255, b=(c&0xFF)/255;
            updateFromRgb([r,g,b]);
        };
        hex.onChange = function(){
            var rgb = hexToRgb(hex.text);
            if (rgb) updateFromRgb(rgb);
            else hex.text = rgbToHex(sw._color);
        };
        grp._getColor = function(){ return sw._color; };
        grp._setColor = function(c){ updateFromRgb(c); };
        return grp;
    }

    // ============================================================
    // UI
    // ============================================================
    function buildUI(thisObj) {
        var savedPalette = loadPaletteFromSettings();
        var defaultPalette = savedPalette || [[0.9,0.2,0.2],[0.2,0.4,0.9],[1.0,0.85,0.15]];

        var state = {
            singleColor: [1.0, 0.55, 0.10],
            fillColor:   [1.0, 0.55, 0.10],
            strokeColor: [0.15,0.15,0.15],
            palette:     defaultPalette,
            paletteMode: "cyclic",
            hueShift:    30,
            hueDestructive: true,
            scope: { fill:true, stroke:false, solid:true, text:true, allOccurrences:false }
        };

        var w = (thisObj instanceof Panel) ? thisObj
              : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, {resizeable:true});
        w.orientation = "column";
        w.alignChildren = ["fill","top"];
        w.spacing = 6;
        w.margins = 8;
        if (w instanceof Window) {
    w.preferredSize = [340, 520];
    w.minimumSize = [320, 480];
} else {
    // Для docked panel — просим минимум 260px
    try { w.minimumSize = [260, 400]; } catch(e){}
}

          // -------- Apply to (scope) --------
        var scopePanel = w.add("panel", undefined, "Применять к");
        scopePanel.orientation = "column";
        scopePanel.alignChildren = ["fill","top"];
        scopePanel.margins = 8;

        var sRow1 = scopePanel.add("group"); sRow1.orientation = "row"; sRow1.spacing = 8;
        var cbFill   = sRow1.add("checkbox", undefined, "Fill");   cbFill.value = state.scope.fill;
        var cbStroke = sRow1.add("checkbox", undefined, "Stroke"); cbStroke.value = state.scope.stroke;
        var cbSolid  = sRow1.add("checkbox", undefined, "Solid");  cbSolid.value = state.scope.solid;
        var cbText   = sRow1.add("checkbox", undefined, "Text");   cbText.value = state.scope.text;

        var cbAll    = scopePanel.add("checkbox", undefined, "Все Fill/Stroke");
        cbAll.value = state.scope.allOccurrences;
        cbAll.helpTip = "Обрабатывать все Fill/Stroke в слое, а не только первый";

        function readScope() {
            return {
                fill: cbFill.value,
                stroke: cbStroke.value,
                solid: cbSolid.value,
                text: cbText.value,
                allOccurrences: cbAll.value
            };
        }

        // -------- Operation --------
        var opPanel = w.add("panel", undefined, "Операция");
        opPanel.orientation = "column"; opPanel.alignChildren = ["fill","top"]; opPanel.margins = 8;
        var opDD = opPanel.add("dropdownlist", undefined, [
            "Single Color",
            "Fill + Stroke",
            "Swap Fill ↔ Stroke",
            "Apply Palette",
            "Hue Shift",
            "Tint by Reference"
        ]);
        opDD.selection = 0;

        // -------- Parameters panel (dynamic) --------
        var paramsPanel = w.add("panel", undefined, "Параметры");
        paramsPanel.orientation = "column";
        paramsPanel.alignChildren = ["fill","top"];
        paramsPanel.margins = 8;

        function clearParams() {
            while (paramsPanel.children.length > 0) paramsPanel.remove(paramsPanel.children[0]);
        }

        function buildParamsForOp() {
            clearParams();
            var idx = opDD.selection.index;

                        if (idx === 0) { // Single Color
                var g = paramsPanel.add("group"); g.orientation = "row";
                var lbl = g.add("statictext", undefined, "Цвет:"); lbl.preferredSize.width = 40;
                var sw = makeColorSwatch(g, state.singleColor, function(c){ state.singleColor = c; });
            }
            else if (idx === 1) { // Fill + Stroke
                var g1 = paramsPanel.add("group"); g1.orientation = "row";
                var l1 = g1.add("statictext", undefined, "Fill:"); l1.preferredSize.width = 40;
                makeColorSwatch(g1, state.fillColor, function(c){ state.fillColor = c; });
                var g2 = paramsPanel.add("group"); g2.orientation = "row";
                var l2 = g2.add("statictext", undefined, "Stroke:"); l2.preferredSize.width = 40;
                makeColorSwatch(g2, state.strokeColor, function(c){ state.strokeColor = c; });
            }

            else if (idx === 2) { // Swap
                var info = paramsPanel.add("statictext", undefined,
                    "Меняет местами первый Fill ↔ первый Stroke на каждом Shape-слое.",
                    {multiline:true});
                info.preferredSize.height = 32;
            }
             else if (idx === 3) { // Palette
                var modeRow = paramsPanel.add("group"); modeRow.orientation = "row";
                var ml = modeRow.add("statictext", undefined, "Режим:"); ml.preferredSize.width = 50;
                var modeDD = modeRow.add("dropdownlist", undefined, ["cyclic","random","byX","byY"]);
                modeDD.selection = modeDD.find(state.paletteMode) || modeDD.items[0];
                modeDD.onChange = function(){ state.paletteMode = modeDD.selection.text; };

                var palBox = paramsPanel.add("panel", undefined, "Палитра");
                palBox.orientation = "column";
                palBox.alignChildren = ["fill","top"];
                palBox.margins = 6;

                // Scroll wrapper — при >5 цветах появится вертикальный список фикс. высоты
                var scrollGroup = palBox.add("group");
                scrollGroup.orientation = "column";
                scrollGroup.alignChildren = ["fill","top"];
                scrollGroup.maximumSize.height = 160; // ограничитель

                var listGrp = scrollGroup.add("group");
                listGrp.orientation = "column";
                listGrp.alignChildren = ["left","top"];

                function refreshList() {
                    while (listGrp.children.length > 0) listGrp.remove(listGrp.children[0]);
                    for (var i = 0; i < state.palette.length; i++) {
                        (function(idx2){
                            var row = listGrp.add("group");
                            row.orientation = "row";
                            row.spacing = 4;
                            var numLbl = row.add("statictext", undefined, (idx2+1) + ":");
                            numLbl.preferredSize.width = 20;
                            var sw = makeColorSwatch(row, state.palette[idx2], function(c){
                                state.palette[idx2] = c;
                                savePaletteToSettings(state.palette);
                            });
                            var del = row.add("button", undefined, "−");
                            del.preferredSize = [22, 22];
                            del.onClick = function(){
                                state.palette.splice(idx2, 1);
                                savePaletteToSettings(state.palette);
                                refreshList();
                                w.layout.layout(true);
                            };
                        })(i);
                    }
                }
                refreshList();

                var btnRow = palBox.add("group");
                btnRow.orientation = "row";
                btnRow.alignment = ["fill","top"];
                var addBtn = btnRow.add("button", undefined, "+ Цвет");
                addBtn.onClick = function(){
                    state.palette.push([Math.random(), Math.random(), Math.random()]);
                    savePaletteToSettings(state.palette);
                    refreshList();
                    w.layout.layout(true);
                };
                var randBtn = btnRow.add("button", undefined, "🎲 Randomize");
                randBtn.onClick = function(){
                    for (var i = 0; i < state.palette.length; i++) {
                        state.palette[i] = [Math.random(), Math.random(), Math.random()];
                    }
                    savePaletteToSettings(state.palette);
                    refreshList();
                    w.layout.layout(true);
                };
                var clearBtn = btnRow.add("button", undefined, "Clear");
                clearBtn.onClick = function(){
                    state.palette = [];
                    savePaletteToSettings(state.palette);
                    refreshList();
                    w.layout.layout(true);
                };
            }
            else if (idx === 4) { // Hue Shift
                var deg = paramsPanel.add("group"); deg.orientation = "row";
                var dl = deg.add("statictext", undefined, "Сдвиг:"); dl.preferredSize.width = 50;
                var dSld = deg.add("slider", undefined, state.hueShift, -180, 180);
                dSld.preferredSize.width = 100;
                var dBox = deg.add("edittext", undefined, String(state.hueShift));
                dBox.preferredSize.width = 40;
                dSld.onChanging = function(){
                    var v = Math.round(dSld.value);
                    dBox.text = String(v);
                    state.hueShift = v;
                };
                dBox.onChange = function(){
                    var v = parseFloat(dBox.text);
                    if (isNaN(v)) return;
                    v = clamp(v, -180, 180);
                    dSld.value = v;
                    dBox.text = String(Math.round(v));
                    state.hueShift = v;
                };
                var modeR = paramsPanel.add("group"); modeR.orientation = "row";
                var modeL = modeR.add("statictext", undefined, ""); modeL.preferredSize.width = 80;
                var cbDest = modeR.add("checkbox", undefined, "Destructive (менять исходные цвета)");
                cbDest.value = state.hueDestructive;
                cbDest.onClick = function(){ state.hueDestructive = cbDest.value; };
            }
            else if (idx === 5) { // Tint by Reference
                var info2 = paramsPanel.add("statictext", undefined,
                    "Первый выделенный слой = источник цвета.\nВсе остальные будут перекрашены в его цвет.\n(Порядок selectedLayers = сверху вниз в timeline.)",
                    {multiline:true});
                info2.preferredSize.height = 50;
                info2.graphics.foregroundColor = info2.graphics.newPen(info2.graphics.PenType.SOLID_COLOR, [0.6,0.6,0.6], 1);
            }

            w.layout.layout(true);
        }

        opDD.onChange = buildParamsForOp;
        buildParamsForOp();

        divider(w);

        // -------- Apply / Help --------
        var btnRow = w.add("group");
        btnRow.orientation = "row";
        var btnApply = btnRow.add("button", undefined, "Apply");
        btnApply.preferredSize.height = 30;
        btnApply.alignment = ["fill","center"];
        var btnHelp = btnRow.add("button", undefined, "?");
        btnHelp.preferredSize.width = 28;

        btnApply.onClick = function(){
            var sel = getSelLayers();
            if (sel.length === 0) return;
            var idx = opDD.selection.index;
            var scope = readScope();

            app.beginUndoGroup(SCRIPT_NAME + ": " + opDD.selection.text);
            try {
                if (idx === 0)       opSetSingle(sel, state.singleColor, scope);
                else if (idx === 1)  opSetBoth(sel, state.fillColor, state.strokeColor, scope);
                else if (idx === 2)  opSwap(sel, scope);
                else if (idx === 3)  opPalette(sel, state.palette, state.paletteMode, scope);
                else if (idx === 4)  opHueShift(sel, state.hueShift, scope, state.hueDestructive);
                else if (idx === 5)  opTintByReference(sel, scope);
            } catch(err) {
                alert("Ошибка: " + err.toString());
            }
            app.endUndoGroup();
        };

        btnHelp.onClick = function(){ alert(getHelpText()); };

        if (w instanceof Window) { w.center(); w.show(); }
        else { w.layout.layout(true); w.layout.resize(); }
        return w;
    }

    function getHelpText() {
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n" +
            "Массовая перекраска выделенных слоёв.\n\n" +
            "═══ ПРИМЕНЯТЬ К ═══\n" +
            "• Shape Fill / Stroke — Fill/Stroke внутри Shape Layer.\n" +
            "• Solid — базовый цвет Solid-слоёв.\n" +
            "• Text — цвет заливки текста.\n" +
            "• Все Fill/Stroke — обрабатывать все, а не только первый в слое.\n\n" +
            "═══ ОПЕРАЦИИ ═══\n" +
            "• Single Color — один цвет на все выделенные слои.\n" +
            "• Fill + Stroke — два отдельных цвета (fill и stroke).\n" +
            "• Swap Fill ↔ Stroke — обмен цветов на каждом shape-слое.\n" +
            "• Apply Palette — раздать цвета из палитры:\n" +
            "    cyclic (1→2→3→1…), random, byX (слева направо), byY (сверху вниз).\n" +
            "• Hue Shift — сдвиг тона на N градусов.\n" +
            "    Destructive: меняет исходные цвета.\n" +
            "    Non-destructive: добавляет эффект Hue/Saturation.\n" +
            "• Tint by Reference — первый выделенный слой → цвет для всех остальных.\n\n" +
            "═══ ПАЛИТРА ═══\n" +
            "• Клик по swatch — color picker, или впиши HEX (#RRGGBB).\n" +
            "• + Цвет / − / Clear — добавить/удалить/очистить.\n" +
            "• 🎲 Randomize — случайные цвета для всех позиций палитры.\n" +
            "• Палитра автоматически сохраняется между сессиями AE.\n\n" +
            "═══ ВАЖНО ═══\n" +
            "• Solid-слои шарят source: если тот же Solid используется в других\n" +
            "  композициях, там цвет тоже изменится.\n" +
            "• Порядок selectedLayers в AE = сверху вниз в timeline\n" +
            "  (не порядок кликов). Для Tint by Reference верхний слой = источник.\n" +
            "• Undo (Ctrl/Cmd+Z) отменяет всю операцию одним шагом.\n" +
            "• Слой типа, не отмеченного в 'Применять к', пропускается.\n";
    }

    buildUI(thisObj);

})(this);
