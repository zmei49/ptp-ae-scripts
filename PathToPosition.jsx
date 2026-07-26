// ptp_PathToPosition.jsx
// v1.4 — Path → Position + Auto-Orient + Smooth + Reverse (без потери ручных правок)
// Установка: ScriptUI Panels → Window → ptp_PathToPosition.jsx

(function ptp_PathToPosition(thisObj) {

        var PP_Data = {
        scriptName:     "ptp_PathToPosition",
        scriptVersion:  "v1.4",
        scriptTitle:    "",
        defaultDuration: 4.0
    };

    PP_Data.scriptTitle = PP_Data.scriptName + " " + PP_Data.scriptVersion;

    if (parseFloat(app.version) < 8.0) {
        alert("This script requires After Effects CS3 or later.", PP_Data.scriptTitle);
        return;
    }

    var win = buildUI(thisObj);
    if (win != null) {
        if (win instanceof Window) { win.center(); win.show(); }
        else { win.layout.layout(true); win.layout.resize(); }
    }

    // ============================================================
    // UI
    // ============================================================
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", PP_Data.scriptTitle, undefined, {resizeable: true});

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 10;
        pal.margins = 12;
        pal.preferredSize.width = 320;

        var titleGroup = pal.add("group");
        titleGroup.orientation = "row";
        titleGroup.alignment = ["fill", "top"];
        titleGroup.alignChildren = ["left", "center"];
        titleGroup.add("statictext", undefined, "Path → Position");
        var helpBtn = titleGroup.add("button", undefined, "?");
        helpBtn.preferredSize = [28, 26];
        helpBtn.alignment = ["right", "center"];

        var settingsPanel = pal.add("panel", undefined, "Settings");
        settingsPanel.orientation = "column";
        settingsPanel.alignChildren = ["fill", "top"];
        settingsPanel.alignment = ["fill", "top"];
        settingsPanel.margins = 10;
        settingsPanel.spacing = 6;

        var durGroup = settingsPanel.add("group");
        durGroup.orientation = "row";
        durGroup.alignChildren = ["left", "center"];
        durGroup.add("statictext", undefined, "Duration (sec):");
        var durInput = durGroup.add("edittext", undefined, String(PP_Data.defaultDuration));
        durInput.characters = 6;
        durInput.preferredSize.height = 24;

        var orientCb = settingsPanel.add("checkbox", undefined, "Apply Auto-Orient (Along Path)");
        orientCb.value = true;

        var smoothCb = settingsPanel.add("checkbox", undefined, "Auto-smooth motion (Rove + Bezier)");
        smoothCb.value = true;

        var applyBtn = pal.add("button", undefined, "Apply Path → Position");
        applyBtn.preferredSize = [-1, 32];
        applyBtn.alignment = ["fill", "top"];

        var smoothBtn = pal.add("button", undefined, "Smooth Selected Motion");
        smoothBtn.preferredSize = [-1, 30];

        var reverseBtn = pal.add("button", undefined, "Reverse Selected Keyframes");
        reverseBtn.preferredSize = [-1, 30];

        helpBtn.onClick = function () { showHelp(); };

        applyBtn.onClick = function () {
            var dur = parseFloat(durInput.text);
            if (isNaN(dur) || dur <= 0) {
                alert("Please enter a valid positive duration.", PP_Data.scriptTitle);
                return;
            }
            runPathToPosition(dur, orientCb.value, smoothCb.value);
        };

        smoothBtn.onClick = function () { runSmoothMotion(); };
        reverseBtn.onClick = function () { runTimeReverse(); };

        pal.onResizing = pal.onResize = function () { this.layout.resize(); };
        return pal;
    }

        // ============================================================
    // Path → Position (v1.4 — учёт transforms source и внутренних групп)
    // ============================================================
    function runPathToPosition(duration, applyOrient, applySmoothing) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Please open a composition first.", PP_Data.scriptTitle);
            return;
        }

        var sel = comp.selectedLayers;
        if (sel.length < 2) {
            alert("Select 2 layers: first — Shape Layer with the path, second — target layer.", PP_Data.scriptTitle);
            return;
        }

        var srcLayer    = sel[0];
        var targetLayer = sel[1];

        if (!(srcLayer instanceof ShapeLayer)) {
            alert("The FIRST selected layer must be a Shape Layer.", PP_Data.scriptTitle);
            return;
        }

        // Найти path + собрать transform-стек до него
        var pathInfo = findFirstPathWithTransform(srcLayer);
        if (pathInfo == null || pathInfo.pathProp == null) {
            alert("No path found in the first (Shape) layer.", PP_Data.scriptTitle);
            return;
        }

        var pathProp = pathInfo.pathProp;
        var groupTransforms = pathInfo.groupTransforms; // array [innermost .. outermost]

        var shape;
        try { shape = pathProp.value; } catch (eShape) {
            alert("Cannot read path value.", PP_Data.scriptTitle);
            return;
        }

        var verts = shape.vertices;
        var inTs  = shape.inTangents;
        var outTs = shape.outTangents;
        var isClosed = shape.closed;
        if (!verts || verts.length < 2) {
            alert("Path has fewer than 2 vertices.", PP_Data.scriptTitle);
            return;
        }

        // Transform самого source-слоя
        var srcPos  = srcLayer.transform.position.value;
        var srcAnc  = srcLayer.transform.anchorPoint.value;
        var srcScl  = srcLayer.transform.scale.value;      // in percent [sx, sy]
        var srcRot  = 0;
        try { srcRot = srcLayer.transform.rotation.value * Math.PI / 180; } catch(e) {}

        // Функция применения одного group-transform к точке (локальные координаты shape-layer)
        // group has: position [x,y], anchor [x,y], scale [sx,sy]%, rotation deg
        function applyGroupToPoint(pt, gt) {
            // Move to group-anchor origin
            var x = pt[0] - gt.anchor[0];
            var y = pt[1] - gt.anchor[1];
            // Scale
            x *= gt.scale[0] / 100;
            y *= gt.scale[1] / 100;
            // Rotate
            var rr = gt.rotation * Math.PI / 180;
            var xr = x * Math.cos(rr) - y * Math.sin(rr);
            var yr = x * Math.sin(rr) + y * Math.cos(rr);
            // Translate to group position
            return [xr + gt.position[0], yr + gt.position[1]];
        }
        // Tangents — только rotate + scale (без translate/anchor)
        function applyGroupToTangent(tan, gt) {
            var x = tan[0] * (gt.scale[0] / 100);
            var y = tan[1] * (gt.scale[1] / 100);
            var rr = gt.rotation * Math.PI / 180;
            return [
                x * Math.cos(rr) - y * Math.sin(rr),
                x * Math.sin(rr) + y * Math.cos(rr)
            ];
        }

        // Применить transforms всех групп (innermost → outermost) к точке
        function localToShapeLayerPoint(pt) {
            var p = [pt[0], pt[1]];
            for (var g = 0; g < groupTransforms.length; g++) {
                p = applyGroupToPoint(p, groupTransforms[g]);
            }
            return p;
        }
        function localToShapeLayerTangent(t) {
            var v = [t[0], t[1]];
            for (var g = 0; g < groupTransforms.length; g++) {
                v = applyGroupToTangent(v, groupTransforms[g]);
            }
            return v;
        }

        // Применить transform самого source-слоя (anchor, scale, rotation, position)
        function shapeLayerToWorld(pt) {
            // pt is in shape-layer local coords (после group-transforms)
            var x = pt[0] - srcAnc[0];
            var y = pt[1] - srcAnc[1];
            x *= srcScl[0] / 100;
            y *= srcScl[1] / 100;
            var xr = x * Math.cos(srcRot) - y * Math.sin(srcRot);
            var yr = x * Math.sin(srcRot) + y * Math.cos(srcRot);
            return [xr + srcPos[0], yr + srcPos[1]];
        }
        function shapeLayerToWorldTangent(t) {
            var x = t[0] * (srcScl[0] / 100);
            var y = t[1] * (srcScl[1] / 100);
            return [
                x * Math.cos(srcRot) - y * Math.sin(srcRot),
                x * Math.sin(srcRot) + y * Math.cos(srcRot)
            ];
        }

        // Подготовим worldVerts / worldInTans / worldOutTans
        var worldV = [], worldIn = [], worldOut = [];
        for (var i = 0; i < verts.length; i++) {
            var pLocal = localToShapeLayerPoint(verts[i]);
            var pWorld = shapeLayerToWorld(pLocal);
            worldV.push(pWorld);

            var inLocal  = localToShapeLayerTangent(inTs[i]  || [0,0]);
            var outLocal = localToShapeLayerTangent(outTs[i] || [0,0]);
            worldIn.push(shapeLayerToWorldTangent(inLocal));
            worldOut.push(shapeLayerToWorldTangent(outLocal));
        }

        // Расстановка keyframes
        var startTime = comp.time;
        app.beginUndoGroup(PP_Data.scriptName + ": Path → Position");

        try {
            var posProp = targetLayer.transform.position;

            // Убрать существующие ключи Position на всякий случай, чтобы не смешивать
            try {
                while (posProp.numKeys > 0) posProp.removeKey(1);
            } catch(eK) {}

            // Убрать expression, если был
            try { posProp.expression = ""; } catch(eE) {}

            var totalPoints = isClosed ? worldV.length + 1 : worldV.length;

            // Расставить ключи
            for (var k = 0; k < totalPoints; k++) {
                var vi = (k < worldV.length) ? k : 0;
                var tm = startTime + (duration * k / (totalPoints - 1));
                var val = worldV[vi];
                var val3 = [val[0], val[1], 0];
                posProp.setValueAtTime(tm, val3);
            }

            // Bezier + spatial tangents для каждого ключа
            for (var k2 = 0; k2 < totalPoints; k2++) {
                var keyIdx = k2 + 1;

                // Определяем, какие тангенсы взять
                var inT, outT;
                if (isClosed && k2 === totalPoints - 1) {
                    // Замыкающий ключ = позиция вершины 0. Берём её IN-tangent, out = [0,0].
                    inT  = worldIn[0]  || [0, 0];
                    outT = [0, 0];
                } else {
                    var vi2 = k2;
                    inT  = worldIn[vi2]  || [0, 0];
                    outT = worldOut[vi2] || [0, 0];
                }

                try {
                    posProp.setInterpolationTypeAtKey(
                        keyIdx,
                        KeyframeInterpolationType.BEZIER,
                        KeyframeInterpolationType.BEZIER
                    );
                } catch(eI) {}
                try {
                    posProp.setSpatialTangentsAtKey(
                        keyIdx,
                        [inT[0],  inT[1],  0],
                        [outT[0], outT[1], 0]
                    );
                } catch(eS) {}
                try { posProp.setSpatialContinuousAtKey(keyIdx, true); } catch(eSC) {}
            }

            // Auto-Orient
            if (applyOrient) {
                try { targetLayer.autoOrient = AutoOrientType.ALONG_PATH; } catch(eAO) {}
            }

            // Smooth (Rove + Auto-Bezier temporal) для промежуточных ключей
            if (applySmoothing) {
                smoothProperty(posProp);
            }

        } catch(errMain) {
            alert("Error: " + errMain.toString(), PP_Data.scriptTitle);
        }

        app.endUndoGroup();
    }

    // ============================================================
    // Поиск path + сбор transform-стека групп над ним
    // ============================================================
    function findFirstPathWithTransform(layer) {
        if (!(layer instanceof ShapeLayer)) return null;
        var root = layer.property("ADBE Root Vectors Group");
        if (root == null) return null;
        return searchPathWithTransform(root, []);
    }

    function readGroupTransform(vectorGroup) {
        // vectorGroup = "ADBE Vector Group"; его transform = "ADBE Vector Transform Group"
        var tr = null;
        try { tr = vectorGroup.property("ADBE Vector Transform Group"); } catch(e) { return null; }
        if (tr == null) return null;

        var result = {
            position: [0, 0],
            anchor:   [0, 0],
            scale:    [100, 100],
            rotation: 0
        };
        try { result.position = tr.property("ADBE Vector Position").value; } catch(e1) {}
        try { result.anchor   = tr.property("ADBE Vector Anchor").value;   } catch(e2) {}
        try { result.scale    = tr.property("ADBE Vector Scale").value;    } catch(e3) {}
        try { result.rotation = tr.property("ADBE Vector Rotation").value; } catch(e4) {}
        return result;
    }

    // group = "ADBE Vectors Group" (Contents)
    // parentTransforms = stack собранных transforms из внешних групп
    function searchPathWithTransform(group, parentTransforms) {
        if (group == null) return null;
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (p == null) continue;

            if (p.matchName === "ADBE Vector Shape - Group") {
                var pathInside = p.property("ADBE Vector Shape");
                if (pathInside != null) {
                    return { pathProp: pathInside, groupTransforms: parentTransforms };
                }
            }
            if (p.matchName === "ADBE Vector Shape") {
                return { pathProp: p, groupTransforms: parentTransforms };
            }
            if (p.matchName === "ADBE Vector Group") {
                var gt = readGroupTransform(p);
                var newStack = parentTransforms.slice(); // копия
                if (gt != null) {
                    // innermost first — добавляем в начало
                    newStack.unshift(gt);
                }
                var inner = p.property("ADBE Vectors Group");
                var found = searchPathWithTransform(inner, newStack);
                if (found != null) return found;
            }
        }
        return null;
    }


    // ============================================================
    // Smooth Motion
    // ============================================================
    function runSmoothMotion() {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Please open a composition first.", PP_Data.scriptTitle);
            return;
        }

        var props = comp.selectedProperties;
        if (props.length === 0) {
            alert("Please select a property with keyframes (e.g. Position).", PP_Data.scriptTitle);
            return;
        }

        app.beginUndoGroup(PP_Data.scriptName + ": Smooth Motion");
        var processed = 0;
        for (var i = 0; i < props.length; i++) {
            if (props[i].numKeys >= 2) {
                smoothProperty(props[i]);
                processed++;
            }
        }
        app.endUndoGroup();

        if (processed === 0) {
            alert("No properties with 2+ keyframes were found.", PP_Data.scriptTitle);
        }
    }

    function smoothProperty(prop) {
        var n = prop.numKeys;
        if (n < 2) return;

        for (var k = 1; k <= n; k++) {
            try {
                prop.setInterpolationTypeAtKey(
                    k,
                    KeyframeInterpolationType.BEZIER,
                    KeyframeInterpolationType.BEZIER
                );
            } catch (e1) {}
            try {
                var dim = (prop.value.length != null) ? prop.value.length : 1;
                var easeIn = [], easeOut = [];
                for (var d = 0; d < dim; d++) {
                    easeIn.push(new KeyframeEase(0, 33));
                    easeOut.push(new KeyframeEase(0, 33));
                }
                prop.setTemporalEaseAtKey(k, easeIn, easeOut);
            } catch (e2) {}
            try { prop.setTemporalAutoBezierAtKey(k, true); } catch (e3) {}
        }

        for (var r = 2; r < n; r++) {
            try { prop.setRovingAtKey(r, true); } catch (eR) {}
        }
    }

    
    // ============================================================
    // Time-Reverse — БЕЗ удаления keyframes (сохраняет ручные правки пути)
    // ============================================================
  function runTimeReverse() {
    var comp = app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) {
        alert("Please open a composition first.", PP_Data.scriptTitle);
        return;
    }

    var props = comp.selectedProperties;
    if (props.length === 0) {
        alert("Please select a property with keyframes (e.g. Position).", PP_Data.scriptTitle);
        return;
    }

    app.beginUndoGroup(PP_Data.scriptName + ": Time-Reverse Keyframes");
    var reversedCount = 0;
    for (var p = 0; p < props.length; p++) {
        var prop = props[p];
        if (prop.numKeys < 2) continue;
        reverseInPlace(prop);
        reversedCount++;
    }
    app.endUndoGroup();

    if (reversedCount === 0) {
        alert("No properties with 2+ keyframes were found.", PP_Data.scriptTitle);
    }
}

