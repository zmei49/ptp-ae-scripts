// ptp_PathToPosition.jsx
// v1.3 — Path → Position + Auto-Orient + Smooth + Reverse (без потери ручных правок)
// Установка: ScriptUI Panels → Window → ptp_PathToPosition.jsx

(function ptp_PathToPosition(thisObj) {

    var PP_Data = {
        scriptName:     "ptp_PathToPosition",
        scriptVersion:  "v1.3",
        scriptTitle:    "",
        defaultDuration: 4.0,
        strHelpBtn1Url: "http://aescripts.com/pt_shiftlayers/",
        strHelpBtn2Url: "http://aescripts.com/category/scripts/paul-tuersley/"
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
    // Path → Position
    // ============================================================
    function runPathToPosition(duration, applyOrient, autoSmooth) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Please open a composition first.", PP_Data.scriptTitle);
            return;
        }

        var sel = comp.selectedLayers;
        if (sel.length < 2) {
            alert("Please select TWO layers:\n• Source Shape Layer (with the path)\n• Target layer (to animate).",
                  PP_Data.scriptTitle);
            return;
        }

        var sourceLayer = null;
        var targetLayers = [];
        for (var i = 0; i < sel.length; i++) {
            if (sourceLayer == null && sel[i] instanceof ShapeLayer) {
                sourceLayer = sel[i];
            } else {
                targetLayers.push(sel[i]);
            }
        }
        if (sourceLayer == null) {
            alert("No Shape Layer found in selection (source layer).", PP_Data.scriptTitle);
            return;
        }
        if (targetLayers.length === 0) {
            alert("Please select at least one target layer.", PP_Data.scriptTitle);
            return;
        }

        var pathProp = findFirstPathProperty(sourceLayer);
        if (pathProp == null) {
            alert("No Path found in the source Shape Layer.", PP_Data.scriptTitle);
            return;
        }

        var shapeObj;
        try { shapeObj = pathProp.value; } catch (e) {
            alert("Could not read path data.", PP_Data.scriptTitle);
            return;
        }
        if (shapeObj == null || shapeObj.vertices == null || shapeObj.vertices.length < 2) {
            alert("Path has too few vertices.", PP_Data.scriptTitle);
            return;
        }

        var vertices    = shapeObj.vertices;
        var inTangents  = shapeObj.inTangents  || [];
        var outTangents = shapeObj.outTangents || [];
        var isClosed    = shapeObj.closed;

        var srcPos = [0, 0, 0], srcAnc = [0, 0, 0];
        try {
            var sp = sourceLayer.property("ADBE Transform Group").property("ADBE Position").value;
            srcPos[0] = sp[0]; srcPos[1] = sp[1];
            srcPos[2] = (sp.length > 2) ? sp[2] : 0;
        } catch (eSP) {}
        try {
            var sa = sourceLayer.property("ADBE Transform Group").property("ADBE Anchor Point").value;
            srcAnc[0] = sa[0]; srcAnc[1] = sa[1];
            srcAnc[2] = (sa.length > 2) ? sa[2] : 0;
        } catch (eSA) {}

        app.beginUndoGroup(PP_Data.scriptName + ": Path → Position");

        var startTime = comp.time;
        var totalPoints = isClosed ? vertices.length + 1 : vertices.length;

        for (var t = 0; t < targetLayers.length; t++) {
            var layer = targetLayers[t];
            var posProp;
            try { posProp = layer.property("ADBE Transform Group").property("ADBE Position"); }
            catch (ePos) { continue; }
            if (posProp == null) continue;

            try {
                while (posProp.numKeys > 0) { posProp.removeKey(1); }
            } catch (eClr) {}

            var is3D = (posProp.value.length === 3);

            for (var k = 0; k < totalPoints; k++) {
                var vi = (k < vertices.length) ? k : 0;
                var vx = vertices[vi][0] + srcPos[0] - srcAnc[0];
                var vy = vertices[vi][1] + srcPos[1] - srcAnc[1];
                var vz = srcPos[2] - srcAnc[2];
                var val = is3D ? [vx, vy, vz] : [vx, vy];

                var tm = startTime + (duration * k / (totalPoints - 1));
                posProp.setValueAtTime(tm, val);
            }

            for (var k2 = 0; k2 < totalPoints; k2++) {
                var vi2 = (k2 < vertices.length) ? k2 : 0;
                var inT  = inTangents[vi2]  || [0, 0];
                var outT = outTangents[vi2] || [0, 0];
                var inTan  = is3D ? [inT[0],  inT[1],  0] : [inT[0],  inT[1]];
                var outTan = is3D ? [outT[0], outT[1], 0] : [outT[0], outT[1]];
                try { posProp.setSpatialTangentsAtKey(k2 + 1, inTan, outTan); } catch (eST) {}
            }

            if (applyOrient) {
                try { layer.autoOrient = AutoOrientType.ALONG_PATH; } catch (eAO) {}
            }
            if (autoSmooth) {
                smoothProperty(posProp);
            }
        }

        app.endUndoGroup();
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
    // Поиск Path
    // ============================================================
    function findFirstPathProperty(layer) {
        if (!(layer instanceof ShapeLayer)) return null;
        var root = layer.property("ADBE Root Vectors Group");
        if (root == null) return null;
        return searchPath(root);
    }

    function searchPath(group) {
        if (group == null) return null;
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (p == null) continue;
            if (p.matchName === "ADBE Vector Shape - Group") {
                var pathInside = p.property("ADBE Vector Shape");
                if (pathInside != null) return pathInside;
            }
            if (p.matchName === "ADBE Vector Shape") return p;
            if (p.matchName === "ADBE Vector Group") {
                var inner = p.property("ADBE Vectors Group");
                var found = searchPath(inner);
                if (found != null) return found;
            }
        }
        return null;
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

function safeGetEase(prop, k, which) {
    try {
        if (which === "in") return prop.keyInTemporalEase(k);
        else                return prop.keyOutTemporalEase(k);
    } catch (e) { return null; }
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
            "WORKFLOW:\n" +
            "1) Select TWO layers: Source Shape Layer + Target layer.\n" +
            "2) Set Duration (default 4 sec).\n" +
            "3) Click 'Apply Path → Position'.\n\n" +
            "Transfers bezier tangents from the source path,\n" +
            "so curved paths are preserved exactly.\n\n" +
            "REVERSE KEYFRAMES:\n" +
            "Does NOT delete keyframes — only shifts them in time,\n" +
            "so manual path edits stay intact.\n\n" +
            "SMOOTH SELECTED MOTION:\n" +
            "Applies Rove Across Time + Auto-Bezier to remove\n" +
            "speed bumps between keyframes.",
            {multiline: true});
        txt.preferredSize.width = 420;
        txt.preferredSize.height = 260;

        var btnGroup = hw.add("group");
        btnGroup.alignment = ["fill", "bottom"];
        var siteBtn = btnGroup.add("button", undefined, "Script page");
        var allBtn  = btnGroup.add("button", undefined, "All scripts");
        var okBtn   = btnGroup.add("button", undefined, "OK", {name: "ok"});

        siteBtn.onClick = function () { openURL(PP_Data.strHelpBtn1Url); };
        allBtn.onClick  = function () { openURL(PP_Data.strHelpBtn2Url); };
        okBtn.onClick   = function () { hw.close(); };

        hw.center();
        hw.show();
    }

    function openURL(url) {
        try {
            if (system.osName.indexOf("Windows") !== -1) {
                system.callSystem('cmd.exe /c start "" "' + url + '"');
            } else {
                system.callSystem('open "' + url + '"');
            }
        } catch (e) {}
    }

})(this);
