// ============================================================
// ptp_PointMesh.jsx v1.0.2
// Changes vs 1.0.1:
//   • Fix: имя группы линии обрезается до 32 символов (лимит AE)
//   • Fix: expression узлов и линий использует toComp(anchorPoint)
//     вместо toComp([0,0]) — узлы теперь встают на центры слоёв
// ============================================================

(function ptp_PointMesh(thisObj) {
    var SCRIPT_NAME = "ptp_PointMesh";
    var SCRIPT_VERSION = "v1.0.2";
    var LAYER_PREFIX  = "PM_";

    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Открой композицию."); return null; }
        return c;
    }
    function esc(s){ return String(s).replace(/\\/g,"\\\\").replace(/"/g,'\\"'); }
    function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
    function rgbToHex(rgb){
        function h(v){ v = Math.round(clamp(v,0,1)*255); return (v<16?"0":"") + v.toString(16).toUpperCase(); }
        return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
    }
    // Обрезает строку до N символов (лимит AE для имён групп)
    function trimName(s, maxLen){
        if (!maxLen) maxLen = 30;
        s = String(s);
        return (s.length > maxLen) ? s.substr(0, maxLen) : s;
    }
    function setEaseOut(prop){
        try {
            for (var i=1;i<=prop.numKeys;i++){
                var eIn  = new KeyframeEase(0, 75);
                var eOut = new KeyframeEase(0, 75);
                var dim = (prop.propertyValueType===PropertyValueType.TwoD || prop.propertyValueType===PropertyValueType.TwoD_SPATIAL) ? 2
                        : (prop.propertyValueType===PropertyValueType.ThreeD || prop.propertyValueType===PropertyValueType.ThreeD_SPATIAL) ? 3 : 1;
                var inArr=[], outArr=[];
                for (var d=0;d<dim;d++){ inArr.push(eIn); outArr.push(eOut); }
                prop.setTemporalEaseAtKey(i, inArr, outArr);
            }
        } catch(e){}
    }

    function distSq(a,b){ var dx=a[0]-b[0], dy=a[1]-b[1]; return dx*dx+dy*dy; }
    function getLayerPos(L){
        var p = L.property("Transform").property("Position").value;
        return [p[0], p[1]];
    }

    function buildConnections(layers, mode, K, threshold){
        var N = layers.length;
        var pts = [];
        for (var i=0;i<N;i++) pts.push(getLayerPos(layers[i]));
        var edges = [];
        var seen = {};
        function addEdge(a,b){
            if (a===b) return;
            var lo = Math.min(a,b), hi = Math.max(a,b);
            var key = lo+"_"+hi;
            if (seen[key]) return;
            seen[key] = true;
            var d = Math.sqrt(distSq(pts[lo], pts[hi]));
            edges.push({a:lo, b:hi, dist:d});
        }

        if (mode === "Все пары"){
            for (var i2=0;i2<N;i2++) for (var j2=i2+1;j2<N;j2++) addEdge(i2,j2);
        }
        else if (mode === "K ближайших"){
            for (var i3=0;i3<N;i3++){
                var arr = [];
                for (var j3=0;j3<N;j3++){
                    if (i3===j3) continue;
                    arr.push({idx:j3, d:distSq(pts[i3], pts[j3])});
                }
                arr.sort(function(x,y){ return x.d - y.d; });
                var kk = Math.min(K, arr.length);
                for (var k2=0;k2<kk;k2++) addEdge(i3, arr[k2].idx);
            }
        }
        else if (mode === "MST"){
            var inTree = []; for (var q=0;q<N;q++) inTree.push(false);
            inTree[0] = true;
            for (var step=0; step<N-1; step++){
                var bestA=-1, bestB=-1, bestD=Infinity;
                for (var a=0;a<N;a++){
                    if (!inTree[a]) continue;
                    for (var b=0;b<N;b++){
                        if (inTree[b]) continue;
                        var d2 = distSq(pts[a], pts[b]);
                        if (d2 < bestD){ bestD=d2; bestA=a; bestB=b; }
                    }
                }
                if (bestA<0) break;
                inTree[bestB] = true;
                addEdge(bestA, bestB);
            }
        }
        else if (mode === "По расстоянию"){
            var thSq = threshold*threshold;
            for (var i4=0;i4<N;i4++) for (var j4=i4+1;j4<N;j4++){
                if (distSq(pts[i4], pts[j4]) <= thSq) addEdge(i4, j4);
            }
        }
        else if (mode === "Цепочка"){
            for (var i5=0;i5<N-1;i5++) addEdge(i5, i5+1);
        }
        else if (mode === "Хаб"){
            for (var i6=1;i6<N;i6++) addEdge(0, i6);
        }
        return edges;
    }

    function getShapePathProp(sh){
        try {
            var p = sh.property("ADBE Vector Shape");
            if (p) return p;
        } catch(e){}
        for (var i=1;i<=sh.numProperties;i++){
            var pp = sh.property(i);
            if (pp && pp.propertyValueType===PropertyValueType.SHAPE) return pp;
        }
        return null;
    }

        // Ищет свойство внутри Transform-группы шейпа по matchName,
    // с фолбэком на отображаемое имя и перебор — переживает
    // локализованный UI и разницу версий AE.
    function getVecProp(grp, matchName, dispName){
        var p = null;
        try { p = grp.property(matchName); } catch(e){}
        if (p) return p;
        try { p = grp.property(dispName); } catch(e){}
        if (p) return p;
        for (var i = 1; i <= grp.numProperties; i++){
            var pp = grp.property(i);
            if (pp && (pp.matchName === matchName || pp.name === dispName)) return pp;
        }
        return null;
    }


    function buildLineGroup(root, name, layerA, layerB, color, strokeW, baseOpacity, distOpacity, maxDist){
        var g = root.addProperty("ADBE Vector Group");
        g.name = trimName(name, 30);   // <-- ограничение на 30 символов
        var inner = g.property("ADBE Vectors Group");

        var sh = inner.addProperty("ADBE Vector Shape - Group");
        var pathProp = getShapePathProp(sh);

        var sPath = new Shape();
        sPath.vertices = [[0,0],[100,0]];
        sPath.inTangents = [[0,0],[0,0]];
        sPath.outTangents = [[0,0],[0,0]];
        sPath.closed = false;
        if (pathProp) pathProp.setValue(sPath);

        var nameA = esc(layerA.name);
        var nameB = esc(layerB.name);
        // ВАЖНО: toComp(anchorPoint) даёт РЕАЛЬНУЮ позицию слоя в композиции
        var exprPath = ""
            + "var LA = thisComp.layer(\"" + nameA + "\");\n"
            + "var LB = thisComp.layer(\"" + nameB + "\");\n"
            + "var a = LA.toComp(LA.anchorPoint);\n"
            + "var b = LB.toComp(LB.anchorPoint);\n"
            + "var aL = thisLayer.fromComp(a);\n"
            + "var bL = thisLayer.fromComp(b);\n"
                       + "createPath([[aL[0],aL[1]], [bL[0],bL[1]]], [], [], false);";

        try { if (pathProp) pathProp.expression = exprPath; } catch(e){}

        var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
        try { stroke.property("ADBE Vector Stroke Color").setValue(color); } catch(e){
            try { stroke.property("Color").setValue(color); } catch(e2){}
        }
        try { stroke.property("ADBE Vector Stroke Width").setValue(strokeW); } catch(e){
            try { stroke.property("Stroke Width").setValue(strokeW); } catch(e2){}
        }
        try { stroke.property("ADBE Vector Stroke Line Cap").setValue(2); } catch(e){
            try { stroke.property("Line Cap").setValue(2); } catch(e2){}
        }

        inner.addProperty("ADBE Vector Filter - Trim");

        var tr = g.property("ADBE Vector Transform Group");
        var opProp = tr.property("ADBE Vector Group Opacity");
        if (distOpacity){
            var exprOp = ""
                + "var LA = thisComp.layer(\"" + nameA + "\");\n"
                + "var LB = thisComp.layer(\"" + nameB + "\");\n"
                + "var a = LA.toComp(LA.anchorPoint);\n"
                + "var b = LB.toComp(LB.anchorPoint);\n"
                + "var d = length([a[0],a[1]], [b[0],b[1]]);\n"
                + "var maxD = " + maxDist.toFixed(2) + ";\n"
                + "var base = " + baseOpacity.toFixed(2) + ";\n"
                + "var k = 1 - Math.min(1, d / maxD);\n"
                + "base * Math.max(0.05, k);";
            try { opProp.expression = exprOp; } catch(e){}
        } else {
            opProp.setValue(baseOpacity);
        }
    }

    function buildNodeDots(root, layers, color, dotSize){
        for (var i=0;i<layers.length;i++){
            var g = root.addProperty("ADBE Vector Group");
            g.name = trimName("Node_" + (i+1) + "_" + layers[i].name, 30);
            var inner = g.property("ADBE Vectors Group");
            inner.addProperty("ADBE Vector Shape - Ellipse");
            var fill = inner.addProperty("ADBE Vector Graphic - Fill");
            try { fill.property("ADBE Vector Fill Color").setValue(color); } catch(e){
                try { fill.property("Color").setValue(color); } catch(e2){}
            }
            for (var j=1;j<=inner.numProperties;j++){
                var pp = inner.property(j);
                if (pp && pp.matchName==="ADBE Vector Shape - Ellipse"){
                    pp.property("ADBE Vector Ellipse Size").setValue([dotSize, dotSize]);
                    break;
                }
            }
                       var tr = g.property("ADBE Vector Transform Group");
            var posProp = getVecProp(tr, "ADBE Vector Position", "Position");
            if (!posProp){
                alert("Не найдено свойство Position у группы узла " + (i+1) + ".");
                continue;
            }
            var nm = esc(layers[i].name);
            var exprPos = ""
                + "var L = thisComp.layer(\"" + nm + "\");\n"
                + "var a = L.toComp(L.anchorPoint);\n"
                + "var p = thisLayer.fromComp(a);\n"
                + "[p[0], p[1]];";
            posProp.expression = exprPos;
            if (posProp.expressionError){
                alert("Expression узла " + (i+1) + ":\n" + posProp.expressionError);
            }

        }
    }

    function generate(opts){
        var comp = getComp(); if (!comp) return;
        var sel = comp.selectedLayers;
        if (!sel || sel.length < 2){ alert("Выдели минимум 2 слоя для построения сети."); return; }

        var names = {};
        for (var i0=0;i0<sel.length;i0++){
            var nm0 = sel[i0].name;
            if (names[nm0]) {
                alert("Дублирующееся имя слоя: \"" + nm0 + "\"\nExpression привязан к имени, переименуй и повтори.");
                return;
            }
            names[nm0] = true;
        }

        app.beginUndoGroup(SCRIPT_NAME + " Create Mesh");
        try {
            var edges = buildConnections(sel, opts.mode, opts.K, opts.threshold);
            if (edges.length === 0){
                alert("Ни одной связи не построено. Попробуй другой режим или увеличь порог.");
                app.endUndoGroup(); return;
            }

            var maxDist = 0;
            for (var e=0;e<edges.length;e++) if (edges[e].dist > maxDist) maxDist = edges[e].dist;
            if (maxDist < 1) maxDist = 1;

            var mesh = comp.layers.addShape();
            mesh.name = LAYER_PREFIX + "Mesh";
            var root = mesh.property("ADBE Root Vectors Group");
            try { mesh.property("Transform").property("Anchor Point").setValue([0,0]); } catch(e){}
            try { mesh.property("Transform").property("Position").setValue([0,0]); } catch(e){}

            var color = opts.color;
            for (var i=0;i<edges.length;i++){
                var A = sel[edges[i].a];
                var B = sel[edges[i].b];
                // Короткое имя: Line_N (без имён слоёв в имени группы — они всё равно обрезаются)
                var name = "Line_" + (i+1);
                buildLineGroup(root, name, A, B, color, opts.strokeWidth, opts.opacity, opts.distOpacity, maxDist);
            }

            if (opts.showNodes){
                buildNodeDots(root, sel, color, opts.nodeSize);
            }

            var t0 = comp.time + (opts.startDelay || 0);
            if (opts.animType === "Draw-on"){
                for (var li=0; li<edges.length; li++){
                    var grp = root.property("Line_" + (li+1));
                    if (!grp) continue;
                    var innerG = grp.property("ADBE Vectors Group");
                    var trim = null;
                    for (var jj=1; jj<=innerG.numProperties; jj++){
                        var pr = innerG.property(jj);
                        if (pr && pr.matchName === "ADBE Vector Filter - Trim") { trim = pr; break; }
                    }
                    if (!trim) continue;
                    var endP = trim.property("End");
                    var startT = t0 + li * (opts.stagger || 0);
                    endP.setValueAtTime(startT, 0);
                    endP.setValueAtTime(startT + opts.duration, 100);
                    setEaseOut(endP);
                }
            }
            else if (opts.animType === "Fade-in"){
                var opL = mesh.property("Transform").property("Opacity");
                opL.setValueAtTime(t0, 0);
                opL.setValueAtTime(t0 + opts.duration, 100);
                setEaseOut(opL);
            }

            try { mesh.moveAfter(sel[sel.length-1]); } catch(e){}

        } catch(err){
            alert("Ошибка: " + err.toString());
        } finally {
            app.endUndoGroup();
        }
    }

    function cleanup(){
        var comp = getComp(); if (!comp) return;
        app.beginUndoGroup(SCRIPT_NAME + " Cleanup");
        var removed = 0;
        for (var i = comp.numLayers; i >= 1; i--){
            var L = comp.layer(i);
            if (L && L.name && L.name.indexOf(LAYER_PREFIX) === 0){
                L.remove();
                removed++;
            }
        }
        app.endUndoGroup();
        alert("Удалено слоёв: " + removed);
    }

    function addSlider(parent, label, mn, mx, def, suffix, integer){
        var row = parent.add("group"); row.orientation="row"; row.alignChildren=["left","center"];
        var lbl = row.add("statictext", undefined, label); lbl.preferredSize.width = 110;
        var sl = row.add("slider", undefined, def, mn, mx); sl.preferredSize.width = 140;
        var et = row.add("edittext", undefined, integer ? String(Math.round(def)) : def.toFixed(2));
        et.preferredSize.width = 50;
        var suf = row.add("statictext", undefined, suffix || ""); suf.preferredSize.width = 20;
        sl.onChanging = function(){
            var v = sl.value;
            et.text = integer ? String(Math.round(v)) : v.toFixed(2);
        };
        et.onChange = function(){
            var v = parseFloat(et.text);
            if (!isNaN(v)) { v = clamp(v, mn, mx); sl.value = v; et.text = integer ? String(Math.round(v)) : v.toFixed(2); }
        };
        return { value: function(){ return sl.value; } };
    }

    function buildUI(thisObj){
        var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, {resizeable:true});
        win.orientation = "column"; win.alignChildren = ["fill","top"]; win.margins = 10; win.spacing = 6;

        var headerRow = win.add("group"); headerRow.orientation="row"; headerRow.alignChildren=["fill","center"];
        headerRow.add("statictext", undefined, SCRIPT_NAME + " " + SCRIPT_VERSION).alignment = ["fill","center"];
        var helpBtn = headerRow.add("button", undefined, "?");
        helpBtn.preferredSize.width = 26;

        var pC = win.add("panel", undefined, "СВЯЗИ");
        pC.orientation = "column"; pC.alignChildren = ["fill","top"]; pC.margins = 8; pC.spacing = 4;
        var modeRow = pC.add("group"); modeRow.orientation="row"; modeRow.alignChildren=["fill","center"];
        modeRow.add("statictext", undefined, "Режим:").preferredSize.width = 60;
        var modeDD = modeRow.add("dropdownlist", undefined,
            ["K ближайших","Все пары","MST","По расстоянию","Цепочка","Хаб"]);
        modeDD.selection = 0;
        modeDD.alignment = ["fill","center"]; modeDD.minimumSize.width = 130;
        var kSl = addSlider(pC, "K (соседей):", 1, 10, 3, "", true);
        var thSl = addSlider(pC, "Порог:", 50, 2000, 500, "px", true);

        var pS = win.add("panel", undefined, "СТИЛЬ");
        pS.orientation = "column"; pS.alignChildren = ["fill","top"]; pS.margins = 8; pS.spacing = 4;
        var colorRow = pS.add("group"); colorRow.orientation="row"; colorRow.alignChildren=["left","center"];
        colorRow.add("statictext", undefined, "Цвет:").preferredSize.width = 60;
        var currentColor = [1.00, 0.55, 0.10, 1];
        var colorBtn = colorRow.add("button", undefined, rgbToHex(currentColor));
        colorBtn.preferredSize.width = 90; colorBtn.preferredSize.height = 22;
        colorBtn.onClick = function(){
            var c = $.colorPicker();
            if (c !== -1){
                var r=((c>>16)&255)/255, g=((c>>8)&255)/255, b=(c&255)/255;
                currentColor = [r,g,b,1];
                colorBtn.text = rgbToHex(currentColor);
            }
        };
        var strokeSl = addSlider(pS, "Толщина:", 0.5, 10, 1.5, "px", false);
        var opSl = addSlider(pS, "Прозрачность:", 0, 100, 70, "%", true);
        var distOpCb = pS.add("checkbox", undefined, "Прозрачность зависит от расстояния (ближе = ярче)");
        distOpCb.value = true;

        var pN = win.add("panel", undefined, "УЗЛЫ");
        pN.orientation = "column"; pN.alignChildren = ["fill","top"]; pN.margins = 8; pN.spacing = 4;
        var showNodesCb = pN.add("checkbox", undefined, "Показывать точки-узлы");
        showNodesCb.value = false;
        var nodeSizeSl = addSlider(pN, "Размер точки:", 2, 30, 8, "px", true);

        var pA = win.add("panel", undefined, "АНИМАЦИЯ");
        pA.orientation = "column"; pA.alignChildren = ["fill","top"]; pA.margins = 8; pA.spacing = 4;
        var animRow = pA.add("group"); animRow.orientation="row"; animRow.alignChildren=["fill","center"];
        animRow.add("statictext", undefined, "Тип:").preferredSize.width = 60;
        var animDD = animRow.add("dropdownlist", undefined, ["Draw-on","Fade-in","Без анимации"]);
        animDD.selection = 0;
        animDD.alignment = ["fill","center"]; animDD.minimumSize.width = 130;
        var durSl = addSlider(pA, "Длительность:", 0.1, 5, 0.8, "s", false);
        var stagSl = addSlider(pA, "Задержка каскада:", 0, 0.5, 0.05, "s", false);
        var delaySl = addSlider(pA, "Стартовая задержка:", 0, 5, 0, "s", false);

        var actRow = win.add("group");
        actRow.orientation = "row"; actRow.alignChildren = ["fill","center"]; actRow.alignment = ["fill","bottom"];
        var createBtn = actRow.add("button", undefined, "Создать сеть");
        createBtn.preferredSize.height = 26;
        var removeBtn = actRow.add("button", undefined, "Удалить сеть");
        removeBtn.preferredSize.height = 26;

        createBtn.onClick = function(){
            var opts = {
                mode: modeDD.selection.text,
                K: Math.round(kSl.value()),
                threshold: Math.round(thSl.value()),
                color: currentColor,
                strokeWidth: strokeSl.value(),
                opacity: opSl.value(),
                distOpacity: distOpCb.value,
                showNodes: showNodesCb.value,
                nodeSize: Math.round(nodeSizeSl.value()),
                animType: animDD.selection.text,
                duration: durSl.value(),
                stagger: stagSl.value(),
                startDelay: delaySl.value()
            };
            generate(opts);
        };

        removeBtn.onClick = function(){ cleanup(); };
        helpBtn.onClick = function(){ alert(getHelpText()); };

        if (win instanceof Window){ win.center(); win.show(); }
        else { win.layout.layout(true); win.layout.resize(); }
    }

    function getHelpText(){
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n\n"
            + "Строит живую сеть линий между выделенными слоями.\n\n"
            + "БЫСТРЫЙ СТАРТ:\n"
            + "1. Расставь слои-точки.\n"
            + "2. Выдели минимум 2 слоя.\n"
            + "3. Установи CTI на момент появления сети.\n"
            + "4. Нажми «Создать сеть».\n\n"
            + "РЕЖИМЫ:\n"
            + "• K ближайших — каждая точка соединяется с K соседями (K=3 оптимум).\n"
            + "• Все пары — все со всеми.\n"
            + "• MST — минимальное остовное дерево.\n"
            + "• По расстоянию — только точки ближе порога.\n"
            + "• Цепочка — 1→2→3→...→N в порядке выделения.\n"
            + "• Хаб — первый слой = центр.\n\n"
            + "LIVE UPDATE:\n"
            + "Линии привязаны через expression toComp(anchorPoint). Двигай слои — сетка перестраивается.\n\n"
            + "ВАЖНО:\n"
            + "• Слои должны иметь уникальные имена (expression по имени).\n"
            + "• Имена групп внутри shape ограничены 32 символами — скрипт использует короткие имена Line_N.\n";
    }

    buildUI(thisObj);
})(this);
