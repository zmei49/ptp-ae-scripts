// ============================================================
// ptp_Connector.jsx  v1.1
// Connects selected layers with animated lines.
// Modes: All pairs, Nearest, K-nearest, MST, Sequential, Hub.
// Optional live-update via expressions.
// ============================================================
// v1.1 changelog:
//   • Fix: убран DEBUG alert из buildLine
//   • Fix: Stroke Color/Width/Opacity через matchName (не англ.-only)
//   • Fix: Trim End через matchName
//   • Fix: snapshot points берутся в comp.time вместо time=0
//   • Fix: escape кавычек в именах слоёв для live-update expression
//   • UI: "Anchor" переименован в "Position" (соответствует реальному поведению)
//   • Help + UI переведены на русский, добавлено пояснение про порядок selectedLayers

(function (thisObj) {
    var SCRIPT_NAME = "ptp_Connector";
    var SCRIPT_VERSION = "v1.1";
    var LAYER_PREFIX = "CN_";
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
        var c = getComp(); if (!c) return null;
        var sel = c.selectedLayers;
        if (!sel || sel.length < 2) { alert("Выделите минимум 2 слоя."); return null; }
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
    // Escape имя слоя для использования в JS-строке expression
    function escName(s) {
        return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }
    function setEaseOut(prop) {
        for (var i = 1; i <= prop.numKeys; i++) {
            try { prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch(e){}
            var dim = 1;
            try { var v = prop.keyValue(i); if (v instanceof Array) dim = v.length; } catch(e){}
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
    // GEOMETRY: get layer point in comp space
    // ============================================================
    function getLayerCompPoint(layer, attach, atTime) {
        function to2D(v) {
            if (!v) return [0, 0];
            return [v[0] || 0, v[1] || 0];
        }
        try {
            if (attach === "center") {
                try {
                    var r = layer.sourceRectAtTime(atTime, false);
                    var cx = r.left + r.width / 2;
                    var cy = r.top + r.height / 2;
                    return to2D(layer.toComp([cx, cy]));
                } catch (e) {
                    return to2D(layer.property("Transform").property("Position").valueAtTime(atTime, false));
                }
            } else {
                // "position" mode — use Position directly
                return to2D(layer.property("Transform").property("Position").valueAtTime(atTime, false));
            }
        } catch (e) {
            try {
                return to2D(layer.property("Transform").property("Position").value);
            } catch (ee) {
                return [0, 0];
            }
        }
    }

    // ============================================================
    // PAIR SELECTION ALGORITHMS
    // ============================================================
    function pairsAll(n) {
        var p = [];
        for (var i = 0; i < n; i++) for (var j = i+1; j < n; j++) p.push([i,j]);
        return p;
    }
    function pairsNearest(points) {
        var n = points.length, pairs = [], seen = {};
        for (var i = 0; i < n; i++) {
            var best = -1, bestD = Infinity;
            for (var j = 0; j < n; j++) {
                if (i === j) continue;
                var dx = points[i][0]-points[j][0], dy = points[i][1]-points[j][1];
                var d = dx*dx + dy*dy;
                if (d < bestD) { bestD = d; best = j; }
            }
            if (best >= 0) {
                var key = i < best ? (i + "_" + best) : (best + "_" + i);
                if (!seen[key]) { seen[key] = true; pairs.push([i, best]); }
            }
        }
        return pairs;
    }
    function pairsKNearest(points, k) {
        var n = points.length, pairs = [], seen = {};
        for (var i = 0; i < n; i++) {
            var arr = [];
            for (var j = 0; j < n; j++) {
                if (i === j) continue;
                var dx = points[i][0]-points[j][0], dy = points[i][1]-points[j][1];
                arr.push({ j: j, d: dx*dx + dy*dy });
            }
            arr.sort(function(a,b){ return a.d - b.d; });
            var kk = Math.min(k, arr.length);
            for (var m = 0; m < kk; m++) {
                var jj = arr[m].j;
                var key = i < jj ? (i + "_" + jj) : (jj + "_" + i);
                if (!seen[key]) { seen[key] = true; pairs.push([i, jj]); }
            }
        }
        return pairs;
    }
    // Prim's MST
    function pairsMST(points) {
        var n = points.length;
        if (n < 2) return [];
        var inTree = [], dist = [], parent = [];
        for (var i = 0; i < n; i++) { inTree.push(false); dist.push(Infinity); parent.push(-1); }
        dist[0] = 0;
        var edges = [];
        for (var step = 0; step < n; step++) {
            var u = -1, best = Infinity;
            for (var v = 0; v < n; v++) {
                if (!inTree[v] && dist[v] < best) { best = dist[v]; u = v; }
            }
            if (u < 0) break;
            inTree[u] = true;
            if (parent[u] >= 0) edges.push([parent[u], u]);
            for (var w = 0; w < n; w++) {
                if (inTree[w]) continue;
                var dx = points[u][0]-points[w][0], dy = points[u][1]-points[w][1];
                var d = dx*dx + dy*dy;
                if (d < dist[w]) { dist[w] = d; parent[w] = u; }
            }
        }
        return edges;
    }
    function pairsSequential(n) {
        var p = [];
        for (var i = 0; i < n - 1; i++) p.push([i, i+1]);
        return p;
    }
    function pairsHub(n) {
        var p = [];
        for (var i = 1; i < n; i++) p.push([0, i]);
        return p;
    }
    function selectPairs(mode, points, k) {
        var n = points.length;
        if (mode === "all")        return pairsAll(n);
        if (mode === "nearest")    return pairsNearest(points);
        if (mode === "knearest")   return pairsKNearest(points, k);
        if (mode === "mst")        return pairsMST(points);
        if (mode === "sequential") return pairsSequential(n);
        if (mode === "hub")        return pairsHub(n);
        return pairsAll(n);
    }

    // ============================================================
    // BUILD ONE LINE
    // ============================================================
    function buildLine(comp, contents, layerA, layerB, opts, lineIdx, totalLines) {
        var step = "start";
        try {
            step = "addGroup";
            var grp = contents.addProperty("ADBE Vector Group");
            grp.name = "Line_" + (lineIdx+1) + "_" + layerA.name + "_to_" + layerB.name;
            var inner = grp.property("ADBE Vectors Group");

            step = "addPath";
            var pathProp = inner.addProperty("ADBE Vector Shape - Group");
            var pProp = pathProp.property("ADBE Vector Shape");

            var pA = getLayerCompPoint(layerA, opts.attach, comp.time);
            var pB = getLayerCompPoint(layerB, opts.attach, comp.time);

            var shp = new Shape();
            shp.vertices = [pA, pB];
            shp.inTangents = [[0,0],[0,0]];
            shp.outTangents = [[0,0],[0,0]];
            shp.closed = false;
            pProp.setValue(shp);

            if (opts.liveUpdate) {
                step = "liveExpr";
                try {
                    var nameA = escName(layerA.name);
                    var nameB = escName(layerB.name);
                    var attachExpr = (opts.attach === "center")
    ? "function pt(L){ try{ var r=L.sourceRectAtTime(time,false); var cx=r.left+r.width/2; var cy=r.top+r.height/2; var p=L.toComp([cx,cy]); return [p[0],p[1]]; }catch(e){ var pp=L.transform.position; return [pp[0],pp[1]]; } }"
    : "function pt(L){ var p=L.transform.position; return [p[0],p[1]]; }";

                    var expr =
                        attachExpr + "\n" +
                        'var a = pt(thisComp.layer("' + nameA + '"));\n' +
                        'var b = pt(thisComp.layer("' + nameB + '"));\n' +
                        'createPath([a, b], [], [], false);';
                    pProp.expression = expr;
                    pProp.expressionEnabled = true;
                } catch(e){}
            }

            step = "addStroke";
            var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
            try { stroke.property("ADBE Vector Stroke Color").setValue(opts.color); } catch(e){}
            try { stroke.property("ADBE Vector Stroke Width").setValue(opts.width); } catch(e){}
            try { stroke.property("ADBE Vector Stroke Opacity").setValue(opts.opacity); } catch(e){}

            if (opts.dash) {
                step = "addDash";
                try {
                    var dashes = stroke.property("ADBE Vector Stroke Dashes");
                    var d = dashes.addProperty("ADBE Vector Stroke Dash 1");
                    d.setValue(opts.dashLength);
                    var g = dashes.addProperty("ADBE Vector Stroke Gap 1");
                    g.setValue(opts.gapLength);
                } catch(e){}
            }

            // Animate draw via Trim Path
            if (opts.animateDraw) {
                step = "addTrim";
                var trim = inner.addProperty("ADBE Vector Filter - Trim");
                var endProp = trim.property("ADBE Vector Trim End");
                var t0 = comp.time;
                var startT = t0 + lineIdx * opts.stagger;
                var endT = startT + opts.drawDuration;
                endProp.setValueAtTime(startT, 0);
                endProp.setValueAtTime(endT, 100);
                if (opts.easing === "easeOut") setEaseOut(endProp);
                else setLinear(endProp);

                if (opts.loop) {
                    setLoopExpression(endProp, "cycle");
                }
            }

            return grp;
        } catch(err) {
            throw new Error("step=" + step + " | " + err.toString());
        }
    }

    // ============================================================
    // MAIN GENERATOR
    // ============================================================
    function generate(opts) {
        var comp = getComp(); if (!comp) return;
        var layers = getSelLayers(); if (!layers) return;
        var n = layers.length;

        // Snapshot positions in comp space at CURRENT comp time
        var points = [];
        for (var i = 0; i < n; i++) {
            points.push(getLayerCompPoint(layers[i], opts.attach, comp.time));
        }

        // Pick pairs
        var pairs = selectPairs(opts.mode, points, opts.k);
        if (pairs.length === 0) { alert("Нет соединений для отрисовки."); return; }

        if (opts.output === "single") {
            var holder = comp.layers.addShape();
            holder.name = LAYER_PREFIX + "Connectors";
            var contents = holder.property("ADBE Root Vectors Group");
            try { holder.property("Transform").property("Position").setValue([0, 0]); } catch(e){}
            try { holder.property("Transform").property("Anchor Point").setValue([0, 0]); } catch(e){}

            for (var p = 0; p < pairs.length; p++) {
                var ij = pairs[p];
                try {
                    buildLine(comp, contents, layers[ij[0]], layers[ij[1]], opts, p, pairs.length);
                } catch(err) {
                    alert("Линия " + (p+1) + " не создана: " + err.toString());
                    return;
                }
            }
            try { holder.moveBefore(layers[0]); } catch(e){}

        } else {
            for (var p = 0; p < pairs.length; p++) {
                var ij = pairs[p];
                var holder2 = comp.layers.addShape();
                holder2.name = LAYER_PREFIX + "Line_" + (p+1) + "_" +
                                layers[ij[0]].name + "_to_" + layers[ij[1]].name;
                var contents2 = holder2.property("ADBE Root Vectors Group");
                try { holder2.property("Transform").property("Position").setValue([0, 0]); } catch(e){}
                try { holder2.property("Transform").property("Anchor Point").setValue([0, 0]); } catch(e){}

                try {
                    buildLine(comp, contents2, layers[ij[0]], layers[ij[1]], opts, p, pairs.length);
                } catch(err) {
                    alert("Линия " + (p+1) + " не создана: " + err.toString());
                    return;
                }
                try { holder2.moveBefore(layers[0]); } catch(e){}
            }
        }
    }

    // ============================================================
    // UI HELPERS
    // ============================================================
    function divider(parent) {
        var d = parent.add("panel");
        d.alignment = ["fill","top"];
        d.preferredSize.height = 2;
    }

    function addSlider(parent, label, minV, maxV, initV, stepV, onChange) {
        var row = parent.add("group");
        row.orientation = "row";
        row.alignChildren = ["left","center"];
        var lbl = row.add("statictext", undefined, label);
        lbl.preferredSize.width = 130;
        var sld = row.add("slider", undefined, initV, minV, maxV);
        sld.preferredSize.width = 120;
        var et = row.add("edittext", undefined, String(initV));
        et.preferredSize.width = 50;
        sld.onChanging = function(){
            var v = sld.value;
            if (stepV) v = Math.round(v / stepV) * stepV;
            et.text = (stepV && stepV < 1) ? v.toFixed(2) : String(Math.round(v * 100) / 100);
            if (onChange) onChange(v);
        };
        et.onChange = function(){
            var v = parseFloat(et.text);
            if (isNaN(v)) return;
            v = clamp(v, minV, maxV);
            sld.value = v;
            et.text = String(v);
            if (onChange) onChange(v);
        };
        return { get: function(){ return parseFloat(et.text); }, set: function(v){ sld.value=v; et.text=String(v); } };
    }

    function makeColorSwatch(parent, label, initialColor, onChange) {
        var row = parent.add("group");
        row.orientation = "row";
        row.alignChildren = ["left","center"];
        var lbl = row.add("statictext", undefined, label);
        lbl.preferredSize.width = 130;
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
        return row;
    }

    // ============================================================
    // UI
    // ============================================================
    function buildUI(thisObj) {
        var state = {
            mode: "mst",
            k: 2,
            attach: "position",
            output: "single",
            color: [1.0, 0.55, 0.10],
            width: 3,
            opacity: 100,
            dash: false,
            dashLength: 8,
            gapLength: 8,
            animateDraw: true,
            drawDuration: 0.5,
            stagger: 0.05,
            easing: "easeOut",
            loop: false,
            liveUpdate: true
        };

        var w = (thisObj instanceof Panel) ? thisObj
              : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, {resizeable:true});
        w.orientation = "column";
        w.alignChildren = ["fill","top"];
        w.spacing = 6;
        w.margins = 8;
        if (w instanceof Window) {
            w.preferredSize = [380, 620];
            w.minimumSize = [340, 520];
        }

        // -------- Mode --------
        var mPanel = w.add("panel", undefined, "Соединения");
        mPanel.orientation = "column";
        mPanel.alignChildren = ["fill","top"];
        mPanel.margins = 8;

        var rowMode = mPanel.add("group");
        var mLbl = rowMode.add("statictext", undefined, "Режим:");
        mLbl.preferredSize.width = 130;
        var mDD = rowMode.add("dropdownlist", undefined,
            ["All pairs", "Nearest", "K-nearest", "MST", "Sequential", "Hub"]);
        mDD.selection = mDD.find("MST") || mDD.items[3];
        mDD.preferredSize.width = 140;
        mDD.onChange = function(){
            var t = mDD.selection.text;
            if (t === "All pairs") state.mode = "all";
            else if (t === "Nearest") state.mode = "nearest";
            else if (t === "K-nearest") state.mode = "knearest";
            else if (t === "MST") state.mode = "mst";
            else if (t === "Sequential") state.mode = "sequential";
            else if (t === "Hub") state.mode = "hub";
        };

        addSlider(mPanel, "K (для K-nearest)", 1, 10, state.k, 1,
            function(v){ state.k = v; });

        var rowAttach = mPanel.add("group");
        var aLbl = rowAttach.add("statictext", undefined, "Точка привязки:");
        aLbl.preferredSize.width = 130;
        var aDD = rowAttach.add("dropdownlist", undefined, ["Position", "Center"]);
        aDD.selection = aDD.find("Position") || aDD.items[0];
        aDD.preferredSize.width = 140;
        aDD.onChange = function(){
            state.attach = (aDD.selection.text === "Center") ? "center" : "position";
        };

        var rowOut = mPanel.add("group");
        var oLbl = rowOut.add("statictext", undefined, "Вывод:");
        oLbl.preferredSize.width = 130;
        var oDD = rowOut.add("dropdownlist", undefined, ["Один слой", "Отдельные слои"]);
        oDD.selection = oDD.find("Один слой") || oDD.items[0];
        oDD.preferredSize.width = 140;
        oDD.onChange = function(){
            state.output = (oDD.selection.text === "Отдельные слои") ? "separate" : "single";
        };

        // -------- Style --------
        var sPanel = w.add("panel", undefined, "Стиль линии");
        sPanel.orientation = "column";
        sPanel.alignChildren = ["fill","top"];
        sPanel.margins = 8;

        addSlider(sPanel, "Толщина (px)", 1, 20, state.width, 1,
            function(v){ state.width = v; });
        makeColorSwatch(sPanel, "Цвет:", state.color,
            function(c){ state.color = c; });
        addSlider(sPanel, "Прозрачность (%)", 0, 100, state.opacity, 1,
            function(v){ state.opacity = v; });

        var cbDash = sPanel.add("checkbox", undefined, "Пунктирная линия");
        cbDash.value = state.dash;
        cbDash.onClick = function(){ state.dash = cbDash.value; };

        addSlider(sPanel, "Длина штриха (px)", 1, 100, state.dashLength, 1,
            function(v){ state.dashLength = v; });
        addSlider(sPanel, "Длина пробела (px)", 1, 100, state.gapLength, 1,
            function(v){ state.gapLength = v; });

        // -------- Animation --------
        var aPanel = w.add("panel", undefined, "Анимация");
        aPanel.orientation = "column";
        aPanel.alignChildren = ["fill","top"];
        aPanel.margins = 8;

        var cbDraw = aPanel.add("checkbox", undefined, "Отрисовка (Trim Path)");
        cbDraw.value = state.animateDraw;
        cbDraw.onClick = function(){ state.animateDraw = cbDraw.value; };

        addSlider(aPanel, "Длительность (с)", 0.05, 10.0, state.drawDuration, 0.05,
            function(v){ state.drawDuration = v; });
        addSlider(aPanel, "Stagger (с)", 0.0, 5.0, state.stagger, 0.05,
            function(v){ state.stagger = v; });

        var rowEase = aPanel.add("group");
        var eLbl = rowEase.add("statictext", undefined, "Easing:");
        eLbl.preferredSize.width = 130;
        var eDD = rowEase.add("dropdownlist", undefined, ["Linear", "Ease Out"]);
        eDD.selection = eDD.find("Ease Out") || eDD.items[1];
        eDD.preferredSize.width = 140;
        eDD.onChange = function(){
            state.easing = (eDD.selection.text === "Linear") ? "linear" : "easeOut";
        };

        var cbLoop = aPanel.add("checkbox", undefined, "Loop (cycle)");
        cbLoop.value = state.loop;
        cbLoop.onClick = function(){ state.loop = cbLoop.value; };

        // -------- Behavior --------
        var bPanel = w.add("panel", undefined, "Поведение");
        bPanel.orientation = "column";
        bPanel.alignChildren = ["fill","top"];
        bPanel.margins = 8;

        var cbLive = bPanel.add("checkbox", undefined, "Live update (expressions на path)");
        cbLive.value = state.liveUpdate;
        cbLive.onClick = function(){ state.liveUpdate = cbLive.value; };

        divider(w);

        var btnRow = w.add("group");
        btnRow.orientation = "row";
        var btnGo = btnRow.add("button", undefined, "Create Connectors");
        btnGo.preferredSize.height = 30;
        btnGo.preferredSize.width = 240;
        var btnHelp = btnRow.add("button", undefined, "?");
        btnHelp.preferredSize.width = 28;

        btnGo.onClick = function(){
            app.beginUndoGroup(SCRIPT_NAME + ": Create Connectors");
            try { generate(state); }
            catch(err) { alert("Ошибка: " + err.toString()); }
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
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n\n"
            + "Соединяет выделенные слои анимированными линиями (network visualization).\n\n"
            + "БЫСТРЫЙ СТАРТ:\n"
            + "1. Выделите 2+ слоя в timeline.\n"
            + "2. Выберите режим соединения (MST — хороший дефолт).\n"
            + "3. Установите CTI в желаемый момент старта.\n"
            + "4. Нажмите Create Connectors.\n\n"
            + "═══ РЕЖИМЫ СОЕДИНЕНИЯ ═══\n"
            + "• All pairs — каждый со всеми. Плотная сетка.\n"
            + "• Nearest — каждый слой → ближайший сосед.\n"
            + "• K-nearest — каждый слой → K ближайших соседей.\n"
            + "• MST (Minimum Spanning Tree) — минимальное покрывающее дерево,\n"
            + "  без циклов. Хороший выбор для чистых диаграмм.\n"
            + "• Sequential — цепочка в порядке выделения.\n"
            + "• Hub — первый выделенный слой → все остальные.\n\n"
            + "═══ ТОЧКА ПРИВЯЗКИ ═══\n"
            + "• Position — конец линии в позиции слоя (Transform → Position).\n"
            + "• Center — конец линии в визуальном центре bbox слоя.\n\n"
            + "═══ ВЫВОД ═══\n"
            + "• Один слой — все линии внутри одного Shape-слоя (компактно).\n"
            + "• Отдельные слои — по одному слою на линию (удобнее редактировать).\n\n"
            + "═══ СТИЛЬ ═══\n"
            + "• Толщина, цвет, прозрачность.\n"
            + "• Пунктирная — включает штриховую линию.\n\n"
            + "═══ АНИМАЦИЯ ═══\n"
            + "• Отрисовка — линии рисуются через Trim Path.\n"
            + "• Stagger — задержка между линиями (с).\n"
            + "• Loop — циклическая отрисовка.\n\n"
            + "═══ ПОВЕДЕНИЕ ═══\n"
            + "• Live update ON — линии следуют за слоями (expression-driven).\n"
            + "• Live update OFF — координаты фиксируются в момент создания.\n\n"
            + "═══ ВАЖНО ═══\n"
            + "• Порядок Sequential и Hub = порядок selectedLayers в AE,\n"
            + "  а это порядок СВЕРХУ ВНИЗ в timeline (НЕ порядок кликов).\n"
            + "  Для Hub верхний слой = центр, остальные — спицы.\n"
            + "• Имена слоёв должны быть уникальными — Live update завязан на них.\n"
            + "• Snapshot координат берётся в CTI (текущее время композиции).\n"
            + "• Между запусками Ctrl+Z, чтобы избежать дублирования CN_*.\n"
            + "• Для запутанных сетей используйте MST или K-nearest с K=2.\n\n"
            + "СОЗДАВАЕМЫЕ СЛОИ:\n"
            + "• CN_Connectors (Один слой) или CN_Line_N_A_to_B (Отдельные слои).\n";
    }

    buildUI(thisObj);

})(this);
