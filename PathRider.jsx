// ptp_PathRider.jsx v1.1
// After Effects script — animate 3D model along 2D path with orientation
// Author: ptp
//
// v1.1 changelog:
//   • UI переведён на русский
//   • Feature: кнопка "Убрать Rider" — снимает expressions
//     с Position, Orientation/Rotation, Opacity, Scale выбранного target
//   • Feature: preview длительности под слайдерами
//     ("Модель видна: startT → endT")
//   • Fix: валидация — target должен быть 3D-слоем при
//     "Использовать Orientation" или axis rotation
//   • Fix: валидация — Duration > 0.01
//   • Fix: заменён emoji 🔄 на "↻" (стабильно рендерится)
//   • Убрано упоминание "Bake to Keys" из help (функция не реализована)

(function ptp_PathRider(thisObj) {
    var SCRIPT_NAME = "ptp_PathRider";
    var SCRIPT_VERSION = "v1.1";
    var LAYER_PREFIX = "PR_";

    // ---------- helpers ----------
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Откройте композицию."); return null; }
        return c;
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }

    // Collect all paths in comp: masks + shape paths
    function collectPaths(comp) {
        var out = [];
        if (!comp) return out;
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            try {
                var mg = L.property("ADBE Mask Parade");
                if (mg) {
                    for (var m = 1; m <= mg.numProperties; m++) {
                        var mk = mg.property(m);
                        out.push({
                            label: L.name + " › " + mk.name + " (маска)",
                            layerIndex: i,
                            kind: "mask",
                            maskIndex: m
                        });
                    }
                }
            } catch(e) {}
            if (L instanceof ShapeLayer) {
                try {
                    var root = L.property("ADBE Root Vectors Group");
                    scanShapeGroup(root, out, i, L.name, "");
                } catch(e) {}
            }
        }
        return out;
    }
    function scanShapeGroup(group, out, layerIdx, layerName, prefix) {
        if (!group) return;
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (!p) continue;
            if (p.matchName === "ADBE Vector Group") {
                var inner = p.property("ADBE Vectors Group");
                scanShapeGroup(inner, out, layerIdx, layerName, prefix + p.name + "/");
            } else if (p.matchName === "ADBE Vector Shape - Group") {
                out.push({
                    label: layerName + " › " + prefix + p.name + " (shape)",
                    layerIndex: layerIdx,
                    kind: "shape",
                    pathRef: p
                });
            }
        }
    }

    function buildPathSelector(pathInfo, comp) {
        var L = comp.layer(pathInfo.layerIndex);
        if (pathInfo.kind === "mask") {
            var mk = L.property("ADBE Mask Parade").property(pathInfo.maskIndex);
            return 'thisComp.layer("' + esc(L.name) + '").mask("' + esc(mk.name) + '").maskPath';
        } else {
            var chain = [];
            var p = pathInfo.pathRef;
            chain.unshift(p.name);
            var cur = p.parentProperty;
            while (cur) {
                if (cur.matchName === "ADBE Vector Group") chain.unshift(cur.name);
                if (cur.matchName === "ADBE Root Vectors Group") break;
                cur = cur.parentProperty;
            }
            var expr = 'thisComp.layer("' + esc(L.name) + '")';
            for (var i = 0; i < chain.length; i++) {
                expr += '.content("' + esc(chain[i]) + '")';
            }
            expr += '.path';
            return expr;
        }
    }

    // ---------- validation ----------
    function validateOpts(opts, comp) {
        if (!opts.pathInfo) { alert("Не выбран Source path."); return false; }
        if (!opts.targetLayer) { alert("Не выбран Target layer."); return false; }
        if (opts.duration < 0.01) { alert("Длительность должна быть > 0.01 сек."); return false; }
        if ((opts.useOrientation || opts.rotAxis) && !opts.targetLayer.threeDLayer) {
            var ok = confirm("Target-слой не 3D. Ориентация не будет работать.\n\nВключить 3D автоматически?");
            if (ok) {
                try { opts.targetLayer.threeDLayer = true; } catch(e){
                    alert("Не удалось включить 3D. Проверь тип слоя.");
                    return false;
                }
            } else {
                return false;
            }
        }
        return true;
    }

    // ---------- main generate ----------
    function generate(opts) {
        var comp = getComp(); if (!comp) return;
        if (!validateOpts(opts, comp)) return;

        var tgt = opts.targetLayer;
        var pathLayer = comp.layer(opts.pathInfo.layerIndex);
        var pathSel = buildPathSelector(opts.pathInfo, comp);

        var startT = comp.time + opts.startDelay;
        var dur = opts.duration;
        var loopFlag = opts.loop ? "true" : "false";
        var dirRev = (opts.direction === "reverse") ? "true" : "false";

        app.beginUndoGroup(SCRIPT_NAME + ": Create Rider");
        var step = "init";
        try {
            // ---- Position ----
            step = "position";
            var posExpr = ""
                + "var startT = " + startT.toFixed(4) + ";\n"
                + "var dur = " + dur.toFixed(4) + ";\n"
                + "var loop = " + loopFlag + ";\n"
                + "var rev = " + dirRev + ";\n"
                + "var pth = " + pathSel + ";\n"
                + "var pathLayer = thisComp.layer(\"" + esc(pathLayer.name) + "\");\n"
                + "var t = (time - startT) / dur;\n"
                + "if (loop) t = ((t % 1) + 1) % 1;\n"
                + "else t = Math.max(0, Math.min(1, t));\n"
                + "if (rev) t = 1 - t;\n"
                + "var ptLocal = pth.pointOnPath(t);\n"
                + "var ptComp = pathLayer.toComp(ptLocal);\n"
                + "var baseZ = value.length > 2 ? value[2] : 0;\n"
                + "[ptComp[0], ptComp[1], baseZ];";
            tgt.property("Transform").property("Position").expression = posExpr;

            // ---- Orientation / Rotation ----
            step = "orient";
            var samples = Math.max(1, Math.min(5, opts.smoothSamples));
            var fwdOff = opts.forwardOffset;
            var axis = opts.rotAxis;

            var tangentExpr = ""
                + "var startT = " + startT.toFixed(4) + ";\n"
                + "var dur = " + dur.toFixed(4) + ";\n"
                + "var loop = " + loopFlag + ";\n"
                + "var rev = " + dirRev + ";\n"
                + "var samples = " + samples + ";\n"
                + "var fwdOff = " + fwdOff + ";\n"
                + "var pth = " + pathSel + ";\n"
                + "var t = (time - startT) / dur;\n"
                + "if (loop) t = ((t % 1) + 1) % 1;\n"
                + "else t = Math.max(0, Math.min(1, t));\n"
                + "if (rev) t = 1 - t;\n"
                + "var sumX = 0, sumY = 0;\n"
                + "for (var i = 0; i < samples; i++) {\n"
                + "  var tt = Math.max(0, Math.min(0.9999, t + i * 0.001));\n"
                + "  var p1 = pth.pointOnPath(tt);\n"
                + "  var p2 = pth.pointOnPath(Math.min(0.9999, tt + 0.001));\n"
                + "  sumX += (p2[0] - p1[0]);\n"
                + "  sumY += (p2[1] - p1[1]);\n"
                + "}\n"
                + "var ang = radiansToDegrees(Math.atan2(sumY, sumX));\n"
                + "if (rev) ang += 180;\n"
                + "ang += fwdOff;\n";

            if (opts.useOrientation) {
                var orExpr = tangentExpr
                    + "var v = value;\n"
                    + "if (\"" + axis + "\" === \"X\") [ang, v[1], v[2]];\n"
                    + "else if (\"" + axis + "\" === \"Y\") [v[0], ang, v[2]];\n"
                    + "else [v[0], v[1], ang];";
                tgt.property("Transform").property("Orientation").expression = orExpr;
            } else {
                var propName = axis + " Rotation";
                var rProp = tgt.property("Transform").property(propName);
                if (!rProp) throw new Error("Ось поворота недоступна на target — включи 3D или использyй Orientation.");
                rProp.expression = tangentExpr + "ang;";
            }

            // ---- Fade opacity ----
            step = "fadeOpacity";
            if ((opts.fadeIn || opts.fadeOut) && opts.fadeOpacity) {
                var dIn  = opts.fadeDuration;
                var dOut = opts.fadeOutDuration;
                var inStart  = opts.fadeInOutside  ? (startT - dIn)          : startT;
                var inEnd    = opts.fadeInOutside  ? startT                  : (startT + dIn);
                var outStart = opts.fadeOutOutside ? (startT + dur)          : (startT + dur - dOut);
                var outEnd   = opts.fadeOutOutside ? (startT + dur + dOut)   : (startT + dur);

                var opExpr = ""
                    + "var inS  = " + inStart.toFixed(4) + ";\n"
                    + "var inE  = " + inEnd.toFixed(4) + ";\n"
                    + "var outS = " + outStart.toFixed(4) + ";\n"
                    + "var outE = " + outEnd.toFixed(4) + ";\n"
                    + "var fIn  = " + (opts.fadeIn  ? "true" : "false") + ";\n"
                    + "var fOut = " + (opts.fadeOut ? "true" : "false") + ";\n"
                    + "var loop = " + loopFlag + ";\n"
                    + "var r = 100;\n"
                    + "if (fIn && time < inS) r = 0;\n"
                    + "else if (fIn && time < inE) r = easeOut(time, inS, inE, 0, 100);\n"
                    + "else if (fOut && !loop && time > outE) r = 0;\n"
                    + "else if (fOut && !loop && time > outS) r = easeOut(time, outS, outE, 100, 0);\n"
                    + "r;";
                tgt.property("Transform").property("Opacity").expression = opExpr;
            }

            // ---- Fade scale ----
            step = "fadeScale";
            if ((opts.fadeIn || opts.fadeOut) && opts.fadeScale) {
                var dI2 = opts.fadeDuration;
                var dO2 = opts.fadeOutDuration;
                var inS2  = opts.fadeInOutside  ? (startT - dI2) : startT;
                var inE2  = opts.fadeInOutside  ? startT         : (startT + dI2);
                var outS2 = opts.fadeOutOutside ? (startT + dur)         : (startT + dur - dO2);
                var outE2 = opts.fadeOutOutside ? (startT + dur + dO2)   : (startT + dur);
                var sc0 = Math.max(1, opts.startScale); // мин. 1% — 0 ломает 3D-плагины

                var scExpr = ""
                    + "var inS  = " + inS2.toFixed(4) + ";\n"
                    + "var inE  = " + inE2.toFixed(4) + ";\n"
                    + "var outS = " + outS2.toFixed(4) + ";\n"
                    + "var outE = " + outE2.toFixed(4) + ";\n"
                    + "var fIn  = " + (opts.fadeIn  ? "true" : "false") + ";\n"
                    + "var fOut = " + (opts.fadeOut ? "true" : "false") + ";\n"
                    + "var loop = " + loopFlag + ";\n"
                    + "var sc0  = " + sc0 + ";\n"
                    + "var v = value;\n"
                    + "var k = 100;\n"
                    + "if (fIn && time < inS) k = sc0;\n"
                    + "else if (fIn && time < inE) k = easeOut(time, inS, inE, sc0, 100);\n"
                    + "else if (fOut && !loop && time > outE) k = sc0;\n"
                    + "else if (fOut && !loop && time > outS) k = easeOut(time, outS, outE, 100, sc0);\n"
                    + "var z = v.length > 2 ? v[2] : v[1];\n"
                    + "[v[0] * k / 100, v[1] * k / 100, z * k / 100];";
                tgt.property("Transform").property("Scale").expression = scExpr;
            }

            app.endUndoGroup();
            return true;
        } catch(err) {
            app.endUndoGroup();
            alert("PathRider ошибка на step=" + step + "\n" + err.toString());
            return false;
        }
    }

    // ---------- Remove Rider (снятие expressions) ----------
    function removeRider(tgt) {
        if (!tgt) { alert("Выделите target-слой (тот, к которому применён Rider)."); return; }
        app.beginUndoGroup(SCRIPT_NAME + ": Remove Rider");
        var removed = 0;
        var tf = tgt.property("Transform");
        var props = ["Position", "Orientation", "X Rotation", "Y Rotation", "Z Rotation", "Opacity", "Scale"];
        for (var i = 0; i < props.length; i++) {
            try {
                var p = tf.property(props[i]);
                if (p && p.expression && p.expression.length > 0) {
                    p.expression = "";
                    removed++;
                }
            } catch(e){}
        }
        app.endUndoGroup();
        alert("Снято expression'ов: " + removed);
    }

    // ---------- run from selection ----------
    function runFromSelection(opts) {
        var comp = getComp(); if (!comp) return;
        var sel = comp.selectedLayers;
        if (!sel || sel.length !== 2) {
            alert("Выделите ровно 2 слоя:\n• один с путём (mask или shape)\n• второй — target (модель).");
            return;
        }
        var pathInfo = null;
        var targetLayer = null;
        for (var s = 0; s < 2; s++) {
            var L = sel[s];
            var found = null;
            try {
                var mg = L.property("ADBE Mask Parade");
                if (mg && mg.numProperties > 0) {
                    found = {
                        label: L.name + " › " + mg.property(1).name + " (маска)",
                        layerIndex: L.index,
                        kind: "mask",
                        maskIndex: 1
                    };
                }
            } catch(e){}
            if (!found && L instanceof ShapeLayer) {
                try {
                    var root = L.property("ADBE Root Vectors Group");
                    var tmp = [];
                    scanShapeGroup(root, tmp, L.index, L.name, "");
                    if (tmp.length > 0) found = tmp[0];
                } catch(e){}
            }
            if (found && !pathInfo) pathInfo = found;
            else targetLayer = L;
        }
        if (!pathInfo) { alert("Ни один из выделенных слоёв не имеет пути (маска или shape)."); return; }
        if (!targetLayer) { alert("Не удалось определить target-слой."); return; }

        opts.pathInfo = pathInfo;
        opts.targetLayer = targetLayer;
        generate(opts);
    }

    // ---------- UI ----------
    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, {resizeable:true});
        win.orientation = "column";
        win.alignChildren = ["fill","top"];
        win.spacing = 6;
        win.margins = 8;
        win.preferredSize.width = 300;
        win.minimumSize.width = 280;

        var state = {
            pathList: [],
            layerList: [],
            pathInfo: null,
            targetLayer: null,
            duration: 5.0,
            startDelay: 0.5,
            direction: "forward",
            loop: false,
            useOrientation: true,
            rotAxis: "Y",
            forwardOffset: 0,
            smoothSamples: 3,
            fadeIn: true,
            fadeInOutside: false,
            fadeDuration: 0.5,
            fadeOut: false,
            fadeOutOutside: false,
            fadeOutDuration: 0.5,
            fadeOpacity: true,
            fadeScale: true,
            startScale: 20
        };

        // ---- Source path ----
        var pRow = win.add("group"); pRow.orientation = "row";
        pRow.add("statictext", undefined, "Путь:").preferredSize.width = 60;
        var pathDD = pRow.add("dropdownlist", undefined, []);
        pathDD.alignment = ["fill","center"];
        var pRefresh = pRow.add("button", undefined, "↻");
        pRefresh.preferredSize.width = 28;

        pRefresh.onClick = function(){
            var c = getComp(); if (!c) return;
            state.pathList = collectPaths(c);
            pathDD.removeAll();
            for (var i = 0; i < state.pathList.length; i++) pathDD.add("item", state.pathList[i].label);
            if (pathDD.items.length > 0) pathDD.selection = 0;
            state.pathInfo = state.pathList[0] || null;
        };
        pathDD.onChange = function(){
            if (pathDD.selection) state.pathInfo = state.pathList[pathDD.selection.index];
        };

        // ---- Target layer ----
        var tRow = win.add("group"); tRow.orientation = "row";
        tRow.add("statictext", undefined, "Модель:").preferredSize.width = 60;
        var tgtDD = tRow.add("dropdownlist", undefined, []);
        tgtDD.alignment = ["fill","center"];
        var tRefresh = tRow.add("button", undefined, "↻");
        tRefresh.preferredSize.width = 28;

        tRefresh.onClick = function(){
            var c = getComp(); if (!c) return;
            state.layerList = [];
            tgtDD.removeAll();
            for (var i = 1; i <= c.numLayers; i++) {
                var L = c.layer(i);
                state.layerList.push(L);
                tgtDD.add("item", L.name);
            }
            if (tgtDD.items.length > 0) tgtDD.selection = 0;
            state.targetLayer = state.layerList[0] || null;
        };
        tgtDD.onChange = function(){
            if (tgtDD.selection) state.targetLayer = state.layerList[tgtDD.selection.index];
        };

        // ---- Motion ----
        var mPanel = win.add("panel", undefined, "Движение");
        mPanel.orientation = "column"; mPanel.alignChildren = ["fill","top"]; mPanel.margins = 6;

        var previewText = mPanel.add("statictext", undefined, "");
        previewText.alignment = ["fill","top"];
        previewText.graphics.foregroundColor = previewText.graphics.newPen(previewText.graphics.PenType.SOLID_COLOR, [0.6,0.8,1,1], 1);

        function updatePreview() {
            var s = state.startDelay;
            var e = state.startDelay + state.duration;
            previewText.text = "Модель видна: " + s.toFixed(2) + "s → " + e.toFixed(2) + "s";
        }

        addSlider(mPanel, "Длит. (с)", 0.1, 30, state.duration, 0.1, function(v){ state.duration = v; updatePreview(); });
        addSlider(mPanel, "Задержка (с)", 0, 10, state.startDelay, 0.1, function(v){ state.startDelay = v; updatePreview(); });
        updatePreview();

        var dRow = mPanel.add("group");
        dRow.add("statictext", undefined, "Направление:").preferredSize.width = 95;
        var dirDD = dRow.add("dropdownlist", undefined, ["Вперёд","Назад"]);
        dirDD.selection = 0;
        dirDD.onChange = function(){ state.direction = (dirDD.selection.index === 0) ? "forward" : "reverse"; };

        var loopCB = mPanel.add("checkbox", undefined, "Цикл");
        loopCB.value = state.loop;
        loopCB.onClick = function(){ state.loop = loopCB.value; };

        // ---- Orientation ----
        var oPanel = win.add("panel", undefined, "Ориентация");
        oPanel.orientation = "column"; oPanel.alignChildren = ["fill","top"]; oPanel.margins = 6;

        var useOrCB = oPanel.add("checkbox", undefined, "Использовать Orientation (реком.)");
        useOrCB.value = state.useOrientation;
        useOrCB.onClick = function(){ state.useOrientation = useOrCB.value; };

        var axRow = oPanel.add("group");
        axRow.add("statictext", undefined, "Ось:").preferredSize.width = 95;
        var axDD = axRow.add("dropdownlist", undefined, ["Y (карта)","Z","X"]);
        axDD.selection = 0;
        axDD.onChange = function(){
            var map = ["Y","Z","X"];
            state.rotAxis = map[axDD.selection.index];
        };

        addSlider(oPanel, "Forward offset (°)", -180, 180, state.forwardOffset, 1, function(v){ state.forwardOffset = v; });
        addSlider(oPanel, "Сглаживание (сэмплы)", 1, 5, state.smoothSamples, 1, function(v){ state.smoothSamples = v; });

        // ---- Appearance ----
        var aPanel = win.add("panel", undefined, "Появление / Исчезновение");
        aPanel.orientation = "column"; aPanel.alignChildren = ["fill","top"]; aPanel.margins = 6;

        var fadeInCB = aPanel.add("checkbox", undefined, "Fade-in в начале");
        fadeInCB.value = state.fadeIn;
        fadeInCB.onClick = function(){ state.fadeIn = fadeInCB.value; };
        var fadeInOutsideCB = aPanel.add("checkbox", undefined, "  ↳ до старта пути");
        fadeInOutsideCB.value = state.fadeInOutside;
        fadeInOutsideCB.onClick = function(){ state.fadeInOutside = fadeInOutsideCB.value; };
        addSlider(aPanel, "Длит. fade-in (с)", 0.1, 3, state.fadeDuration, 0.1, function(v){ state.fadeDuration = v; });

        var fadeOutCB = aPanel.add("checkbox", undefined, "Fade-out в конце");
        fadeOutCB.value = state.fadeOut;
        fadeOutCB.onClick = function(){ state.fadeOut = fadeOutCB.value; };
        var fadeOutOutsideCB = aPanel.add("checkbox", undefined, "  ↳ после конца пути");
        fadeOutOutsideCB.value = state.fadeOutOutside;
        fadeOutOutsideCB.onClick = function(){ state.fadeOutOutside = fadeOutOutsideCB.value; };
        addSlider(aPanel, "Длит. fade-out (с)", 0.1, 3, state.fadeOutDuration, 0.1, function(v){ state.fadeOutDuration = v; });

        var foRow = aPanel.add("group");
        var opCB = foRow.add("checkbox", undefined, "Opacity"); opCB.value = state.fadeOpacity;
        opCB.onClick = function(){ state.fadeOpacity = opCB.value; };
        var scCB = foRow.add("checkbox", undefined, "Scale"); scCB.value = state.fadeScale;
        scCB.onClick = function(){ state.fadeScale = scCB.value; };
        addSlider(aPanel, "Стартовый scale (%)", 1, 100, state.startScale, 1, function(v){ state.startScale = v; });

        // ---- Actions ----
        var actRow = win.add("group");
        actRow.orientation = "row";
        actRow.alignChildren = ["fill","center"];
        actRow.alignment = ["fill","bottom"];

        var quickBtn = actRow.add("button", undefined, "По выделению (2 слоя)");
        quickBtn.alignment = ["fill","center"];
        quickBtn.preferredSize.height = 26;

        var createBtn = actRow.add("button", undefined, "Создать");
        createBtn.alignment = ["fill","center"];

        var helpBtn = actRow.add("button", undefined, "?");
        helpBtn.preferredSize.width = 25;

        var removeRow = win.add("group");
        removeRow.orientation = "row";
        removeRow.alignChildren = ["fill","center"];
        var removeBtn = removeRow.add("button", undefined, "Убрать Rider с target");
        removeBtn.alignment = ["fill","center"];
        removeBtn.helpTip = "Снять expressions с Position/Orientation/Rotation/Opacity/Scale выделенного слоя";

        quickBtn.onClick = function(){ runFromSelection(state); };
        createBtn.onClick = function(){ generate(state); };
        helpBtn.onClick = function(){ alert(getHelpText()); };
        removeBtn.onClick = function(){
            var c = getComp(); if (!c) return;
            var sel = c.selectedLayers;
            if (!sel || sel.length === 0) { alert("Выделите target-слой."); return; }
            for (var i = 0; i < sel.length; i++) removeRider(sel[i]);
        };

        pRefresh.onClick();
        tRefresh.onClick();

        if (win instanceof Window) { win.center(); win.show(); }
        else { win.layout.layout(true); win.layout.resize(); }
        return win;
    }

    function addSlider(parent, label, minV, maxV, defV, stepV, onChange) {
        var g = parent.add("group");
        g.orientation = "row";
        g.alignChildren = ["fill","center"];
        g.alignment = ["fill","top"];
        var lbl = g.add("statictext", undefined, label);
        lbl.preferredSize.width = 95;
        var sl = g.add("slider", undefined, defV, minV, maxV);
        sl.alignment = ["fill","center"];
        sl.minimumSize.width = 60;
        var ed = g.add("edittext", undefined, String(defV));
        ed.preferredSize.width = 45;
        sl.onChanging = function(){
            var v = Math.round(sl.value/stepV)*stepV;
            ed.text = String(v);
            onChange(v);
        };
        ed.onChange = function(){
            var v = parseFloat(ed.text); if (isNaN(v)) return;
            v = clamp(v, minV, maxV); sl.value = v; ed.text = String(v);
            onChange(v);
        };
    }

    function getHelpText() {
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n\n"
            + "Анимация 3D-модели (например, .glb машина) по 2D-пути.\n\n"
            + "БЫСТРЫЙ СТАРТ:\n"
            + "1. Нарисуй маску или shape-путь на слое карты.\n"
            + "2. Добавь 3D-модель в композицию, включи 3D-слой.\n"
            + "3. Поставь CTI на момент старта.\n"
            + "4. Вариант A: нажми ↻ на обоих dropdown, выбери путь и модель, нажми «Создать».\n"
            + "   Вариант B: выдели оба слоя в таймлайне и нажми «По выделению (2 слоя)».\n\n"
            + "ПАРАМЕТРЫ:\n"
            + "• Длит. — общее время движения (с).\n"
            + "• Задержка — пауза перед стартом (fade-in играет во время задержки, если включён).\n"
            + "• Направление — Вперёд / Назад.\n"
            + "• Цикл — модель телепортируется с конца на начало пути.\n"
            + "• Использовать Orientation — рекомендуется для .glb / импортированных 3D. Сохраняет твои ручные наклоны на других двух осях.\n"
            + "• Ось — какая ось следует за касательной пути (Y для top-down карты).\n"
            + "• Forward offset — доп. поворот, если модель смотрит не туда при 0°.\n"
            + "• Сглаживание — усреднение касательной по N сэмплам для плавных поворотов.\n"
            + "• Fade-in / Fade-out — Opacity 0→100 и Scale от «стартового» → 100%.\n\n"
            + "УБРАТЬ RIDER:\n"
            + "Кнопка «Убрать Rider с target» снимает все expressions с выделенного слоя (Position, Orientation, Rotation, Opacity, Scale). Полезно, если хочешь переделать анимацию или удалить эффект.\n\n"
            + "СОВЕТЫ:\n"
            + "• Z-координата target сохраняется — задай высоту модели один раз.\n"
            + "• Если машина смотрит не туда, крути Forward offset (обычно 90 / 180 / -90).\n"
            + "• На резких поворотах увеличь Сглаживание до 4-5.\n"
            + "• Fade-out работает только когда Цикл выключен.\n"
            + "• Если путь внутри shape-группы с ненулевым Position — модель поедет не по видимому пути. Используй маски для точности.\n";
    }

    buildUI(thisObj);
})(this);
