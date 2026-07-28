// ptp_HUDPanel.jsx v1.0
// Generates a full holographic HUD panel with animated components.

(function ptp_HUDPanel(thisObj) {
    var SCRIPT_NAME = "ptp_HUDPanel";
    var SCRIPT_VERSION = "v1.0";
    var LAYER_PREFIX  = "HUD_";
    var ACCENT_COLOR  = [1.0, 0.65, 0.0]; // orange for UI section labels

    // ---------- Helpers ----------
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Open a composition first."); return null; }
        return c;
    }
    function esc(s){ return String(s).replace(/\\/g,"\\\\").replace(/"/g,'\\"'); }
    function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
    function hexToRGB(hex){
        hex = String(hex).replace("#","");
        if (hex.length===3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        var n = parseInt(hex,16);
        return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255, 1];
    }
    function randInt(a,b){ return Math.floor(a + Math.random()*(b-a+1)); }
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

    // ---------- Presets ----------
    var PRESETS = {
        "Ice Blue":        { bg:"#87CEEB", main:"#FFFFFF", accent:"#2A4A6A", panel:"#1A3050" },
        "Battleship":      { bg:"#4A5560", main:"#E0E0E0", accent:"#D67A3A", panel:"#2A3540" },
        "Industrial Yellow":{ bg:"#3A3A3A", main:"#F5F5F5", accent:"#FFD700", panel:"#1A1A1A" },
        "Dark Chrome":     { bg:"#2A2E38", main:"#FFFFFF", accent:"#7A8090", panel:"#15181F" }
    };

    var SIZES = { "Small":{w:320,h:360}, "Medium":{w:400,h:450}, "Large":{w:520,h:580} };


    // ---------- Control layer (HUD_Colors) ----------
    function buildControlLayer(comp, preset){
        var ctrl = comp.layers.addNull();
        ctrl.name = LAYER_PREFIX + "Colors";
        ctrl.enabled = false; // hidden
        ctrl.guideLayer = true;
        var fx = ctrl.property("ADBE Effect Parade");

        function addColorCtl(name, color){
            var c = fx.addProperty("ADBE Color Control");
            c.name = name;
            try { c.property(1).setValue(color); } catch(e){}
            return c;
        }
        function addSliderCtl(name, val, min, max){
            var s = fx.addProperty("ADBE Slider Control");
            s.name = name;
            try { s.property(1).setValue(val); } catch(e){}
            return s;
        }
        addColorCtl("Main",   hexToRGB(preset.main));
        addColorCtl("Accent", hexToRGB(preset.accent));
        addColorCtl("Panel",  hexToRGB(preset.panel));
        addColorCtl("BG",     hexToRGB(preset.bg));
        addSliderCtl("Panel Opacity", 85);
        addSliderCtl("Idle Intensity", 50);
        return ctrl;
    }

    // Expression that reads color from control layer
    function colorExpr(ctrlName, slot){
        return 'comp("HUD_Panel_precomp").layer("' + LAYER_PREFIX + 'Colors").effect("' + slot + '")("Color")';
    }
    // Simpler: inside precomp, ctrl layer is a sibling
    function colorExprLocal(slot){
        return 'thisComp.layer("' + LAYER_PREFIX + 'Colors").effect("' + slot + '")("Color")';
    }
    function sliderExprLocal(slot){
        return 'thisComp.layer("' + LAYER_PREFIX + 'Colors").effect("' + slot + '")("Slider")';
    }

    // ---------- Shape helpers ----------
        function setGroupPosition(g, pos){
        var tr = null;
        try { tr = g.property("ADBE Vector Transform Group"); } catch(e){}
        if (!tr) { try { tr = g.property("ADBE Vector Group Transform"); } catch(e){} }
        if (!tr) return false;
        try { var p1 = tr.property("ADBE Vector Position"); if (p1){ p1.setValue(pos); return true; } } catch(e){}
        try { var p2 = tr.property("Position"); if (p2){ p2.setValue(pos); return true; } } catch(e){}
        for (var i = 1; i <= tr.numProperties; i++){
            var p = tr.property(i);
            if (!p) continue;
            var nm = (p.name || "").toLowerCase();
            if (nm.indexOf("position") >= 0){ p.setValue(pos); return true; }
        }
        return false;
    }


function addRect(root, name, size, pos, fillColor, strokeColor, strokeW, roundness){
    var g = root.addProperty("ADBE Vector Group");
    g.name = name;
    var inner = g.property("ADBE Vectors Group");
    var rc = inner.addProperty("ADBE Vector Shape - Rect");
    rc.property("ADBE Vector Rect Size").setValue(size);
    rc.property("ADBE Vector Rect Position").setValue([0,0]);
    if (roundness) rc.property("ADBE Vector Rect Roundness").setValue(roundness);
    if (fillColor){
        var f = inner.addProperty("ADBE Vector Graphic - Fill");
        f.property("Color").setValue(fillColor);
    }
    if (strokeColor && strokeW > 0){
        var st = inner.addProperty("ADBE Vector Graphic - Stroke");
        st.property("Color").setValue(strokeColor);
        st.property("Stroke Width").setValue(strokeW);
    }
    setGroupPosition(g, pos);
    return g;
}

function addEllipse(root, name, size, pos, fillColor, strokeColor, strokeW){
    var g = root.addProperty("ADBE Vector Group");
    g.name = name;
    var inner = g.property("ADBE Vectors Group");
    var el = inner.addProperty("ADBE Vector Shape - Ellipse");
    el.property("ADBE Vector Ellipse Size").setValue(size);
    el.property("ADBE Vector Ellipse Position").setValue([0,0]);
    if (fillColor){
        var f = inner.addProperty("ADBE Vector Graphic - Fill");
        f.property("Color").setValue(fillColor);
    }
    if (strokeColor && strokeW > 0){
        var st = inner.addProperty("ADBE Vector Graphic - Stroke");
        st.property("Color").setValue(strokeColor);
        st.property("Stroke Width").setValue(strokeW);
    }
    setGroupPosition(g, pos);
    return g;
}

function addEllipse(root, name, size, pos, fillColor, strokeColor, strokeW){
    var g = root.addProperty("ADBE Vector Group");
    g.name = name;
    var inner = g.property("ADBE Vectors Group");
    var el = inner.addProperty("ADBE Vector Shape - Ellipse");
    el.property("ADBE Vector Ellipse Size").setValue(size);
    el.property("ADBE Vector Ellipse Position").setValue([0,0]);
    if (fillColor){
        var f = inner.addProperty("ADBE Vector Graphic - Fill");
        f.property("Color").setValue(fillColor);
    }
    if (strokeColor && strokeW > 0){
        var st = inner.addProperty("ADBE Vector Graphic - Stroke");
        st.property("Color").setValue(strokeColor);
        st.property("Stroke Width").setValue(strokeW);
    }
    setGroupPosition(g, pos);
    return g;
}

function addLine(root, name, p1, p2, color, strokeW){
    var g = root.addProperty("ADBE Vector Group");
    g.name = name;
    var inner = g.property("ADBE Vectors Group");
    var sh = inner.addProperty("ADBE Vector Shape - Group");
    var pathProp = null;
    try { pathProp = sh.property("Path"); } catch(e){}
    if (!pathProp) { try { pathProp = sh.property("ADBE Vector Shape"); } catch(e){} }
    if (!pathProp) for (var i=1;i<=sh.numProperties;i++){
        var p = sh.property(i);
        if (p && p.propertyValueType === PropertyValueType.SHAPE){ pathProp = p; break; }
    }
    // draw locally around [0,0], center between p1 and p2
    var cx = (p1[0]+p2[0])/2, cy = (p1[1]+p2[1])/2;
    var v1 = [p1[0]-cx, p1[1]-cy];
    var v2 = [p2[0]-cx, p2[1]-cy];
    var s = new Shape();
    s.vertices = [v1, v2];
    s.inTangents = [[0,0],[0,0]];
    s.outTangents = [[0,0],[0,0]];
    s.closed = false;
    pathProp.setValue(s);
    var st = inner.addProperty("ADBE Vector Graphic - Stroke");
    try { st.property("Color").setValue(color); } catch(e){}
    try { st.property("Stroke Width").setValue(strokeW); } catch(e){}
    try { st.property("Line Cap").setValue(2); } catch(e){}
    setGroupPosition(g, [cx, cy]);
    return g;
}


    function addGearShape(root, name, radius, teethCount, pos, color){
    var g = root.addProperty("ADBE Vector Group");
    g.name = name;
    var inner = g.property("ADBE Vectors Group");

    // outer ring (stroke only)
    var ell = inner.addProperty("ADBE Vector Shape - Ellipse");
    ell.property("ADBE Vector Ellipse Size").setValue([radius*2, radius*2]);
    ell.property("ADBE Vector Ellipse Position").setValue([0,0]);

    // teeth as small rectangles arranged around the circle
    var toothW = Math.max(2, radius*0.18);
    var toothH = Math.max(3, radius*0.28);
    for (var t=0; t<teethCount; t++){
        var ang = (t/teethCount) * Math.PI*2;
        var tx = Math.cos(ang) * (radius + toothH*0.4);
        var ty = Math.sin(ang) * (radius + toothH*0.4);
        var tg = inner.addProperty("ADBE Vector Group");
        tg.name = "Tooth_" + (t+1);
        var tgInner = tg.property("ADBE Vectors Group");
        var rc = tgInner.addProperty("ADBE Vector Shape - Rect");
        rc.property("ADBE Vector Rect Size").setValue([toothW, toothH]);
        rc.property("ADBE Vector Rect Position").setValue([0,0]);
        var tf = tgInner.addProperty("ADBE Vector Graphic - Fill");
        tf.property("Color").setValue(color);
        try {
            var ttr = tg.property("ADBE Vector Transform Group");
            try { ttr.property("ADBE Vector Position").setValue([tx, ty]); } catch(e){}
            try { ttr.property("ADBE Vector Rotation").setValue(ang * 180/Math.PI + 90); } catch(e){}
        } catch(e){}
    }

    // stroke for outer ring — put AFTER teeth so it's on top
    var st = inner.addProperty("ADBE Vector Graphic - Stroke");
    try { st.property("Color").setValue(color); } catch(e){}
    try { st.property("Stroke Width").setValue(2); } catch(e){}

    setGroupPosition(g, pos);
    return g;
}


    // ---------- Position layout ----------
    function getComponentPositions(shape, w, h){
    var pos = {};
    if (shape === "Rectangular" || shape === "Rounded"){
        var cx = w/2, cy = h/2;
        // Pillar inner area
        var pW = w*0.85, pH = h*0.82;
        var pLeft = cx - pW/2, pRight = cx + pW/2;
        var pTop = cy - pH/2, pBot = cy + pH/2;

        pos.pillar         = [cx, cy];
        pos.header         = [cx, pTop + 12];
        // Left column
        pos.gear           = [pLeft + 30, pTop + 50];
        pos.pips           = [pLeft + 20, cy - 20];
        pos.radar          = [pLeft + 30, pBot - 45];
        // Right column
        pos.progressBars   = [pRight - 60, pTop + 50];
        pos.dataBars       = [pRight - 75, cy - 40];   // было cy - 25 или cy - 15
pos.selection      = [pRight - 75, cy + 10];   // соответственно
        pos.textLabels     = [pRight - 100, pBot - 40];
        pos.corners        = [cx, cy];
pos.waveform   = [cx, pTop + 35];         // под Header, по центру
        pos.dataGrid = [cx - 55, cy + 50];   // левее (на 55 px) и ниже (на 50 px)
        pos.histogram  = [pRight - 30, pBot - 55]; // низ-правый угол
        } else if (shape === "Circular"){
        var cx2 = w/2, cy2 = h/2;
        var R  = Math.min(w,h)*0.38;
        pos.pillar         = [cx2, cy2];
        pos.header         = [cx2, cy2 - R*0.92];
        pos.gear           = [cx2, cy2];
        pos.progressBars   = [cx2 - R*0.35, cy2 + R*0.55];
        pos.pips           = [cx2 - R*0.7, cy2];
        pos.dataBars       = [cx2 + R*0.4, cy2 - R*0.15];
        pos.selection      = [cx2, cy2 + R*0.35];
        pos.radar          = [cx2 + R*0.55, cy2 - R*0.5];
        pos.corners        = [cx2, cy2];
        pos.waveform       = [cx2, cy2 - R*0.7];
        pos.dataGrid       = [cx2, cy2 + R*0.1];
        pos.histogram      = [cx2 + R*0.55, cy2 + R*0.4];
        pos.textLabels     = [cx2 + R*0.2, cy2 + R*0.75];
    }

    return pos;
}

    // ---------- Random text generator ----------
    function randomLabelText(kind){
        if (kind === "channel") {
            return "CH-" + (randInt(1,99) < 10 ? "0" : "") + randInt(1,99);
        }
        if (kind === "loading") {
            return "LOADING " + randInt(10, 99) + "%";
        }
        if (kind === "code") {
            var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
            var s = "";
            for (var i = 0; i < 6; i++) s += chars.charAt(randInt(0, chars.length-1));
            return s;
        }
        if (kind === "time") {
            var hh = randInt(0,23), mm = randInt(0,59), ss = randInt(0,59);
            return (hh<10?"0":"")+hh + ":" + (mm<10?"0":"")+mm + ":" + (ss<10?"0":"")+ss;
        }
        if (kind === "status") {
            var arr = ["ONLINE", "STANDBY", "ACTIVE", "LOCKED", "SCANNING", "READY", "SYNC"];
            return arr[randInt(0, arr.length-1)];
        }
        return "SYS-" + randInt(100, 999);
    }


          // ---------- Idle animations ----------



    function applyIdleWiggle(prop, freq, amp){
        try {
            var expr = "var i = thisComp.layer(\"" + LAYER_PREFIX + "Colors\").effect(\"Idle Intensity\")(\"Slider\")/100;\n"
                     + "wiggle(" + freq + ", " + amp + " * i);";
            prop.expression = expr;
        } catch(e){}
    }

    function applyLoopRotation(rotProp, degPerSec){
        if (!rotProp) return;
        try {
            rotProp.setValueAtTime(0, 0);
            rotProp.setValueAtTime(360/Math.abs(degPerSec), degPerSec>0?360:-360);
            rotProp.expression = "loopOut('cycle');";
        } catch(e){}
    }

    function applyPipBlink(opProp, seedOffset){
        if (!opProp) return;
        try {
            var expr = "var i = thisComp.layer(\"" + LAYER_PREFIX + "Colors\").effect(\"Idle Intensity\")(\"Slider\")/100;\n"
                     + "seedRandom(" + seedOffset + ", true);\n"
                     + "var base = 100;\n"
                     + "var blink = (Math.sin(time*3 + " + seedOffset + ") > 0.7) ? 40 : 100;\n"
                     + "linear(i, 0, 1, base, blink);";
            opProp.expression = expr;
        } catch(e){}
    }

    // ---------- Group Transform getters ----------
    function getGroupTransform(shapeGroup){
        if (!shapeGroup) return null;
        var tr = null;
        try { tr = shapeGroup.property("ADBE Vector Transform Group"); } catch(e){}
        if (!tr) { try { tr = shapeGroup.property("ADBE Vector Group Transform"); } catch(e){} }
        if (!tr) {
            try {
                for (var i = 1; i <= shapeGroup.numProperties; i++){
                    var p = shapeGroup.property(i);
                    if (p && p.name && p.name.toLowerCase().indexOf("transform") >= 0) { tr = p; break; }
                }
            } catch(e){}
        }
        return tr;
    }

    function getGroupRotation(shapeGroup){
    if (!shapeGroup) { alert("getGroupRotation: shapeGroup is null"); return null; }
    var tr = getGroupTransform(shapeGroup);
    if (!tr) {
        // Debug: list all children of shapeGroup
        var names = [];
        try {
            for (var i = 1; i <= shapeGroup.numProperties; i++){
                var p = shapeGroup.property(i);
                if (p) names.push(i + ": name=" + p.name + " / mn=" + p.matchName);
            }
        } catch(e){}
        alert("getGroupRotation: Transform NOT FOUND in " + shapeGroup.name + "\nChildren:\n" + names.join("\n"));
        return null;
    }
    // Debug: list all props of transform
    var tnames = [];
    try {
        for (var j = 1; j <= tr.numProperties; j++){
            var pp = tr.property(j);
            if (pp) tnames.push(j + ": name=" + pp.name + " / mn=" + pp.matchName);
        }
    } catch(e){}
    // Try to find rotation
    try { var r = tr.property("ADBE Vector Rotation"); if (r) return r; } catch(e){}
    try { var r2 = tr.property("ADBE Vector Group Rotation"); if (r2) return r2; } catch(e){}
    try { var r3 = tr.property("Rotation"); if (r3) return r3; } catch(e){}
    for (var k = 1; k <= tr.numProperties; k++){
        var pk = tr.property(k);
        if (pk && pk.name && pk.name.toLowerCase().indexOf("rotation") >= 0) return pk;
    }
    alert("getGroupRotation: rotation NOT FOUND in transform of " + shapeGroup.name + "\nTransform props:\n" + tnames.join("\n"));
    return null;
}


    function getGroupScale(shapeGroup){
        var tr = getGroupTransform(shapeGroup);
        if (!tr) return null;
        try { var s = tr.property("ADBE Vector Scale"); if (s) return s; } catch(e){}
        try { var s2 = tr.property("Scale"); if (s2) return s2; } catch(e){}
        for (var i = 1; i <= tr.numProperties; i++){
            var p = tr.property(i);
            if (p && p.name && p.name.toLowerCase().indexOf("scale") >= 0) return p;
        }
        return null;
    }

function findGroupByName(root, name){
    try {
        for (var i = 1; i <= root.numProperties; i++){
            var p = root.property(i);
            if (p && p.name === name) return p;
        }
    } catch(e){}
    return null;
}

    function getGroupOpacity(shapeGroup){
        var tr = getGroupTransform(shapeGroup);
        if (!tr) return null;
        try { var o = tr.property("ADBE Vector Group Opacity"); if (o) return o; } catch(e){}
        try { var o2 = tr.property("Opacity"); if (o2) return o2; } catch(e){}
        for (var i = 1; i <= tr.numProperties; i++){
            var p = tr.property(i);
            if (p && p.name && p.name.toLowerCase().indexOf("opacity") >= 0) return p;
        }
        return null;
    }


    // Return public API for Part 2
    var API = {
        SCRIPT_NAME: SCRIPT_NAME, SCRIPT_VERSION: SCRIPT_VERSION,
        LAYER_PREFIX: LAYER_PREFIX, ACCENT_COLOR: ACCENT_COLOR,
        PRESETS: PRESETS, SIZES: SIZES,
        getComp: getComp, esc: esc, clamp: clamp, hexToRGB: hexToRGB,
        randInt: randInt, setEaseOut: setEaseOut,
        buildControlLayer: buildControlLayer,
        colorExprLocal: colorExprLocal, sliderExprLocal: sliderExprLocal,
        addRect: addRect, addEllipse: addEllipse, addLine: addLine, addGearShape: addGearShape,
        getComponentPositions: getComponentPositions,
        randomLabelText: randomLabelText,
        applyIdleWiggle: applyIdleWiggle, applyLoopRotation: applyLoopRotation, applyPipBlink: applyPipBlink
    };
    $.global.__ptp_HUD_API = API;

    // ==================== PART 2 ====================
    // Component builders, entrance/reveal animations, UI

    // ---------- Component builders ----------
        function buildPillar(root, w, h, shape, positions){
        if (shape === "Circular"){
            var d = Math.min(w, h) * 0.9;
            addEllipse(root, "Pillar_BG", [d, d], positions.pillar,
                hexToRGB(state.preset.panel), null, 0);
            addEllipse(root, "Pillar_Border", [d, d], positions.pillar,
                null, hexToRGB(state.preset.main), 2);
            return;
        }
        var roundness = (shape === "Rounded") ? 28 : 0;
        // Main pillar body
        var pillarBG = addRect(root, "Pillar_BG", [w*0.9, h*0.85], positions.pillar,
            hexToRGB(state.preset.panel), null, 0, roundness);
        // Border stroke
        addRect(root, "Pillar_Border", [w*0.9, h*0.85], positions.pillar,
            null, hexToRGB(state.preset.main), 1.5, roundness);
        return pillarBG;
    }

    function buildHeader(root, w, h, shape, positions){
        var g = addRect(root, "Header", [w*0.75, 20], positions.header,
            hexToRGB(state.preset.accent), null, 0, 2);
        return g;
    }

    function buildGear(root, positions){
        var g = addEllipse(root, "Gear_Outer", [40,40], positions.gear,
            null, hexToRGB(state.preset.main), 2);
        var inner = addEllipse(root, "Gear_Inner", [16,16], positions.gear,
            hexToRGB(state.preset.main), null, 0);
        // Cross inside
        addLine(root, "Gear_CrossH",
            [positions.gear[0]-24, positions.gear[1]],
            [positions.gear[0]+24, positions.gear[1]],
            hexToRGB(state.preset.main), 1.5);
        addLine(root, "Gear_CrossV",
            [positions.gear[0], positions.gear[1]-24],
            [positions.gear[0], positions.gear[1]+24],
            hexToRGB(state.preset.main), 1.5);
        return g;
    }

    function buildProgressBars(root, w, h, positions, count){
    var groups = [];
    var barW = 130, barH = 9, gap = 17;
    var startY = positions.progressBars[1];
    var x = positions.progressBars[0];
    for (var i=0;i<count;i++){
        var y = startY + i*gap;
        addRect(root, "PB_Track_"+(i+1), [barW, barH], [x, y],
            null, hexToRGB(state.preset.main), 1, 1);
        var fillW = barW * (0.5 + Math.random()*0.3);
        var fillX = x - (barW - fillW)/2;
        var fillGrp = addRect(root, "PB_Fill_"+(i+1), [fillW, barH-3], [fillX, y],
            hexToRGB(state.preset.accent), null, 0, 1);
        groups.push({track:null, fill:fillGrp, baseW:fillW, maxW:barW, x:x});
    }
    return groups;
}

    function buildPips(root, positions, count){
    var pips = [];
    var gap = 18;
    var startY = positions.pips[1] - (count*gap)/2;
    for (var i=0;i<count;i++){
        var y = startY + i*gap;
        var pip = addEllipse(root, "Pip_"+(i+1), [14,14], [positions.pips[0], y],
            hexToRGB(state.preset.accent), null, 0);
        pips.push(pip);
    }
    return pips;
}



    function buildDataBars(root, w, positions){
    var bars = [];
    var barH = 5, gap = 10;
    var startY = positions.dataBars[1];
    var x = positions.dataBars[0];
    var widths = [120, 85, 105, 70];
    var maxW = 120;
    for (var i=0;i<4;i++){
        var y = startY + i*gap;
        var bw = widths[i];
        var bx = x - (maxW - bw)/2;
        var b = addRect(root, "DataBar_"+(i+1), [bw, barH], [bx, y],
            hexToRGB(state.preset.main), null, 0, 1);
        try {
            var opProp = getGroupOpacity(b);
            if (opProp) opProp.setValue(50 + Math.random()*40);
        } catch(e){}
        bars.push(b);
    }
    return bars;
}


    function buildSelection(root, w, positions){
    var g = addRect(root, "Selection", [70, 2], positions.selection,
        hexToRGB(state.preset.accent), null, 0, 1);
    return g;
}

    function buildRadar(root, positions){
        var outer = addEllipse(root, "Radar_Outer", [36,36], positions.radar,
            null, hexToRGB(state.preset.main), 1.5);
        var inner = addEllipse(root, "Radar_Inner", [18,18], positions.radar,
            null, hexToRGB(state.preset.main), 1);
        // Rotating sweep line
        var sweep = addLine(root, "Radar_Sweep",
    positions.radar,
    [positions.radar[0]+1, positions.radar[1]],
    hexToRGB(state.preset.accent), 2.5);

        return { outer:outer, inner:inner, sweep:sweep, center:positions.radar };
    }

    function buildCorners(root, w, h, positions){
        var arms = 18;
// Отодвинуть скобки внутрь для Rounded, чтобы не пересекать скругление
    var offsetFactor = 0.42; // для Rectangular
        var hw = w*0.45, hh = h*0.42;
        var cx = positions.corners[0], cy = positions.corners[1];
        var col = hexToRGB(state.preset.main);
        var corners = [
            [-hw,-hh, 1, 1], [ hw,-hh,-1, 1],
            [-hw, hh, 1,-1], [ hw, hh,-1,-1]
        ];
        for (var i=0;i<4;i++){
            var c = corners[i];
            addLine(root, "Corner_"+(i+1)+"_H",
    [cx+c[0], cy+c[1]],
    [cx+c[0]+c[2]*arms, cy+c[1]],
    col, 2.5);   // было 2
addLine(root, "Corner_"+(i+1)+"_V",
    [cx+c[0], cy+c[1]],
    [cx+c[0], cy+c[1]+c[3]*arms],
    col, 2.5);

        }
    }
    // ---------- Waveform (Variant B) ----------
    function buildWaveform(root, positions){
        var bars = [];
        var count = 20;
        var barW = 2, gap = 4;
        var totalW = count*barW + (count-1)*(gap-barW);
        var startX = positions.waveform[0] - totalW/2;
        var y = positions.waveform[1];
        for (var i=0; i<count; i++){
            var x = startX + i*gap;
            var h = 4 + Math.random()*10;   // 4-14 px
            var b = addRect(root, "WF_"+(i+1), [barW, h], [x, y],
                hexToRGB(state.preset.accent), null, 0, 1);
            bars.push(b);
        }
        return bars;
    }

    // ---------- Data Grid 4x4 (Variant D) ----------
    function buildDataGrid(root, positions){
        var cells = [];
        var cellSize = 6;
        var gap = 10;
        var cx = positions.dataGrid[0], cy = positions.dataGrid[1];
        var startX = cx - (gap*3)/2;
        var startY = cy - (gap*3)/2;
        for (var r=0; r<4; r++){
            for (var c=0; c<4; c++){
                var idx = r*4 + c;
                var x = startX + c*gap;
                var y = startY + r*gap;
                var cell = addRect(root, "Grid_"+(r+1)+"_"+(c+1),
                    [cellSize, cellSize], [x, y],
                    hexToRGB(state.preset.main), null, 0, 0);
                // Random initial opacity for variety
                try {
                    var op = getGroupOpacity(cell);
                    if (op) op.setValue(30 + Math.random()*60);
                } catch(e){}
                cells.push(cell);
            }
        }
        return cells;
    }

    // ---------- Histogram (Variant E) ----------
    function buildHistogram(root, positions){
        var bars = [];
        var count = 6;
        var barW = 5, gap = 8;
        var totalW = count*gap - (gap-barW);
        var startX = positions.histogram[0] - totalW/2;
        var baseY = positions.histogram[1];
        for (var i=0; i<count; i++){
            var x = startX + i*gap;
            var h = 8 + Math.random()*18;  // 8-26 px
            // draw bar so its bottom aligns with baseY
            var b = addRect(root, "Hist_"+(i+1), [barW, h], [x, baseY - h/2],
                hexToRGB(state.preset.accent), null, 0, 1);
            bars.push(b);
        }
        return bars;
    }

    // ---------- Circuit lines (decorative L-shapes) ----------
   function buildCircuitLines(root, w, h, positions){
    var col = hexToRGB(state.preset.accent);
    var cx = w/2, cy = h/2;
    // Работаем в координатах панели (её центр = cx,cy)
    var pLeft = cx - w*0.85/2;
    var pBot  = cy + h*0.82/2;
    var zoneX = pLeft + 25;
    var zoneY = pBot - 90;

    // L1
    addLine(root, "Circuit_L1_H", [zoneX, zoneY], [zoneX+22, zoneY], col, 1.5);
    addLine(root, "Circuit_L1_V", [zoneX+22, zoneY], [zoneX+22, zoneY+14], col, 1.5);
    // L2
    addLine(root, "Circuit_L2_H", [zoneX+50, zoneY-20], [zoneX+70, zoneY-20], col, 1.5);
    addLine(root, "Circuit_L2_V", [zoneX+70, zoneY-20], [zoneX+70, zoneY-6], col, 1.5);
    // L3
    addLine(root, "Circuit_L3_H", [zoneX+60, zoneY+30], [zoneX+40, zoneY+30], col, 1.5);
    addLine(root, "Circuit_L3_V", [zoneX+40, zoneY+30], [zoneX+40, zoneY+16], col, 1.5);
    // L4
    addLine(root, "Circuit_L4_H", [zoneX+90, zoneY+10], [zoneX+108, zoneY+10], col, 1.5);
    addLine(root, "Circuit_L4_V", [zoneX+108, zoneY+10], [zoneX+108, zoneY+25], col, 1.5);
}



    // ---------- Micro rects (decorative noise) ----------
    function buildMicroRects(root, w, h){
    var cx = w/2, cy = h/2;
    // Ограничиваем зону "шума" правым нижним квадрантом ВНУТРИ панели
    var zoneMinX = cx + 10;
    var zoneMaxX = cx + w*0.35;
    var zoneMinY = cy + 10;
    var zoneMaxY = cy + h*0.32;

    for (var i=0; i<8; i++){
        var sz = 3 + Math.random()*3;   // 3-6 px
        var x  = zoneMinX + Math.random()*(zoneMaxX - zoneMinX);
        var y  = zoneMinY + Math.random()*(zoneMaxY - zoneMinY);
        var col = (Math.random() < 0.5) ? hexToRGB(state.preset.main) : hexToRGB(state.preset.accent);
        var m = addRect(root, "Micro_"+(i+1), [sz, sz], [x, y], col, null, 0, 0);
        try {
            var op = m.property("ADBE Vector Transform Group").property("ADBE Vector Group Opacity");
            op.setValue(30 + Math.random()*50);
        } catch(e){}
    }
}


    // ---------- Text labels (as separate text layers inside precomp) ----------
    function buildTextLabels(precomp, positions, w){
        var labels = [];
        var kinds = ["status", "channel", "loading", "code", "time"];
        var startY = positions.textLabels[1];
        for (var i=0;i<3;i++){
            var kind = kinds[randInt(0, kinds.length-1)];
            var txt = precomp.layers.addText(randomLabelText(kind));
            txt.name = LAYER_PREFIX + "Label_" + (i+1);
            var doc = txt.property("Source Text").value;
            doc.fontSize = 11;
            var mc = hexToRGB(state.preset.main);
doc.fillColor = [mc[0], mc[1], mc[2]];
            try { doc.font = "ArialMT"; } catch(e){}
            doc.justification = ParagraphJustification.LEFT_JUSTIFY;
            txt.property("Source Text").setValue(doc);
            txt.property("Transform").property("Position").setValue([positions.textLabels[0]-w*0.15, startY+i*14]);
            labels.push(txt);
        }
        return labels;
    }

    // ---------- Entrance animations ----------
    function applyEntrance(shapeLayer, textLayers, entrance, precomp, w, h, positions){
        var startT = 0;
        var pos = shapeLayer.property("Transform").property("Position");
        var scl = shapeLayer.property("Transform").property("Scale");
        var opa = shapeLayer.property("Transform").property("Opacity");
        var finalPos = [0, 0];


        if (entrance === "Slide-in"){
            pos.setValueAtTime(startT, [w, 0]);
pos.setValueAtTime(startT+0.3, finalPos);

            setEaseOut(pos);
            // Micro-jitter after arrival
            try {
                pos.expression = "var t0 = 0.3;\n"
                    + "if (time < t0) value\n"
                    + "else { var i = thisComp.layer(\"" + LAYER_PREFIX + "Colors\").effect(\"Idle Intensity\")(\"Slider\")/100;\n"
                    + "value + [wiggle(2, 1*i)[0]-value[0], wiggle(2, 1*i)[1]-value[1]]; }";
            } catch(e){}
        }
        else if (entrance === "Fade-in"){
            opa.setValueAtTime(startT, 0);
            opa.setValueAtTime(startT+0.5, 100);
            setEaseOut(opa);
        }
        else if (entrance === "Assemble"){
            // Whole layer fades in, components inside will animate via nested keys (simplified: scale bounce)
            scl.setValueAtTime(startT, [80,80]);
            scl.setValueAtTime(startT+0.6, [105,105]);
            scl.setValueAtTime(startT+0.8, [100,100]);
            setEaseOut(scl);
            opa.setValueAtTime(startT, 0);
            opa.setValueAtTime(startT+0.4, 100);
            setEaseOut(opa);
        }
        else if (entrance === "Scatter-collect"){
            scl.setValueAtTime(startT, [140,140]);
            scl.setValueAtTime(startT+0.8, [100,100]);
            setEaseOut(scl);
            opa.setValueAtTime(startT, 0);
            opa.setValueAtTime(startT+0.3, 100);
            setEaseOut(opa);
        }

        // Text labels — cascade fade
        for (var i=0;i<textLayers.length;i++){
            var t = textLayers[i];
            var top = t.property("Transform").property("Opacity");
            top.setValueAtTime(startT + 0.3 + i*0.08, 0);
            top.setValueAtTime(startT + 0.5 + i*0.08, 100);
            setEaseOut(top);
        }
    }

    // ---------- Reveal / Hide (reverse entrance) ----------
    function applyHideAnimation(shapeLayer, textLayers, w, h, startTime){
        var pos = shapeLayer.property("Transform").property("Position");
        var opa = shapeLayer.property("Transform").property("Opacity");
        var scl = shapeLayer.property("Transform").property("Scale");
        try { pos.expression = ""; } catch(e){} // remove wiggle
        pos.setValueAtTime(startTime, [0, 0]);
pos.setValueAtTime(startTime+0.3, [w, 0]);

        setEaseOut(pos);
        opa.setValueAtTime(startTime+0.2, 100);
        opa.setValueAtTime(startTime+0.5, 0);
        setEaseOut(opa);
        for (var i=0;i<textLayers.length;i++){
            var top = textLayers[i].property("Transform").property("Opacity");
            top.setValueAtTime(startTime + i*0.05, 100);
            top.setValueAtTime(startTime + 0.2 + i*0.05, 0);
            setEaseOut(top);
        }
    }

    // ---------- Generate ----------
    function generate(opts){
        var comp = getComp(); if (!comp) return;
        state.preset = PRESETS[opts.presetName];
        var size = SIZES[opts.sizeName];
        var w = size.w, h = size.h;
        var shape = opts.shape;
        var positions = getComponentPositions(shape, w, h);

        app.beginUndoGroup(SCRIPT_NAME + " Create HUD");
        var step = "init";
        try {
            step = "precomp";
            var pcName = LAYER_PREFIX + "Panel_precomp";
// Remove existing precomps with same name
for (var idx = app.project.items.length; idx >= 1; idx--){
    var it = app.project.items[idx];
    if (it && it.name === pcName){ it.remove(); }
}
var pc = app.project.items.addComp(pcName, w, h, 1, comp.duration, comp.frameRate);


            step = "controls";
            buildControlLayer(pc, state.preset);
try {
    var ctrl = pc.layer(LAYER_PREFIX + "Colors");
    ctrl.effect("Panel Opacity")("Slider").setValue(opts.panelOpacity);
} catch(e){}

            step = "bg";
            step = "bg";
// HUD_Background disabled — Pillar_BG serves as the panel background
// if (!opts.transparentBG){ ... }


                                  step = "mainShape";
            var main = pc.layers.addShape();
            main.name = LAYER_PREFIX + "Components";
            var root = main.property("ADBE Root Vectors Group");
            try { main.property("Transform").property("Anchor Point").setValue([0, 0]); } catch(e){}
            try { main.property("Transform").property("Position").setValue([0, 0]); } catch(e){}

            // Build components FIRST (they'll render on top), Pillar LAST (renders behind)
            step = "components";
            if (opts.showHeader)   buildHeader(root, w, h, shape, positions);
            var gear  = opts.showGear         ? buildGear(root, positions) : null;
            var pbars = opts.showProgressBars ? buildProgressBars(root, w, h, positions, opts.progressCount) : [];
            var pips  = opts.showPips         ? buildPips(root, positions, 5) : [];
            if (opts.showDataBars) buildDataBars(root, w, positions);
            var sel   = opts.showSelection ? buildSelection(root, w, positions) : null;
            var radar = opts.showRadar     ? buildRadar(root, positions) : null;
            if (opts.showCorners) buildCorners(root, w, h, positions);
            if (opts.showWaveform)  buildWaveform(root, positions);
            if (opts.showGrid)      buildDataGrid(root, positions);
            if (opts.showHistogram) buildHistogram(root, positions);
            if (opts.showCircuit)   buildCircuitLines(root, w, h, positions);
            if (opts.showMicro)     buildMicroRects(root, w, h);

            // Pillar LAST — becomes the bottom-most group in the list, renders behind
            step = "pillar";
buildPillar(root, w, h, shape, positions);

// Apply panel opacity to Pillar_BG through Fill Opacity
step = "pillar_opacity";
try {
    for (var pi = 1; pi <= root.numProperties; pi++){
        var pp = root.property(pi);
        if (pp && pp.name === "Pillar_BG"){
            var innerG = pp.property("ADBE Vectors Group");
            for (var ii = 1; ii <= innerG.numProperties; ii++){
                var subP = innerG.property(ii);
                if (subP && subP.matchName === "ADBE Vector Graphic - Fill"){
                    var opProp = subP.property("Opacity");
                    if (opProp) {
                        opProp.expression = 'thisComp.layer("' + LAYER_PREFIX + 'Colors").effect("Panel Opacity")("Slider")';
                    }
                    break;
                }
            }
            break;
        }
    }
} catch(e){}





            step = "textLabels";
            var textLayers = opts.showText ? buildTextLabels(pc, positions, w) : [];

            step = "idle_gear";
if (opts.showGear){
    var gearLive = findGroupByName(root, "Gear_Outer");
    if (gearLive){
        var gRot = getGroupRotation(gearLive);
        if (gRot) applyLoopRotation(gRot, 45);
    }
}

step = "idle_radar";
if (opts.showRadar){
    var radarSweepLive = findGroupByName(root, "Radar_Sweep");
    if (radarSweepLive){
        var rRot = getGroupRotation(radarSweepLive);
        if (rRot) applyLoopRotation(rRot, 90);
    }
}

step = "idle_pips";
if (opts.showPips){
    for (var pi = 1; pi <= 5; pi++){
        var pipLive = findGroupByName(root, "Pip_" + pi);
        if (pipLive){
            var pOp = getGroupOpacity(pipLive);
            if (pOp) applyPipBlink(pOp, pi * 1.7);
        }
    }
}

step = "idle_pbars";
if (opts.showProgressBars){
    for (var bi = 1; bi <= opts.progressCount; bi++){
        var pbLive = findGroupByName(root, "PB_Fill_" + bi);
        if (pbLive){
            var pbPos = null;
            var tr = getGroupTransform(pbLive);
            if (tr){
                try { pbPos = tr.property("ADBE Vector Position"); } catch(e){}
                if (!pbPos) try { pbPos = tr.property("Position"); } catch(e){}
            }
            if (pbPos) applyIdleWiggle(pbPos, 0.5, 2);
        }
    }
}

step = "idle_selection";
if (opts.showSelection){
    var selLive = findGroupByName(root, "Selection");
    if (selLive){
        var sOp = getGroupOpacity(selLive);
        if (sOp){
            try {
                sOp.expression = "var i = thisComp.layer(\"" + LAYER_PREFIX
                    + "Colors\").effect(\"Idle Intensity\")(\"Slider\")/100;\n"
                    + "60 + Math.sin(time*4)*30*i;";
            } catch(e){}
        }
    }
}

        step = "idle_waveform";
        if (opts.showWaveform){
            for (var wi=1; wi<=20; wi++){
                var wfLive = findGroupByName(root, "WF_"+wi);
                if (wfLive){
                    var tr = getGroupTransform(wfLive);
                    if (tr){
                        var scP = null;
                        try { scP = tr.property("ADBE Vector Scale"); } catch(e){}
                        if (!scP) try { scP = tr.property("Scale"); } catch(e){}
                        if (scP){
                            try {
                                scP.expression = "var i = thisComp.layer(\"" + LAYER_PREFIX
                                    + "Colors\").effect(\"Idle Intensity\")(\"Slider\")/100;\n"
                                    + "seedRandom(" + wi + ", true);\n"
                                    + "var s = 40 + Math.abs(Math.sin(time*3 + " + wi + "))*60*i + random(-10,10);\n"
                                    + "[100, s];";
                            } catch(e){}
                        }
                    }
                }
            }
        }

        step = "idle_grid";
        if (opts.showGrid){
            for (var gr=1; gr<=4; gr++){
                for (var gc=1; gc<=4; gc++){
                    var cellLive = findGroupByName(root, "Grid_"+gr+"_"+gc);
                    if (cellLive){
                        var cOp = getGroupOpacity(cellLive);
                        if (cOp){
                            var seed = gr*4 + gc;
                            try {
                                cOp.expression = "var i = thisComp.layer(\"" + LAYER_PREFIX
                                    + "Colors\").effect(\"Idle Intensity\")(\"Slider\")/100;\n"
                                    + "seedRandom(" + seed + ", true);\n"
                                    + "var blink = (Math.sin(time*2 + " + seed + ") > 0.5) ? 90 : 30;\n"
                                    + "linear(i, 0, 1, 60, blink);";
                            } catch(e){}
                        }
                    }
                }
            }
        }

        step = "idle_histogram";
        if (opts.showHistogram){
            for (var hi=1; hi<=6; hi++){
                var hLive = findGroupByName(root, "Hist_"+hi);
                if (hLive){
                    var trH = getGroupTransform(hLive);
                    if (trH){
                        var scH = null;
                        try { scH = trH.property("ADBE Vector Scale"); } catch(e){}
                        if (!scH) try { scH = trH.property("Scale"); } catch(e){}
                        if (scH){
                            try {
                                scH.expression = "var i = thisComp.layer(\"" + LAYER_PREFIX
                                    + "Colors\").effect(\"Idle Intensity\")(\"Slider\")/100;\n"
                                    + "var s = 60 + Math.sin(time*1.5 + " + hi + "*0.7)*40*i;\n"
                                    + "[100, s];";
                            } catch(e){}
                        }
                    }
                }
            }
        }

        step = "idle_micro";
        if (opts.showMicro){
            for (var mi=1; mi<=8; mi++){
                var mLive = findGroupByName(root, "Micro_"+mi);
                if (mLive){
                    var mOp = getGroupOpacity(mLive);
                    if (mOp){
                        try {
                            mOp.expression = "var i = thisComp.layer(\"" + LAYER_PREFIX
                                + "Colors\").effect(\"Idle Intensity\")(\"Slider\")/100;\n"
                                + "seedRandom(" + mi + ", true);\n"
                                + "var blink = (Math.sin(time*4 + " + mi*1.3 + ") > 0.6) ? 80 : 20;\n"
                                + "linear(i, 0, 1, 50, blink);";
                        } catch(e){}
                    }
                }
            }
        }


            step = "entrance";
            applyEntrance(main, textLayers, opts.entrance, pc, w, h, positions);

            step = "hideAnim";
if (opts.addHide){
    var hideT = opts.hideTime; // seconds from panel start
    applyHideAnimation(main, textLayers, w, h, hideT);
}


            step = "placeInComp";
            var pcLayer = comp.layers.add(pc);
            pcLayer.name = LAYER_PREFIX + "Panel";
            pcLayer.startTime = comp.time;

            step = "parentToSelected";
            var sel2 = comp.selectedLayers;
            if (sel2 && sel2.length>0){
                var target = null;
                for (var s=0;s<sel2.length;s++){
                    if (sel2[s] !== pcLayer){ target = sel2[s]; break; }
                }
                if (target){
                    pcLayer.parent = target;
                    // Position pcLayer at target's position with offset
                    var tp = target.property("Transform").property("Position").value;
                    pcLayer.property("Transform").property("Position").setValue([opts.offsetX, opts.offsetY]);
                }
            }

            app.endUndoGroup();
        } catch(err){
            app.endUndoGroup();
            alert("Error at step: " + step + "\n" + err.toString());
        }
    }

    // ---------- State ----------
    var state = { preset: PRESETS["Ice Blue"] };

    // ---------- UI ----------
    function addSectionLabel(parent, text){
        var lbl = parent.add("statictext", undefined, text);
        try { lbl.graphics.foregroundColor = lbl.graphics.newPen(lbl.graphics.PenType.SOLID_COLOR, ACCENT_COLOR, 1); } catch(e){}
        lbl.alignment = ["fill","top"];
        return lbl;
    }

    function addSlider(parent, labelText, min, max, val, unit, integer){
        var g = parent.add("group");
        g.orientation = "row"; g.alignChildren = ["fill","center"]; g.alignment = ["fill","top"];
        g.spacing = 4; g.margins = 0;
        var lbl = g.add("statictext", undefined, labelText);
        lbl.preferredSize.width = 85;
var s = g.add("slider", undefined, val, min, max);
s.minimumSize.width = 100;
s.preferredSize.height = 20;
s.alignment = ["fill","center"];
var et = g.add("edittext", undefined, integer?String(Math.round(val)):String(val));
et.preferredSize.width = 42;
et.preferredSize.height = 20;
var uL = g.add("statictext", undefined, unit||"");
uL.preferredSize.width = 20;

        s.onChanging = function(){
            var v = integer ? Math.round(s.value) : Math.round(s.value*100)/100;
            et.text = String(v);
        };
        et.onChange = function(){
            var v = parseFloat(et.text); if (isNaN(v)) v = val;
            v = clamp(v, min, max); s.value = v;
            et.text = integer ? String(Math.round(v)) : String(v);
        };
        return { slider:s, edit:et, value: function(){ var v=parseFloat(et.text); return isNaN(v)?val:v; } };
    }

    function buildUI(thisObj){
        var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME+" "+SCRIPT_VERSION, undefined, {resizeable:true});
        win.orientation = "column";
        win.alignChildren = ["fill","top"];
        win.spacing = 5; win.margins = 8;
        win.preferredSize.width = 300;
win.preferredSize.height = 660;
win.minimumSize.width = 290;
win.minimumSize.height = 620;



        // Title
        var titleRow = win.add("group");
        titleRow.orientation = "row"; titleRow.alignChildren = ["fill","center"];
        var title = titleRow.add("statictext", undefined, SCRIPT_NAME+" "+SCRIPT_VERSION);
        title.alignment = ["fill","center"];
        var helpBtn = titleRow.add("button", undefined, "?");
        helpBtn.preferredSize.width = 25;

        // PRESET
        addSectionLabel(win, "PRESET");
        var presetRow = win.add("group"); presetRow.orientation="row"; presetRow.alignChildren=["fill","center"];
        presetRow.add("statictext", undefined, "Style:").preferredSize.width = 45;
        var presetDD = presetRow.add("dropdownlist", undefined, ["Ice Blue","Battleship","Industrial Yellow","Dark Chrome"]);
        presetDD.selection = 0; presetDD.alignment = ["fill","center"]; presetDD.minimumSize.width = 130;


        // SHAPE & SIZE
        addSectionLabel(win, "SHAPE & SIZE");
        var shapeRow = win.add("group"); shapeRow.orientation="row"; shapeRow.alignChildren=["fill","center"];
        shapeRow.add("statictext", undefined, "Shape:").preferredSize.width = 60;
        var shapeDD = shapeRow.add("dropdownlist", undefined, ["Rectangular","Rounded","Circular"]);
        shapeDD.selection = 0; shapeDD.alignment = ["fill","center"]; shapeDD.minimumSize.width = 130;


        var sizeRow = win.add("group"); sizeRow.orientation="row"; sizeRow.alignChildren=["fill","center"];
        sizeRow.add("statictext", undefined, "Size:").preferredSize.width = 60;
        var sizeDD = sizeRow.add("dropdownlist", undefined, ["Small","Medium","Large"]);
        sizeDD.selection = 0; sizeDD.alignment = ["fill","center"]; sizeDD.minimumSize.width = 130;


        var opSl = addSlider(win, "Panel opacity:", 0, 100, 85, "%", true);
        var transpCb = win.add("checkbox", undefined, "Transparent background (no panel)");
        transpCb.value = false;

        // COMPONENTS
        addSectionLabel(win, "COMPONENTS");
        var cGrid = win.add("group"); cGrid.orientation="column"; cGrid.alignChildren=["fill","top"]; cGrid.spacing = 2;
        function addCb(text, val){ var c = cGrid.add("checkbox", undefined, text); c.value = val; return c; }
        var cbHeader   = addCb("Header block", true);
        var cbGear     = addCb("Gear icon (rotating)", true);
        var cbPBars    = addCb("Progress bars", true);
        var cbPips     = addCb("Status pips (blinking)", true);
        var cbDataBars = addCb("Data bars (decorative)", true);
        var cbSelection= addCb("Selection highlight", true);
        var cbRadar    = addCb("Radar / crosshair", true);
        var cbCorners  = addCb("Corner brackets", true);
        var cbText     = addCb("Text labels (auto-generated)", true);
        var cbWaveform = win.add("checkbox", undefined, "Waveform (equalizer)");
        cbWaveform.value = true;
        var cbGrid     = win.add("checkbox", undefined, "Data grid 4x4");
        cbGrid.value = true;
        var cbHistogram= win.add("checkbox", undefined, "Histogram");
        cbHistogram.value = true;
        var cbCircuit  = win.add("checkbox", undefined, "Circuit lines");
        cbCircuit.value = true;
        var cbMicro    = win.add("checkbox", undefined, "Micro rects (noise)");
        cbMicro.value = true;

        var pbSl = addSlider(win, "Progress bars:", 1, 5, 3, "", true);

        // ENTRANCE
        addSectionLabel(win, "ENTRANCE");
        var entRow = win.add("group"); entRow.orientation="row"; entRow.alignChildren=["fill","center"];
        entRow.add("statictext", undefined, "Type:").preferredSize.width = 60;
        var entDD = entRow.add("dropdownlist", undefined, ["Slide-in","Assemble","Scatter-collect","Fade-in"]);
        entDD.selection = 0; entDD.alignment = ["fill","center"]; entDD.minimumSize.width = 130;

        var cbHide = win.add("checkbox", undefined, "Add Hide animation at end");
        cbHide.value = false;
        var hideTimeSl = addSlider(win, "Hide time:", 1, 30, 3, "s", false);

        // OFFSET
        addSectionLabel(win, "POSITION");
        var offX = addSlider(win, "Offset X:", -500, 500, 0, "px", true);
        var offY = addSlider(win, "Offset Y:", -500, 500, 0, "px", true);

        // ACTIONS
        var actRow = win.add("group");
        actRow.orientation="row"; actRow.alignChildren=["fill","center"]; actRow.alignment=["fill","bottom"];
        var createBtn = actRow.add("button", undefined, "Create HUD Panel");
        createBtn.alignment = ["fill","center"]; createBtn.preferredSize.height = 28;

                createBtn.onClick = function(){
            var opts = {
                presetName: presetDD.selection.text,
                shape: shapeDD.selection.text,
                sizeName: sizeDD.selection.text,
                panelOpacity: opSl.value(),
                transparentBG: transpCb.value,
                showHeader: cbHeader.value,
                showGear: cbGear.value,
                showProgressBars: cbPBars.value,
                progressCount: Math.round(pbSl.value()),
                showPips: cbPips.value,
                showDataBars: cbDataBars.value,
                showSelection: cbSelection.value,
                showRadar: cbRadar.value,
                showCorners: cbCorners.value,
                showText: cbText.value,
                entrance: entDD.selection.text,
                addHide: cbHide.value,
                hideTime: hideTimeSl.value(),
                offsetX: Math.round(offX.value()),
                offsetY: Math.round(offY.value()),
                showWaveform: cbWaveform.value,
                showGrid: cbGrid.value,
                showHistogram: cbHistogram.value,
                showCircuit: cbCircuit.value,
                showMicro: cbMicro.value

            };
            generate(opts);
        };

        helpBtn.onClick = function(){ alert(getHelpText()); };

        if (win instanceof Window){ win.center(); win.show(); }
        else { win.layout.layout(true); win.layout.resize(); }
    }

    function getHelpText(){
        return SCRIPT_NAME+" "+SCRIPT_VERSION+"\n\n"
            + "Собирает целую холографическую HUD-панель одним кликом — pillar, шестерёнка, progress bars, статус-точки, радар, скобки, текстовые метки. У всех компонентов есть idle-анимации (постоянное движение «ожидания»).\n\n"
            + "БЫСТРЫЙ СТАРТ:\n"
            + "1. Поставь Null в место, где должна быть панель.\n"
            + "2. Выдели Null и установи CTI на момент появления.\n"
            + "3. Выбери пресет цвета, форму, размер.\n"
            + "4. Включи нужные компоненты.\n"
            + "5. Выбери анимацию появления.\n"
            + "6. Нажми Create HUD Panel.\n\n"
            + "ПРЕСЕТЫ ЦВЕТА:\n"
            + "• Ice Blue — светло-голубой фон, белые линии.\n"
            + "• Battleship — сине-серый с ржавым акцентом.\n"
            + "• Industrial Yellow — серый с жёлтым акцентом (как оригинальный референс).\n"
            + "• Dark Chrome — тёмный металлик, минимализм.\n\n"
            + "БЫСТРАЯ ПЕРЕКРАСКА:\n"
            + "Внутри pre-comp есть слой HUD_Colors — Null с Color Controls (Main, Accent, Panel, BG, Panel Opacity, Idle Intensity). Меняешь цвета на нём — вся панель перекрашивается. (В v1.0 не все элементы завязаны на expression, некоторые статичны — будет доработано.)\n\n"
            + "ФОРМА:\n"
            + "• Rectangular — классический прямоугольник.\n"
            + "• Rounded — со скруглёнными углами.\n"
            + "• Circular — круглая раскладка, gear в центре, компоненты по дуге.\n\n"
            + "РАЗМЕРЫ:\n"
            + "• Small — 250×400 px.\n"
            + "• Medium — 320×500 px.\n"
            + "• Large — 400×600 px.\n\n"
            + "КОМПОНЕНТЫ:\n"
            + "• Header — жёлтая полоса сверху.\n"
            + "• Gear — вращающаяся шестерёнка (loopOut).\n"
            + "• Progress bars — 1-5 полос с idle-пульсацией заливки.\n"
            + "• Status pips — точки с случайным миганием.\n"
            + "• Data bars — декоративные полоски.\n"
            + "• Selection — жёлтая полоса с пульсом яркости.\n"
            + "• Radar — вращающийся сектор.\n"
            + "• Corner brackets — угловые скобки.\n"
            + "• Text labels — авто-генерация: SYSTEM READY, CH-42, LOADING 67%, ID-1234, timestamp.\n\n"
            + "АНИМАЦИЯ ПОЯВЛЕНИЯ:\n"
            + "• Slide-in — панель въезжает справа с micro-jitter.\n"
            + "• Assemble — панель появляется с bounce-масштабом (эффект сборки).\n"
            + "• Scatter-collect — компоненты сжимаются снаружи внутрь.\n"
            + "• Fade-in — простое появление opacity.\n\n"
            + "HIDE ANIMATION:\n"
            + "Галочка «Add Hide animation at end» — за 1 сек до конца композиции панель уезжает обратно и растворяется.\n\n"
            + "IDLE INTENSITY:\n"
            + "Слайдер на HUD_Colors управляет силой всех «дышащих» движений (wiggle, blink). 0 = панель замирает, 100 = максимум движения. По умолчанию 50%.\n\n"
            + "СОЗДАВАЕМЫЕ СЛОИ:\n"
            + "• HUD_Panel (в основной композиции) — сама пре-композиция.\n"
            + "• Внутри HUD_Panel_precomp: HUD_Colors (управление), HUD_Background, HUD_Components (все shape-элементы), HUD_Label_1..3 (текст).\n\n"
            + "СОВЕТЫ:\n"
            + "• Для карты города — привяжи HUD к Null возле объекта (машина, здание).\n"
            + "• Комбинируй с ptp_GPSLock (Target Lock рядом с HUD) для эффекта «сканирование + данные».\n"
            + "• Уменьшай Idle intensity до 20-30% для спокойных сцен.\n"
            + "• Для «серьёзной» сцены используй Dark Chrome + Rectangular + отключи pips и radar.\n"
            + "• Для яркой sci-fi — Ice Blue + Circular + все компоненты ON.\n";
    }

    buildUI(thisObj);
})(this);

