// ptp_GPSLock.jsx v1.0
// After Effects — GPS scanner / target lock overlay
// Author: ptp

(function ptp_GPSLock(thisObj) {
       var SCRIPT_NAME = "ptp_GPSLock";
    var SCRIPT_VERSION = "v1.1";
    var LAYER_PREFIX = "GPS_";
    // v1.1 changelog:
    //   • Fix: Fill Color / Stroke Color / Stroke Width / Line Cap
    //          через matchName (не англ.-only локали)
    //   • Feature: font fallback (Arial → Helvetica → ArialMT)
    //   • UI: перевод на русский


    // ---------- helpers ----------
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Откройте композицию."); return null; }
        return c;
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function hexToRGB(hex) {
        hex = hex.replace("#","");
        return [parseInt(hex.substr(0,2),16)/255, parseInt(hex.substr(2,2),16)/255, parseInt(hex.substr(4,2),16)/255];
    }
    function rgbToHex(rgb) {
        function h(v){ var s = Math.round(v*255).toString(16); return s.length<2?"0"+s:s; }
        return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
    }
    function pickColor(current) {
        var picked = $.colorPicker(parseInt(rgbToHex(current).replace("#",""), 16));
        if (picked === -1) return current;
        var r = ((picked >> 16) & 0xFF) / 255;
        var g = ((picked >> 8) & 0xFF) / 255;
        var b = (picked & 0xFF) / 255;
        return [r, g, b];
    }
    function setHold(prop) {
        for (var k = 1; k <= prop.numKeys; k++) {
            prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
        }
    }
    function setEaseOut(prop) {
        for (var k = 1; k <= prop.numKeys; k++) {
            var ei = new KeyframeEase(0, 66);
            var eo = new KeyframeEase(0, 66);
            try { prop.setTemporalEaseAtKey(k, [ei,ei,ei], [eo,eo,eo]); } catch(e){}
        }
    }
    function randFloat(min, max) { return min + Math.random()*(max-min); }

    // random GPS coordinate
    function randomCoords() {
        var lat = randFloat(-89, 89);
        var lon = randFloat(-179, 179);
        var latDir = lat >= 0 ? "N" : "S";
        var lonDir = lon >= 0 ? "E" : "W";
        return Math.abs(lat).toFixed(4) + "° " + latDir + "  " + Math.abs(lon).toFixed(4) + "° " + lonDir;
    }

    // get layer's comp-space position (2D)
    function getLayerCompPoint(layer) {
        try {
            var p = layer.property("Transform").property("Position").value;
            return [p[0]||0, p[1]||0];
        } catch(e) { return [0,0]; }
    }
    // Font fallback: Windows → Arial, Mac → Helvetica/ArialMT
    function setMonoFont(td) {
        var candidates = ["Arial", "Helvetica", "ArialMT", "Verdana"];
        for (var i = 0; i < candidates.length; i++) {
            try { td.font = candidates[i]; return; } catch(e) {}
        }
    }


    // ---------- Ambient Ping builder ----------
    function buildAmbient(comp, srcLayer, opts, idx) {
        var t0 = comp.time + randFloat(0, opts.randStartDelay);
        var pos = srcLayer ? getLayerCompPoint(srcLayer) : [comp.width/2, comp.height/2];

        var L = comp.layers.addShape();
        L.name = LAYER_PREFIX + (srcLayer ? srcLayer.name : "center") + "_Ping_" + (idx+1);
        var root = L.property("ADBE Root Vectors Group");

        // reset transform to comp space
        try { L.property("Transform").property("Anchor Point").setValue([0,0]); } catch(e){}
        L.property("Transform").property("Position").setValue(pos);
        if (opts.parentToSource && srcLayer) L.parent = srcLayer;

        // --- base dot ---
        var dotGrp = root.addProperty("ADBE Vector Group");
        dotGrp.name = "Dot";
        var dotInner = dotGrp.property("ADBE Vectors Group");
        var dotEll = dotInner.addProperty("ADBE Vector Shape - Ellipse");
        var dotFill = dotInner.addProperty("ADBE Vector Graphic - Fill");
        try { dotFill.property("ADBE Vector Fill Color").setValue(opts.color); } catch(e){}
        var dotStroke = dotInner.addProperty("ADBE Vector Graphic - Stroke");
        try { dotStroke.property("ADBE Vector Stroke Color").setValue(opts.color); } catch(e){}
        try { dotStroke.property("ADBE Vector Stroke Width").setValue(1.5); } catch(e){}

        // resize
        for (var ei = 1; ei <= dotInner.numProperties; ei++) {
            var pp = dotInner.property(ei);
            if (pp && pp.matchName === "ADBE Vector Shape - Ellipse") {
                pp.property("ADBE Vector Ellipse Size").setValue([opts.size, opts.size]);
                break;
            }
        }

        // --- rings ---
        var interval = opts.pingInterval;
        var maxR = opts.maxRadius;
        var pingDur = opts.pingDuration;

        for (var r = 0; r < opts.ringCount; r++) {
            var ringGrp = root.addProperty("ADBE Vector Group");
            ringGrp.name = "Ring_" + (r+1);
            var ringInner = ringGrp.property("ADBE Vectors Group");
            var ringEll = ringInner.addProperty("ADBE Vector Shape - Ellipse");
            var ringStroke = ringInner.addProperty("ADBE Vector Graphic - Stroke");
            try { ringStroke.property("ADBE Vector Stroke Color").setValue(opts.color); } catch(e){}
            try { ringStroke.property("ADBE Vector Stroke Width").setValue(opts.pingStrokeWidth); } catch(e){}


            var ringEllRef = null;
            for (var ee = 1; ee <= ringInner.numProperties; ee++) {
                var xp = ringInner.property(ee);
                if (xp && xp.matchName === "ADBE Vector Shape - Ellipse") { ringEllRef = xp; break; }
            }
            var sizeProp = ringEllRef.property("ADBE Vector Ellipse Size");

            // phase-shifted start per ring
            var phase = t0 + r * (interval / opts.ringCount) + randFloat(-opts.jitter, opts.jitter);
            var startT = phase;
            var endT = phase + pingDur;

            sizeProp.setValueAtTime(startT, [0, 0]);
            sizeProp.setValueAtTime(endT, [maxR*2, maxR*2]);
            setEaseOut(sizeProp);

            // opacity via group Transform Opacity
            var ringTr = ringGrp.property("ADBE Vector Transform Group");
            var opP = ringTr.property("ADBE Vector Group Opacity");
            opP.setValueAtTime(startT, opts.pingOpacity);
            opP.setValueAtTime(endT, 0);

            if (opts.loop) {
                var loopExpr = "loopOut('cycle');";
                try { sizeProp.expression = loopExpr; } catch(e){}
                try { opP.expression = loopExpr; } catch(e){}
            }
        }

        L.moveBefore(srcLayer || comp.layer(1));
        return L;
    }

    // ---------- Target Lock builder ----------
    function buildTargetLock(comp, srcLayer, opts, idx) {
    var subStep = "init";
    try {
        var t0 = comp.time + randFloat(0, opts.randStartDelay) + (idx * 0.15);
        var pos = srcLayer ? getLayerCompPoint(srcLayer) : [comp.width/2, comp.height/2];
        var scanEnd = t0 + opts.scanDuration;
        var lockEnd = scanEnd + opts.lockDuration;

        subStep = "addLayer";
        var L = comp.layers.addShape();
        L.name = LAYER_PREFIX + (srcLayer ? srcLayer.name : "center") + "_Lock_" + (idx+1);

        subStep = "getRoot";
        var root = L.property("ADBE Root Vectors Group");

        subStep = "setTransform";
        try { L.property("Transform").property("Anchor Point").setValue([0,0]); } catch(e){}
        L.property("Transform").property("Position").setValue(pos);
        if (opts.parentToSource && srcLayer) L.parent = srcLayer;

        var size = opts.size;
        var color = opts.color;

        subStep = "corners";
        if (opts.showCorners) {
            var br = size * 1.8;
            var bLen = size * 0.5;
            var corners = [
                { off: [-br, -br], h: [1, 0], v: [0, 1] },
                { off: [ br, -br], h: [-1, 0], v: [0, 1] },
                { off: [-br,  br], h: [1, 0], v: [0, -1] },
                { off: [ br,  br], h: [-1, 0], v: [0, -1] }
            ];
            for (var c = 0; c < 4; c++) {
                var cor = corners[c];
                addBracketArm(root, "Corner_" + (c+1) + "H", [cor.off[0], cor.off[1]], [cor.off[0] + cor.h[0]*bLen, cor.off[1]], color, opts.strokeWidth);
                addBracketArm(root, "Corner_" + (c+1) + "V", [cor.off[0], cor.off[1]], [cor.off[0], cor.off[1] + cor.v[1]*bLen], color, opts.strokeWidth);
            }
        }

        subStep = "crosshair";
        if (opts.showCrosshair) {
            var chLen = size * 0.6;
            if (opts.crosshairStyle === "Cross") {
                addBracketArm(root, "CH_H", [-chLen, 0], [chLen, 0], color, opts.strokeWidth);
                addBracketArm(root, "CH_V", [0, -chLen], [0, chLen], color, opts.strokeWidth);
            } else if (opts.crosshairStyle === "Plus") {
                var gap = size * 0.2;
                addBracketArm(root, "CH_HL", [-chLen, 0], [-gap, 0], color, opts.strokeWidth);
                addBracketArm(root, "CH_HR", [gap, 0], [chLen, 0], color, opts.strokeWidth);
                addBracketArm(root, "CH_VT", [0, -chLen], [0, -gap], color, opts.strokeWidth);
                addBracketArm(root, "CH_VB", [0, gap], [0, chLen], color, opts.strokeWidth);
            } else if (opts.crosshairStyle === "Circle+Cross") {
                addBracketArm(root, "CH_H", [-chLen, 0], [chLen, 0], color, opts.strokeWidth);
                addBracketArm(root, "CH_V", [0, -chLen], [0, chLen], color, opts.strokeWidth);
                var circGrp = root.addProperty("ADBE Vector Group");
                circGrp.name = "CH_Circle";
                var ci = circGrp.property("ADBE Vectors Group");
                ci.addProperty("ADBE Vector Shape - Ellipse");
                var cs = ci.addProperty("ADBE Vector Graphic - Stroke");
                try { cs.property("ADBE Vector Stroke Color").setValue(color); } catch(e){}
                try { cs.property("ADBE Vector Stroke Width").setValue(opts.strokeWidth); } catch(e){}
                for (var ci2 = 1; ci2 <= ci.numProperties; ci2++) {
                    var pp2 = ci.property(ci2);
                    if (pp2 && pp2.matchName === "ADBE Vector Shape - Ellipse") {
                        pp2.property("ADBE Vector Ellipse Size").setValue([size*1.2, size*1.2]);
                        break;
                    }
                }
            }
        }

        subStep = "centerDot";
        var dotGrp = root.addProperty("ADBE Vector Group");
        dotGrp.name = "Center";
        var dotInner = dotGrp.property("ADBE Vectors Group");
        dotInner.addProperty("ADBE Vector Shape - Ellipse");
        var dotFill = dotInner.addProperty("ADBE Vector Graphic - Fill");
        try { dotFill.property("ADBE Vector Fill Color").setValue(color); } catch(e){}
        for (var dd = 1; dd <= dotInner.numProperties; dd++) {
            var pd = dotInner.property(dd);
            if (pd && pd.matchName === "ADBE Vector Shape - Ellipse") {
                pd.property("ADBE Vector Ellipse Size").setValue([size*0.3, size*0.3]);
                break;
            }
        }

        subStep = "scanRings";
        for (var sr = 0; sr < 2; sr++) {
            var ringGrp = root.addProperty("ADBE Vector Group");
            ringGrp.name = "ScanRing_" + (sr+1);
            var ringInner = ringGrp.property("ADBE Vectors Group");
            ringInner.addProperty("ADBE Vector Shape - Ellipse");
            var ringStroke = ringInner.addProperty("ADBE Vector Graphic - Stroke");
            try { ringStroke.property("ADBE Vector Stroke Color").setValue(color); } catch(e){}
            try { ringStroke.property("ADBE Vector Stroke Width").setValue(opts.strokeWidth); } catch(e){}
            var ringEllRef = null;
            for (var rr = 1; rr <= ringInner.numProperties; rr++) {
                var xp2 = ringInner.property(rr);
                if (xp2 && xp2.matchName === "ADBE Vector Shape - Ellipse") { ringEllRef = xp2; break; }
            }
            var sProp = ringEllRef.property("ADBE Vector Ellipse Size");
            var ringStart = t0 + sr * (opts.scanDuration/2);
            var ringEnd = ringStart + opts.scanDuration;
            sProp.setValueAtTime(ringStart, [0,0]);
            sProp.setValueAtTime(ringEnd, [size*3, size*3]);
            setEaseOut(sProp);
            var ringTr = ringGrp.property("ADBE Vector Transform Group");
            var opP = ringTr.property("ADBE Vector Group Opacity");
            opP.setValueAtTime(ringStart, 80);
            opP.setValueAtTime(ringEnd, 0);
            opP.setValueAtTime(scanEnd, 0);
        }

        subStep = "cornerScale";
// corners are static — no scale animation (would affect whole layer)


        subStep = "layerOpacity";
        var opProp = L.property("Transform").property("Opacity");
        opProp.setValueAtTime(t0, 0);
        opProp.setValueAtTime(t0 + 0.2, 100);
        opProp.setValueAtTime(lockEnd, 100);
        if (!opts.loop) opProp.setValueAtTime(lockEnd + 0.5, 0);
        setEaseOut(opProp);

        subStep = "text";
        if (opts.showText) {
            var offX = size * 2.5;
            var offY = -size * 2.0;
            addBracketArm(root, "TextLine1", [0,0], [offX*0.5, offY*0.5], color, opts.strokeWidth);
            addBracketArm(root, "TextLine2", [offX*0.5, offY*0.5], [offX, offY*0.5], color, opts.strokeWidth);

            subStep = "text_layer";
            var statusText = comp.layers.addText("SCANNING...");
            statusText.name = LAYER_PREFIX + "Status_" + (idx+1);

            subStep = "text_doc";
            var stDoc = statusText.property("Source Text").value;
            stDoc.fontSize = opts.fontSize;
            stDoc.fillColor = color;
            setMonoFont(stDoc);
            stDoc.justification = ParagraphJustification.LEFT_JUSTIFY;
            statusText.property("Source Text").setValue(stDoc);

            subStep = "text_position";
            statusText.property("Transform").property("Position").setValue([pos[0] + offX + 5, pos[1] + offY*0.5 - opts.fontSize*0.3]);
            if (opts.parentToSource && srcLayer) statusText.parent = srcLayer;

            subStep = "text_keys";
var coordStr = opts.customCoords && opts.customCoords.length > 0 ? opts.customCoords : randomCoords();
var srcTextProp = statusText.property("Source Text");

if (opts.loop) {
    // manual cyclic expression (Source Text doesn't support loopOut)
    var cycleLen = (lockEnd + 2.0) - t0;
    var safeCoord = coordStr.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/°/g, "\\u00B0");
    srcTextProp.expression = ""
        + "var s = " + t0.toFixed(4) + ";\n"
        + "var scanEnd = " + scanEnd.toFixed(4) + ";\n"
        + "var cycle = " + cycleLen.toFixed(4) + ";\n"
        + "var localT = ((time - s) % cycle + cycle) % cycle;\n"
        + "var out;\n"
        + "if (localT < (scanEnd - s)) { out = 'SCANNING...'; }\n"
        + "else { out = 'LOCKED\\n" + safeCoord + "'; }\n"
        + "out;";
}
 else {
    srcTextProp.setValueAtTime(t0, "SCANNING...");
    srcTextProp.setValueAtTime(scanEnd, "LOCKED\n" + coordStr);
    setHold(srcTextProp);
}

var stOp = statusText.property("Transform").property("Opacity");
stOp.setValueAtTime(t0, 0);
stOp.setValueAtTime(t0 + 0.2, 100);
stOp.setValueAtTime(lockEnd, 100);
if (!opts.loop) stOp.setValueAtTime(lockEnd + 0.5, 0);
setEaseOut(stOp);

if (opts.loop) {
    try { stOp.expression = "loopOut('cycle');"; } catch(e){}
}



            statusText.moveBefore(L);
        }

        subStep = "loop";
        if (opts.loop) {
            try { opProp.expression = "loopOut('cycle');"; } catch(e){}
        }

        subStep = "moveBefore";
        if (srcLayer) {
            try { L.moveBefore(srcLayer); } catch(e){}
        }

        return L;
    } catch(err) {
        throw new Error("subStep=" + subStep + " | " + err.toString());
    }
}


    // helper: add a straight line as a bracket arm
    function addBracketArm(root, name, p1, p2, color, strokeWidth) {
    // Create group
    var g = root.addProperty("ADBE Vector Group");
    g.name = name;
    var inner = g.property("ADBE Vectors Group");

    // Add path FIRST
    var sh = inner.addProperty("ADBE Vector Shape - Group");

    // Access path property — "Path" is the localized name, "ADBE Vector Shape" is matchName
    var pathProp = sh.property("ADBE Vector Shape");
    if (!pathProp) {
        try { pathProp = sh.property("ADBE Vector Shape"); } catch(e){}
    }
    if (!pathProp) {
        // last resort: iterate
        for (var i = 1; i <= sh.numProperties; i++) {
            var p = sh.property(i);
            if (p && p.propertyValueType === PropertyValueType.SHAPE) { pathProp = p; break; }
        }
    }
    if (!pathProp) throw new Error("addBracketArm: path property not found");

    var path = new Shape();
    path.vertices = [[p1[0], p1[1]], [p2[0], p2[1]]];
    path.inTangents = [[0,0],[0,0]];
    path.outTangents = [[0,0],[0,0]];
    path.closed = false;
    pathProp.setValue(path);

    // Add stroke AFTER path so it renders on top
    var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
try { stroke.property("ADBE Vector Stroke Color").setValue(color); } catch(e){}
try { stroke.property("ADBE Vector Stroke Width").setValue(strokeWidth); } catch(e){}
// Line cap = round (nicer for HUD)
try { stroke.property("ADBE Vector Stroke Line Cap").setValue(2); } catch(e){}

}



    // ---------- generator ----------
    function generate(opts) {
        var comp = getComp(); if (!comp) return;
        app.beginUndoGroup(SCRIPT_NAME + " Создать");
        var step = "start";
        try {
            var targets = [];
            if (opts.attach === "selection") {
                var sel = comp.selectedLayers;
                if (!sel || sel.length === 0) {
                    alert("Выделите слои или переключитесь на 'Центр композиции'.");
                    app.endUndoGroup();
                    return;
                }
                for (var i = 0; i < sel.length; i++) targets.push(sel[i]);
            } else {
                targets.push(null);
            }
            for (var t = 0; t < targets.length; t++) {
                step = "build_" + t;
                if (opts.style === "ambient") buildAmbient(comp, targets[t], opts, t);
                else buildTargetLock(comp, targets[t], opts, t);
            }
            app.endUndoGroup();
        } catch(err) {
            app.endUndoGroup();
            alert("GPSLock failed at step=" + step + "\n" + err.toString());
        }
    }

    // ---------- UI ----------
    function buildUI(thisObj) {
    var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, {resizeable:true});
    win.orientation = "column";
    win.alignChildren = ["fill","top"];
    win.spacing = 3;
    win.margins = 6;
    win.preferredSize.width = 240;
    win.minimumSize.width = 220;

    var state = {
        style: "target", attach: "selection", parentToSource: true,
        color: hexToRGB("#4A90E2"),
        size: 20, strokeWidth: 1.5,
        ringCount: 2, maxRadius: 40, pingDuration: 1.5, pingOpacity: 40,
        pingInterval: 2.0, pingStrokeWidth: 1, randStartDelay: 2.0, jitter: 0.5,
        loop: true,
        showCorners: true, showCrosshair: true, crosshairStyle: "Cross",
        showText: true, customCoords: "",
        fontSize: 14, scanDuration: 1.0, lockDuration: 2.0
    };

    // Style + Attach in one compact row
    var topGrp = win.add("group"); topGrp.orientation = "column"; topGrp.alignChildren = ["fill","top"]; topGrp.spacing = 3;
    var r1 = topGrp.add("group"); r1.orientation = "row"; r1.alignChildren = ["fill","center"];
    r1.add("statictext", undefined, "Стиль:").preferredSize.width = 45;
    var styleDD = r1.add("dropdownlist", undefined, ["Target Lock","Ambient Ping"]);
    styleDD.selection = 0; styleDD.alignment = ["fill","center"];

    var r2 = topGrp.add("group"); r2.orientation = "row"; r2.alignChildren = ["fill","center"];
    r2.add("statictext", undefined, "Привязка:").preferredSize.width = 45;
    var attachDD = r2.add("dropdownlist", undefined, ["Выделение","Центр композиции"]);
    attachDD.selection = 0; attachDD.alignment = ["fill","center"];
    attachDD.onChange = function(){ state.attach = (attachDD.selection.index===0)?"selection":"center"; };

    var parentCB = topGrp.add("checkbox", undefined, "Parent к источнику");
    parentCB.value = state.parentToSource;
    parentCB.onClick = function(){ state.parentToSource = parentCB.value; };

    // Color presets — small buttons in one row
    var presetRow = win.add("group"); presetRow.orientation = "row"; presetRow.alignChildren = ["fill","center"]; presetRow.spacing = 2;
    var presets = [
        { name:"Police", hex:"#4A90E2" },
        { name:"Alert",  hex:"#E24A4A" },
        { name:"Info",   hex:"#7A8090" },
        { name:"Sci-Fi", hex:"#4AE290" }
    ];
    var swatch;
    for (var pi=0; pi<presets.length; pi++) (function(pp){
        var b = presetRow.add("button", undefined, pp.name);
        b.preferredSize.height = 20;
        b.onClick = function(){
            state.color = hexToRGB(pp.hex);
            if (swatch) swatch.notify("onDraw");
        };
    })(presets[pi]);

    var swRow = win.add("group"); swRow.orientation = "row"; swRow.alignChildren = ["fill","center"];
    swRow.add("statictext", undefined, "Цвет:").preferredSize.width = 45;
    swatch = swRow.add("panel"); swatch.preferredSize = [30, 18];
    swatch.onDraw = function(){
        var g = swatch.graphics;
        g.newPath(); g.rectPath(0, 0, swatch.size.width, swatch.size.height);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, state.color.concat([1])));
    };
    var pickBtn = swRow.add("button", undefined, "Выбрать");
    pickBtn.preferredSize.width = 40; pickBtn.preferredSize.height = 20;
    pickBtn.onClick = function(){ state.color = pickColor(state.color); swatch.notify("onDraw"); };

    // Common sliders (compact)
    addSlider(win, "Размер", 5, 100, state.size, 1, function(v){state.size=v;});
    addSlider(win, "Толщина", 0.5, 5, state.strokeWidth, 0.5, function(v){state.strokeWidth=v;});

    // Ambient section (visible only in ambient mode)
    var ambGrp = win.add("panel", undefined, "Ambient");
    ambGrp.orientation = "column"; ambGrp.alignChildren = ["fill","top"]; ambGrp.margins = 5; ambGrp.spacing = 2;
   addSlider(ambGrp, "Кольца", 1, 4, state.ringCount, 1, function(v){state.ringCount=Math.round(v);});
    addSlider(ambGrp, "Макс R", 10, 200, state.maxRadius, 5, function(v){state.maxRadius=v;});
    addSlider(ambGrp, "Длит. ping", 0.3, 5, state.pingDuration, 0.1, function(v){state.pingDuration=v;});
    addSlider(ambGrp, "Прозр.", 5, 100, state.pingOpacity, 5, function(v){state.pingOpacity=v;});
    addSlider(ambGrp, "Интервал", 0.5, 5, state.pingInterval, 0.1, function(v){state.pingInterval=v;});
    addSlider(ambGrp, "Случ. старт", 0, 3, state.randStartDelay, 0.1, function(v){state.randStartDelay=v;});
    addSlider(ambGrp, "Jitter", 0, 1, state.jitter, 0.1, function(v){state.jitter=v;});

    // Target Lock section
    var tGrp = win.add("panel", undefined, "Target Lock");
    tGrp.orientation = "column"; tGrp.alignChildren = ["fill","top"]; tGrp.margins = 5; tGrp.spacing = 2;
    var cbRow = tGrp.add("group"); cbRow.orientation = "row"; cbRow.alignChildren = ["left","center"]; cbRow.spacing = 4;
    var cornerCB = cbRow.add("checkbox", undefined, "Скобки"); cornerCB.value = state.showCorners;
    cornerCB.onClick = function(){ state.showCorners = cornerCB.value; };
    var chCB = cbRow.add("checkbox", undefined, "Прицел"); chCB.value = state.showCrosshair;
    chCB.onClick = function(){ state.showCrosshair = chCB.value; };

    var chRow = tGrp.add("group"); chRow.orientation = "row"; chRow.alignChildren = ["fill","center"];
    chRow.add("statictext", undefined, "Тип:").preferredSize.width = 45;
    var chDD = chRow.add("dropdownlist", undefined, ["Cross","Plus","Circle+Cross"]); chDD.selection = 0;
    chDD.alignment = ["fill","center"];
    chDD.onChange = function(){ state.crosshairStyle = chDD.selection.text; };

    var textCB = tGrp.add("checkbox", undefined, "Статус + координаты"); textCB.value = state.showText;
    textCB.onClick = function(){ state.showText = textCB.value; };
    var coordRow = tGrp.add("group"); coordRow.orientation = "row"; coordRow.alignChildren = ["fill","center"];
    coordRow.add("statictext", undefined, "Координаты:").preferredSize.width = 45;
    var coordET = coordRow.add("edittext", undefined, "");
    coordET.helpTip = "Пусто = автогенерация";
    coordET.alignment = ["fill","center"];
    coordET.onChange = function(){ state.customCoords = coordET.text; };
    addSlider(tGrp, "Шрифт", 8, 32, state.fontSize, 1, function(v){state.fontSize=Math.round(v);});
    addSlider(tGrp, "Скан", 0.3, 5, state.scanDuration, 0.1, function(v){state.scanDuration=v;});
    addSlider(tGrp, "Lock", 0.5, 10, state.lockDuration, 0.1, function(v){state.lockDuration=v;});

    var loopRow = win.add("group"); loopRow.orientation = "row";
    var loopCB = loopRow.add("checkbox", undefined, "Loop"); loopCB.value = state.loop;
    loopCB.onClick = function(){ state.loop = loopCB.value; };

    // switch panels
    function refreshVisibility() {
        var isAmb = (state.style === "ambient");
        ambGrp.visible = isAmb;
        tGrp.visible = !isAmb;
        win.layout.layout(true);
    }
    styleDD.onChange = function(){
        state.style = (styleDD.selection.index === 0) ? "target" : "ambient";
        refreshVisibility();
    };

    // Actions
    var actRow = win.add("group"); actRow.orientation = "row"; actRow.alignChildren = ["fill","center"];
    var createBtn = actRow.add("button", undefined, "Создать");
    createBtn.alignment = ["fill","center"]; createBtn.preferredSize.height = 26;
    var helpBtn = actRow.add("button", undefined, "?"); helpBtn.preferredSize.width = 22;
    createBtn.onClick = function(){ generate(state); };
    helpBtn.onClick = function(){ alert(getHelpText()); };

    refreshVisibility();
    if (win instanceof Window) { win.center(); win.show(); }
    else { win.layout.layout(true); win.layout.resize(); }
    return win;
}


    function addSlider(parent, label, minV, maxV, defV, stepV, onChange) {
    var g = parent.add("group");
    g.orientation = "row"; g.alignChildren = ["fill","center"];
    g.alignment = ["fill","top"]; g.spacing = 3;
    var lbl = g.add("statictext", undefined, label);
    lbl.preferredSize.width = 65;
    var sl = g.add("slider", undefined, defV, minV, maxV);
    sl.alignment = ["fill","center"]; sl.minimumSize.width = 50;
    var ed = g.add("edittext", undefined, String(defV));
    ed.preferredSize.width = 40;
    sl.onChanging = function(){
        var v = Math.round(sl.value/stepV)*stepV;
        ed.text = String(v); onChange(v);
    };
    ed.onChange = function(){
        var v = parseFloat(ed.text); if (isNaN(v)) return;
        v = clamp(v, minV, maxV); sl.value = v; ed.text = String(v); onChange(v);
    };
}


    function getHelpText() {
    return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n\n"
        + "GPS-сканер с двумя стилями наложения:\n"
        + "• Target Lock — яркий «захват цели» со сканирующими кольцами, скобками, прицелом и координатами.\n"
        + "• Ambient Ping — тихие фоновые маркеры с пульсирующими кольцами для отметки событий на карте.\n\n"
        + "БЫСТРЫЙ СТАРТ:\n"
        + "1. Поставь Null или Shape в нужной точке карты (или выдели несколько для batch).\n"
        + "2. Установи CTI на момент появления сканера.\n"
        + "3. Выбери стиль (Target Lock / Ambient Ping).\n"
        + "4. Выбери цветовой пресет или свой цвет.\n"
        + "5. Настрой параметры и нажми Create GPS Lock.\n\n"
        + "ЦВЕТОВЫЕ ПРЕСЕТЫ:\n"
        + "• Police — синий (#4A90E2), для полицейских/служебных отметок.\n"
        + "• Alert — красный (#E24A4A), тревога/происшествие.\n"
        + "• Info — серый (#7A8090), нейтральные события.\n"
        + "• Sci-Fi — зелёный (#4AE290), футуристичный HUD.\n"
        + "• Custom — свой цвет через палитру.\n\n"
        + "ОБЩИЕ ПАРАМЕТРЫ:\n"
        + "• Attach — куда крепить: Selected layer (по выделенным) / Comp center (центр композиции).\n"
        + "• Parent to source — привязать элементы к исходному слою (двигаются вместе с ним).\n"
        + "• Size (px) — базовый размер сканера/маркера.\n"
        + "• Stroke width — толщина линий.\n"
        + "• Loop — зациклить анимацию.\n\n"
        + "TARGET LOCK — параметры:\n"
        + "• Скан — длительность фазы сканирования (кольца + текст SCANNING…).\n"
        + "• Lock — сколько держится состояние LOCKED с координатами.\n"
        + "• Show corners — угловые скобки, «схватывающие» цель.\n"
        + "• Show crosshair — центральный прицел (Cross / Plus / Circle+Cross).\n"
        + "• Показать текст — надпись SCANNING… → LOCKED + координаты.\n"
        + "• Шрифт — размер шрифта статуса и координат.\n"
        + "• Свои координаты — свои координаты (напр. 55.7558° N, 37.6173° E). Пусто = автогенерация.\n"
        + "• Random start delay (s) — случайная задержка старта (для batch — рассинхронизация).\n"
        + "• Loop ON — после LOCKED пауза 2 сек, затем цикл повторяется (SCANNING → LOCKED → …).\n\n"
        + "AMBIENT PING — параметры:\n"
        + "• Ring count — количество пульсирующих колец (1–3).\n"
        + "• Max radius (px) — до какого радиуса расходится волна.\n"
        + "• Ping duration (s) — длительность одного цикла кольца.\n"
        + "• Ping opacity (%) — стартовая прозрачность кольца (30–50 для фонового вида).\n"
        + "• Interval (s) — пауза между импульсами.\n"
        + "• Random start delay — случайный сдвиг старта у каждой точки.\n"
        + "• Jitter — случайное отклонение интервала между пингами.\n"
        + "• Loop ON — постоянная пульсация (рекомендуется).\n\n"
        + "BATCH-РЕЖИМ:\n"
        + "Выдели несколько слоёв → скрипт создаст отдельный сканер/пинг на каждой точке со случайным сдвигом фазы, чтобы они не мигали синхронно.\n\n"
        + "СОЗДАВАЕМЫЕ СЛОИ:\n"
        + "• GPS_<имя источника>_Lock_N — основной shape со сканером/пингом.\n"
        + "• GPS_Status_N — текстовый слой (только Target Lock).\n\n"
        + "СОВЕТЫ:\n"
        + "• На тёмной карте лучше видно яркие пресеты (Sci-Fi, Police).\n"
        + "• Для сцены с машиной по маршруту (PathRider) используй Ambient Ping на 5–8 точках с пресетом Info + один Target Lock (Alert) на ключевой точке.\n"
        + "• Random start delay 2–3 сек в batch — обязательно, иначе все точки пульсируют одновременно и это выглядит неестественно.\n"
        + "• Для отключения дёрганья при движении камеры включай Parent to source.\n"
        + "• Если координаты в Target Lock не нужны — сними галочку Show text, останутся только скобки и прицел.\n"
        + "• Комбинируй с ptp_OpacityWave для более крупных волн-событий и ptp_Connector для соединения точек линиями.\n";
}


    buildUI(thisObj);
})(this);