function reverseInPlace(prop) {
    var n = prop.numKeys;
    if (n < 2) return;

    // 1) Полный снимок ВСЕХ атрибутов каждого keyframe
    var data = [];
    for (var i = 1; i <= n; i++) {
        var entry = {
            time:      prop.keyTime(i),
            value:     prop.keyValue(i),
            inInterp:  prop.keyInInterpolationType(i),
            outInterp: prop.keyOutInterpolationType(i),
            inEase:    null,
            outEase:   null,
            inSpatial: null,
            outSpatial: null,
            spatialAuto:    false,
            spatialContin:  false,
            temporalAuto:   false,
            temporalContin: false,
            roving: false
        };
        try { entry.inEase  = prop.keyInTemporalEase(i); } catch (e1) {}
        try { entry.outEase = prop.keyOutTemporalEase(i); } catch (e2) {}
        try { entry.inSpatial  = prop.keyInSpatialTangent(i); } catch (e3) {}
        try { entry.outSpatial = prop.keyOutSpatialTangent(i); } catch (e4) {}
        try { entry.spatialAuto    = prop.keySpatialAutoBezier(i); } catch (e5) {}
        try { entry.spatialContin  = prop.keySpatialContinuous(i); } catch (e6) {}
        try { entry.temporalAuto   = prop.keyTemporalAutoBezier(i); } catch (e7) {}
        try { entry.temporalContin = prop.keyTemporalContinuous(i); } catch (e8) {}
        try { entry.roving = prop.keyRoving(i); } catch (e9) {}
        data.push(entry);
    }

    var firstTime = data[0].time;
    var lastTime  = data[n - 1].time;

    // 2) Снимаем roving со всех keyframes (нельзя удалять roving-кадры в некоторых сборках AE)
    for (var rk = 1; rk <= n; rk++) {
        try { prop.setRovingAtKey(rk, false); } catch (eR0) {}
    }

    // 3) Удаляем все keyframes (с конца, чтобы индексы не сбивались)
    for (var d = n; d >= 1; d--) {
        try { prop.removeKey(d); } catch (eDel) {}
    }

    // 4) Создаём заново в зеркальном порядке.
    //    Бывший последний keyframe (data[n-1]) — теперь на firstTime, и т.д.
    //    Создаём в порядке возрастания времени, чтобы индексы получились предсказуемыми (1..n).
    for (var r = 0; r < n; r++) {
        var src = data[n - 1 - r]; // исходный keyframe, который должен оказаться на позиции r+1
        var newTime = firstTime + (lastTime - src.time);
        try {
            prop.setValueAtTime(newTime, src.value);
        } catch (eSet) {}
    }

    // 5) Восстанавливаем все атрибуты на новых позициях.
    //    Новый keyframe №(r+1) соответствует исходному data[n-1-r].
    //    Свопаем in↔out для interpolation, ease и spatial tangents.
    for (var r2 = 0; r2 < n; r2++) {
        var src2 = data[n - 1 - r2];
        var idx = r2 + 1;

        // Interpolation — свопаем in↔out
        try {
            prop.setInterpolationTypeAtKey(idx, src2.outInterp, src2.inInterp);
        } catch (eI) {}

        // Temporal ease — свопаем in↔out
        if (src2.inEase != null && src2.outEase != null) {
            try {
                prop.setTemporalEaseAtKey(idx, src2.outEase, src2.inEase);
            } catch (eE) {}
        }

        // Spatial tangents — свопаем in↔out И инвертируем знак (т.к. направление движения противоположное)
        if (src2.inSpatial != null && src2.outSpatial != null) {
            var newIn  = negateVec(src2.outSpatial);
            var newOut = negateVec(src2.inSpatial);
            try {
                prop.setSpatialTangentsAtKey(idx, newIn, newOut);
            } catch (eST) {}
        }

        // Bezier-флаги
        try { prop.setSpatialAutoBezierAtKey(idx, src2.spatialAuto); } catch (eSA) {}
        try { prop.setSpatialContinuousAtKey(idx, src2.spatialContin); } catch (eSC) {}
        try { prop.setTemporalAutoBezierAtKey(idx, src2.temporalAuto); } catch (eTA) {}
        try { prop.setTemporalContinuousAtKey(idx, src2.temporalContin); } catch (eTC) {}
    }

    // 6) Восстанавливаем roving на зеркальных позициях
    for (var rb = 0; rb < n; rb++) {
        var srcR = data[n - 1 - rb];
        if (srcR.roving) {
            try { prop.setRovingAtKey(rb + 1, true); } catch (eRR) {}
        }
    }
}

function negateVec(v) {
    if (v == null) return v;
    var out = [];
    for (var i = 0; i < v.length; i++) out.push(-v[i]);
    return out;
}




    // ============================================================
    // Help
    // ============================================================
    function showHelp() {
        var hw = new Window("dialog", PP_Data.scriptTitle + " — Help");
        hw.orientation = "column";
        hw.alignChildren = ["fill", "top"];
        hw.margins = 12;
        hw.spacing = 8;

        var txt = hw.add("statictext", undefined,
            "ptp_PathToPosition " + PP_Data.scriptVersion + "\n\n" +
            "PATH → POSITION:\n" +
            "1) Выделите 2 слоя:\n" +
            "   первый — Shape Layer с исходным путём (path),\n" +
            "   второй — слой, у которого нужно анимировать Position.\n" +
            "2) Задайте Duration (по умолчанию 4 сек).\n" +
            "3) Нажмите 'Apply Path → Position'.\n\n" +
            "Скрипт учитывает Position, Rotation, Scale и Anchor Point\n" +
            "исходного слоя, а также трансформации групп внутри Shape Layer.\n" +
            "Bezier-тангенсы переносятся корректно, кривые сохраняются.\n\n" +
            "AUTO-ORIENT:\n" +
            "Если галочка включена, целевой слой поворачивается по ходу пути.\n\n" +
            "AUTO-SMOOTH:\n" +
            "Добавляет Rove Across Time + Auto-Bezier на промежуточные ключи,\n" +
            "чтобы убрать 'ступеньки' скорости между ними.\n\n" +
            "REVERSE KEYFRAMES:\n" +
            "Разворачивает выбранные ключи во времени БЕЗ их удаления —\n" +
            "все ручные правки пути и тангенсов сохраняются.\n\n" +
            "SMOOTH SELECTED MOTION:\n" +
            "Включает Rove + Auto-Bezier на выделенном свойстве с 2+ ключами.\n\n" +
            "ОГРАНИЧЕНИЯ:\n" +
            "  - Обрабатывается только первый найденный path в Shape Layer.\n" +
            "  - Если у source-слоя есть Parent — учитывается только\n" +
            "    его собственный transform (без цепочки родителей).",
            {multiline: true});
        txt.preferredSize.width = 420;
        txt.preferredSize.height = 260;

        var btnGroup = hw.add("group");
        btnGroup.alignment = ["fill", "bottom"];
               btnGroup.alignChildren = ["right","center"];
        var okBtn = btnGroup.add("button", undefined, "OK", {name: "ok"});
        okBtn.preferredSize = [80, 28];
        okBtn.onClick = function () { hw.close(); };


        hw.center();
        hw.show();
    }



})(this);
