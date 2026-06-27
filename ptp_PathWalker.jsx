// ============================================================
// ptp_PathWalker.jsx
// Walk along a path: place markers at vertices and draw
// segments between them sequentially (clockwise/CCW).
// Version: 1.0
// Install: Adobe After Effects/Support Files/Scripts/ScriptUI Panels/
// Open:    Window → ptp_PathWalker.jsx
// ============================================================

(function (thisObj) {
    var SCRIPT_NAME = "ptp_PathWalker";
    var SCRIPT_VERSION = "v1.0";
    var LAYER_PREFIX = "PW_";

    var COL_ACCENT = [1.00, 0.55, 0.10];

    var EASING_PRESETS = {
        "Linear":         { inInf: 0.1, outInf: 0.1, interp: "linear" },
        "Ease Out":       { inInf: 75,  outInf: 15,  interp: "bezier" },
        "Ease In/Out":    { inInf: 65,  outInf: 65,  interp: "bezier" },
        "Ease Out Back":  { inInf: 85,  outInf: 25,  interp: "bezier" }
    };
    var EASING_NAMES = ["Linear", "Ease Out", "Ease In/Out", "Ease Out Back"];

    // ============================================================
    // GENERIC HELPERS
    // ============================================================
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Open a composition first."); return null; }
        return c;
    }
    function getSelLayer() {
        var c = getComp(); if (!c) return null;
        var sel = c.selectedLayers;
        if (!sel || sel.length === 0) { alert("Select a layer with a mask or shape path."); return null; }
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

    function applyEasingToProp(prop, easingName) {
        var preset = EASING_PRESETS[easingName] || EASING_PRESETS["Ease Out"];
        var dim = 1;
        try {
            var sample = prop.valueAtTime(0, false);
            if (sample instanceof Array) dim = sample.length;
        } catch(e){}
        for (var i = 1; i <= prop.numKeys; i++) {
            if (preset.interp === "linear") {
                try { prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); } catch(e){}
            } else {
                try { prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch(e){}
                var ein = [], eout = [];
                for (var d = 0; d < dim; d++) {
                    ein.push(new KeyframeEase(0, preset.inInf));
                    eout.push(new KeyframeEase(0, preset.outInf));
                }
                try {
                    if (dim === 1) prop.setTemporalEaseAtKey(i, [ein[0]], [eout[0]]);
                    else           prop.setTemporalEaseAtKey(i, ein, eout);
                } catch(e){}
            }
        }
    }

    function setLoopExpression(prop, mode) {
        try { prop.expression = 'loopOut("' + (mode || "cycle") + '")'; } catch(e) {}
    }

    // ============================================================
    // PATH DISCOVERY
    // ============================================================
    // Returns array of {kind:"mask"|"shape", label, getProp:function, isClosed:function}
    function findPaths(layer) {
        var paths = [];

        // Masks
        try {
            var maskGrp = layer.property("ADBE Mask Parade");
            if (maskGrp) {
                for (var i = 1; i <= maskGrp.numProperties; i++) {
                    (function(idx){
                        var mask = maskGrp.property(idx);
                        if (!mask) return;
                        paths.push({
                            kind: "mask",
                            label: "Mask: " + mask.name,
                            getProp: function(){ return mask.property("ADBE Mask Shape"); },
                            isClosed: function(){
                                try { return mask.property("ADBE Mask Shape").value.closed; }
                                catch(e){ return true; }
                            }
                        });
                    })(i);
                }
            }
        } catch(e) {}

        // Shape paths inside Shape Layer
        if (layer instanceof ShapeLayer) {
            try {
                var root = layer.property("ADBE Root Vectors Group");
                function walk(group, breadcrumb) {
                    for (var i = 1; i <= group.numProperties; i++) {
                        var p = group.property(i);
                        if (!p) continue;
                        if (p.matchName === "ADBE Vector Group") {
                            var inner = p.property("ADBE Vectors Group");
                            if (inner) walk(inner, breadcrumb + "/" + p.name);
                        } else if (p.matchName === "ADBE Vector Shape - Group") {
                            (function(pp, label){
                                paths.push({
                                    kind: "shape",
                                    label: "Shape: " + label,
                                    getProp: function(){ return pp.property("ADBE Vector Shape"); },
                                    isClosed: function(){
                                        try { return pp.property("ADBE Vector Shape").value.closed; }
                                        catch(e){ return true; }
                                    }
                                });
                            })(p, breadcrumb + "/" + p.name);
                        }
                        // Ellipse / Rect / Polystar paths cannot be read as Shape directly,
                        // they generate the path internally. Skipped in v1.0.
                    }
                }
                if (root) walk(root, "");
            } catch(e) {}
        }

        return paths;
    }

    // ============================================================
    // PATH GEOMETRY
    // ============================================================
    // Returns {verts:[[x,y],...], inT:[[dx,dy],...], outT:[[dx,dy],...], closed:bool}
    function readPathData(pathRef) {
        var p = pathRef.getProp().value;
        return {
            verts:  p.vertices,
            inT:    p.inTangents,
            outT:   p.outTangents,
            closed: p.closed
        };
    }

    // Signed area of polygon (positive = CCW in AE coords where Y goes down → flip for CW interpretation)
    function signedArea(verts) {
        var a = 0;
        for (var i = 0; i < verts.length; i++) {
            var p1 = verts[i];
            var p2 = verts[(i + 1) % verts.length];
            a += (p2[0] - p1[0]) * (p2[1] + p1[1]);
        }
        // In AE: positive a → clockwise (because Y axis points down)
        return a;
    }

    // Reverse path direction (verts + tangents)
    function reversePathData(pd) {
        var n = pd.verts.length;
        var v = [], iT = [], oT = [];
        for (var i = n - 1; i >= 0; i--) {
            v.push(pd.verts[i]);
            // When reversing: new inTangent = old outTangent, and vice versa
            iT.push(pd.outT[i]);
            oT.push(pd.inT[i]);
        }
        return { verts:v, inT:iT, outT:oT, closed: pd.closed };
    }

    // Build per-segment path data: each segment is a cubic Bezier (or line) between
    // verts[i] and verts[i+1], using outT[i] as start handle and inT[i+1] as end handle.
    function buildSegments(pd) {
        var segs = [];
        var n = pd.verts.length;
        var lastIdx = pd.closed ? n : (n - 1);
        for (var i = 0; i < lastIdx; i++) {
            var a = i;
            var b = (i + 1) % n;
            segs.push({
                a:   pd.verts[a],
                b:   pd.verts[b],
                oTa: pd.outT[a],
                iTb: pd.inT[b]
            });
        }
        return segs;
    }

    // ============================================================
    // SHAPE LAYER CONSTRUCTION
    // ============================================================
    function buildMarkerPath(markerType, size) {
        // Returns a Shape object describing the marker path
        var s = new Shape();
        var r = size / 2;
        if (markerType === "Dot" || markerType === "Circle") {
            // Approximate circle with 4 bezier nodes
            var k = 0.5522847498 * r;
            s.vertices = [[0,-r],[r,0],[0,r],[-r,0]];
            s.inTangents  = [[-k,0],[0,-k],[k,0],[0,k]];
            s.outTangents = [[k,0],[0,k],[-k,0],[0,-k]];
            s.closed = true;
        } else if (markerType === "Square") {
            s.vertices = [[-r,-r],[r,-r],[r,r],[-r,r]];
            s.inTangents  = [[0,0],[0,0],[0,0],[0,0]];
            s.outTangents = [[0,0],[0,0],[0,0],[0,0]];
            s.closed = true;
        } else if (markerType === "Triangle") {
            s.vertices = [[0,-r],[r*0.866,r*0.5],[-r*0.866,r*0.5]];
            s.inTangents  = [[0,0],[0,0],[0,0]];
            s.outTangents = [[0,0],[0,0],[0,0]];
            s.closed = true;
        } else if (markerType === "Diamond") {
            s.vertices = [[0,-r],[r,0],[0,r],[-r,0]];
            s.inTangents  = [[0,0],[0,0],[0,0],[0,0]];
            s.outTangents = [[0,0],[0,0],[0,0],[0,0]];
            s.closed = true;
        }
        return s;
    }

    function buildSegmentPath(seg) {
        // Two-vertex Bezier path from seg.a to seg.b
        // Tangents are relative to the vertex in AE.
        var s = new Shape();
        s.vertices    = [seg.a, seg.b];
        s.outTangents = [seg.oTa, [0, 0]];
        s.inTangents  = [[0, 0], seg.iTb];
        s.closed = false;
        return s;
    }

    // Create a vector group containing a single path + fill/stroke + transform
    function addPathGroup(contents, groupName, pathShape, fillColor, strokeColor, strokeWidth, useStroke, useFill, addTrimPaths) {
        var grp = contents.addProperty("ADBE Vector Group");
        grp.name = groupName;
        var inner = grp.property("ADBE Vectors Group");

        var pathProp = inner.addProperty("ADBE Vector Shape - Group");
        try { pathProp.property("ADBE Vector Shape").setValue(pathShape); } catch(e) {}

        if (useFill && fillColor) {
            var fill = inner.addProperty("ADBE Vector Graphic - Fill");
            try { fill.property("Color").setValue(fillColor); } catch(e){}
        }
        if (useStroke && strokeColor) {
            var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
            try { stroke.property("Color").setValue(strokeColor); } catch(e){}
            try { stroke.property("Stroke Width").setValue(strokeWidth); } catch(e){}
        }

        var trim = null;
        if (addTrimPaths) {
            trim = inner.addProperty("ADBE Vector Filter - Trim");
            try { trim.property("End").setValue(0); } catch(e) {}
        }

        return { group: grp, pathProp: pathProp, trim: trim };
    }

    // ============================================================
    // MAIN GENERATOR
    // ============================================================
    function generate(opts) {
        var comp = getComp(); if (!comp) return;
        var srcLayer = getSelLayer(); if (!srcLayer) return;

        var pathRef = opts.pathRef;
        if (!pathRef) { alert("No path available."); return; }

        var pd = readPathData(pathRef);
        if (!pd.verts || pd.verts.length < 2) { alert("Path has too few vertices."); return; }

        // Direction handling
        if (opts.direction === "CW" || opts.direction === "CCW") {
            var area = signedArea(pd.verts);
            // In AE (Y down): positive area = CW. If user wants CW but area<0 → reverse.
            if (opts.direction === "CW"  && area < 0) pd = reversePathData(pd);
            if (opts.direction === "CCW" && area > 0) pd = reversePathData(pd);
        }
        // else "VertexOrder" → leave as is

        var segments = buildSegments(pd);
        var numSegs = segments.length;
        var numVerts = pd.verts.length;

        // Create one shape layer for everything
        var outLayer = comp.layers.addShape();
        outLayer.name = LAYER_PREFIX + srcLayer.name;
        outLayer.moveBefore(srcLayer);

        // Copy transform from source layer so paths align visually
        try {
            var srcT = srcLayer.property("Transform");
            var dstT = outLayer.property("Transform");
            dstT.property("Position").setValue(srcT.property("Position").value);
            dstT.property("Anchor Point").setValue(srcT.property("Anchor Point").value);
            dstT.property("Scale").setValue(srcT.property("Scale").value);
            dstT.property("Rotation").setValue(srcT.property("Rotation").value);
        } catch(e) {}

        var contents = outLayer.property("ADBE Root Vectors Group");

        var t0 = comp.time;
        var markerDur = opts.markerDur;
        var segDur    = opts.segDur;
        var stepDelay = markerDur + segDur; // each vertex+segment step length

        // ---- SEGMENTS (built first so they sit below markers visually) ----
        var trimRefs = [];
        if (opts.showTrace) {
            for (var s = 0; s < numSegs; s++) {
                var segShape = buildSegmentPath(segments[s]);
                var info = addPathGroup(
                    contents,
                    "Segment_" + (s + 1),
                    segShape,
                    null,
                    opts.traceColor,
                    opts.traceWidth,
                    true,   // useStroke
                    false,  // useFill
                    true    // addTrimPaths
                );

                if (opts.dashed && info.group) {
                    // Add dash to stroke
                    try {
                        var inner = info.group.property("ADBE Vectors Group");
                        // Find the stroke we just added
                        for (var k = 1; k <= inner.numProperties; k++) {
                            var pp = inner.property(k);
                            if (pp.matchName === "ADBE Vector Graphic - Stroke") {
                                var dashes = pp.property("ADBE Vector Stroke Dashes");
                                if (dashes) {
                                    var d = dashes.addProperty("ADBE Vector Stroke Dash 1");
                                    try { d.setValue(6); } catch(e){}
                                    var g = dashes.addProperty("ADBE Vector Stroke Gap 1");
                                    try { g.setValue(4); } catch(e){}
                                }
                                break;
                            }
                        }
                    } catch(e) {}
                }

                // Animate Trim Paths End
                var trimEnd = info.trim.property("End");
                var segStart = t0 + (s * stepDelay) + markerDur; // marker appears first, then segment draws
                trimEnd.setValueAtTime(segStart, 0);
                trimEnd.setValueAtTime(segStart + segDur, 100);
                applyEasingToProp(trimEnd, opts.easing);
                trimRefs.push({ prop: trimEnd, startVal: 0 });
            }
        }

        // ---- MARKERS ----
        var markerRefs = [];
        if (opts.showMarkers) {
            for (var m = 0; m < numVerts; m++) {
                // If path is open, draw markers on all verts.
                // If path is closed, last vert == first vert effectively (we still draw N markers,
                // one per vertex; the segment 0→1→...→N-1→0 connects them).
                var v = pd.verts[m];
                var mShape = buildMarkerPath(opts.markerType, opts.markerSize);

                var useStrokeForMarker = (opts.markerType === "Circle");
                var info2 = addPathGroup(
                    contents,
                    "Marker_" + (m + 1),
                    mShape,
                    opts.markerColor,
                    opts.markerColor,
                    opts.markerStrokeWidth,
                    useStrokeForMarker,            // stroke only for "Circle" type
                    !useStrokeForMarker,           // fill for Dot/Square/Triangle/Diamond
                    false                          // no trim paths
                );

                // Position the marker via its group's transform
                try {
                    var gt = info2.group.property("ADBE Vector Transform Group");
                    gt.property("ADBE Vector Position").setValue(v);

                    var opProp = gt.property("ADBE Vector Group Opacity");
                    var scProp = gt.property("ADBE Vector Scale");

                    var markStart = t0 + m * stepDelay;
                    opProp.setValueAtTime(markStart, 0);
                    opProp.setValueAtTime(markStart + markerDur, 100);
                    scProp.setValueAtTime(markStart, [0, 0]);
                    scProp.setValueAtTime(markStart + markerDur * 0.6, [115, 115]);
                    scProp.setValueAtTime(markStart + markerDur, [100, 100]);

                    applyEasingToProp(opProp, opts.easing);
                    applyEasingToProp(scProp, opts.easing);

                    markerRefs.push({ op: opProp, sc: scProp });
                } catch(e) {}
            }
        }

        // ---- LOOP HANDLING: hold then reset ----
        if (opts.loop) {
            var lastActiveTime = t0 + numSegs * stepDelay + (opts.showMarkers ? markerDur : 0);
            var cycleEnd = t0 + opts.cycle;
            if (cycleEnd <= lastActiveTime + 0.05) cycleEnd = lastActiveTime + 0.5;

            // For each trim: hold at 100, then reset to 0 at cycle end
            for (var ti = 0; ti < trimRefs.length; ti++) {
                var tp = trimRefs[ti].prop;
                tp.setValueAtTime(cycleEnd - 0.001, 100);
                tp.setValueAtTime(cycleEnd, 0);
                // Hold interpolation on reset
                try {
                    tp.setInterpolationTypeAtKey(tp.numKeys, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                    tp.setInterpolationTypeAtKey(tp.numKeys - 1, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                } catch(e) {}
                setLoopExpression(tp, "cycle");
            }
            // For each marker: hold then reset
            for (var mi = 0; mi < markerRefs.length; mi++) {
                var mop = markerRefs[mi].op;
                var msc = markerRefs[mi].sc;
                mop.setValueAtTime(cycleEnd - 0.001, 100);
                mop.setValueAtTime(cycleEnd, 0);
                msc.setValueAtTime(cycleEnd - 0.001, [100,100]);
                msc.setValueAtTime(cycleEnd, [0,0]);
                try {
                    mop.setInterpolationTypeAtKey(mop.numKeys, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                    mop.setInterpolationTypeAtKey(mop.numKeys - 1, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                    msc.setInterpolationTypeAtKey(msc.numKeys, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                    msc.setInterpolationTypeAtKey(msc.numKeys - 1, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                } catch(e) {}
                setLoopExpression(mop, "cycle");
                setLoopExpression(msc, "cycle");
            }
        }

        return outLayer;
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
        lbl.preferredSize.width = 110;
        lbl.minimumSize.width = 110;
        var sld = row.add("slider", undefined, val, mn, mx);
        sld.preferredSize.width = 130;
        sld.minimumSize.width = 100;
        var box = row.add("edittext", undefined, (step >= 1) ? String(val) : Number(val).toFixed(2));
        box.preferredSize.width = 50;
        box.minimumSize.width = 50;
        sld.onChanging = function(){
            var v = (step >= 1) ? Math.round(sld.value) : Math.round(sld.value/step)*step;
            box.text = (step >= 1) ? String(v) : v.toFixed(2);
            onChange(v);
        };
        box.onChange = function(){
            var v = parseFloat(box.text);
            if (isNaN(v)) return;
            v = clamp(v, mn, mx);
            sld.value = v;
            box.text = (step >= 1) ? String(Math.round(v)) : v.toFixed(2);
            onChange(v);
        };
    }
        function makeColorSwatch(parent, label, initialColor, onChange) {
        var row = parent.add("group");
        row.orientation = "row";
        row.minimumSize.width = 300;
        var lbl = row.add("statictext", undefined, label + ":");
        lbl.preferredSize.width = 110;
        lbl.minimumSize.width = 110;
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
        hex.minimumSize.width = 70;
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
        w.preferredSize.width = 340;
        w.minimumSize.width = 320;


        var title = w.add("statictext", undefined, SCRIPT_NAME + "  " + SCRIPT_VERSION);
        title.graphics.foregroundColor = title.graphics.newPen(title.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);

        var state = {
            pathRef:           null,
            direction:         "CW",
            showMarkers:       true,
            markerType:        "Dot",
            markerSize:        12,
            markerColor:       [1.0, 0.55, 0.10],
            markerStrokeWidth: 2,
            showTrace:         true,
            traceColor:        [1.0, 0.55, 0.10],
            traceWidth:        2,
            dashed:            false,
            markerDur:         0.15,
            segDur:            0.25,
            easing:            "Ease Out",
            loop:              false,
            cycle:             3.0
        };

        // -------- Path source --------
        var srcPanel = w.add("panel", undefined, "Source Path");
        srcPanel.orientation = "column";
        srcPanel.alignChildren = ["fill","top"];
        srcPanel.margins = 8;

        var rowPath = srcPanel.add("group");
        rowPath.orientation = "row";
        var pathLbl = rowPath.add("statictext", undefined, "Path:");
        pathLbl.preferredSize.width = 60;
        var pathDD = rowPath.add("dropdownlist", undefined, ["(none)"]);
        pathDD.preferredSize.width = 200;
        pathDD.selection = 0;
        var refreshBtn = rowPath.add("button", undefined, "↻");
        refreshBtn.preferredSize = [24, 22];

        var pathsCache = [];
        function refreshPaths() {
            var lyr;
            try {
                var c = app.project.activeItem;
                if (c && c instanceof CompItem && c.selectedLayers.length > 0) {
                    lyr = c.selectedLayers[0];
                }
            } catch(e){}
            pathsCache = lyr ? findPaths(lyr) : [];
            // Rebuild dropdown
            pathDD.removeAll();
            if (pathsCache.length === 0) {
                pathDD.add("item", "(no paths found)");
                state.pathRef = null;
            } else {
                for (var i = 0; i < pathsCache.length; i++) {
                    pathDD.add("item", pathsCache[i].label);
                }
                state.pathRef = pathsCache[0];
            }
            pathDD.selection = 0;
        }
        refreshBtn.onClick = refreshPaths;
        pathDD.onChange = function(){
            var idx = pathDD.selection ? pathDD.selection.index : 0;
            state.pathRef = (pathsCache.length > 0) ? pathsCache[idx] : null;
        };
        refreshPaths();

        var rowDir = srcPanel.add("group");
        rowDir.orientation = "row";
        var dirLbl = rowDir.add("statictext", undefined, "Direction:");
        dirLbl.preferredSize.width = 60;
        var dirDD = rowDir.add("dropdownlist", undefined, ["Vertex Order", "CW", "CCW"]);
        dirDD.selection = dirDD.find("CW");
        dirDD.preferredSize.width = 130;
        dirDD.onChange = function(){
            var t = dirDD.selection.text;
            state.direction = (t === "Vertex Order") ? "VertexOrder" : t;
        };

        // -------- Markers --------
        var mPanel = w.add("panel", undefined, "Markers");
        mPanel.orientation = "column";
        mPanel.alignChildren = ["fill","top"];
        mPanel.margins = 8;

        var cbShowM = mPanel.add("checkbox", undefined, "Show markers");
        cbShowM.value = state.showMarkers;
        cbShowM.onClick = function(){ state.showMarkers = cbShowM.value; };

        var rowMT = mPanel.add("group"); rowMT.orientation = "row";
        var mtLbl = rowMT.add("statictext", undefined, "Type:"); mtLbl.preferredSize.width = 110;
        var mtDD = rowMT.add("dropdownlist", undefined, ["Dot","Circle","Square","Triangle","Diamond"]);
        mtDD.selection = mtDD.find("Dot");
        mtDD.preferredSize.width = 130;
        mtDD.onChange = function(){ state.markerType = mtDD.selection.text; };

        addSlider(mPanel, "Size (px)", 2, 60, state.markerSize, 1, function(v){ state.markerSize = v; });
        addSlider(mPanel, "Stroke W (Circle)", 1, 10, state.markerStrokeWidth, 1, function(v){ state.markerStrokeWidth = v; });
        makeColorSwatch(mPanel, "Color", state.markerColor, function(c){ state.markerColor = c; });

        // -------- Trace --------
        var tPanel = w.add("panel", undefined, "Path Trace");
        tPanel.orientation = "column";
        tPanel.alignChildren = ["fill","top"];
        tPanel.margins = 8;

        var cbShowT = tPanel.add("checkbox", undefined, "Show trace (drawn segments)");
        cbShowT.value = state.showTrace;
        cbShowT.onClick = function(){ state.showTrace = cbShowT.value; };

        addSlider(tPanel, "Width (px)", 1, 20, state.traceWidth, 1, function(v){ state.traceWidth = v; });
        makeColorSwatch(tPanel, "Color", state.traceColor, function(c){ state.traceColor = c; });
        var cbDash = tPanel.add("checkbox", undefined, "Dashed");
        cbDash.value = state.dashed;
        cbDash.onClick = function(){ state.dashed = cbDash.value; };

        // -------- Animation --------
        var aPanel = w.add("panel", undefined, "Animation");
        aPanel.orientation = "column";
        aPanel.alignChildren = ["fill","top"];
        aPanel.margins = 8;

        addSlider(aPanel, "Marker dur (s)",  0.05, 1.0, state.markerDur, 0.05, function(v){ state.markerDur = v; });
        addSlider(aPanel, "Segment dur (s)", 0.05, 2.0, state.segDur,    0.05, function(v){ state.segDur = v; });

        var rowEase = aPanel.add("group"); rowEase.orientation = "row";
        var eLbl = rowEase.add("statictext", undefined, "Easing:"); eLbl.preferredSize.width = 110;
        var eDD = rowEase.add("dropdownlist", undefined, EASING_NAMES);
        eDD.selection = eDD.find(state.easing);
        eDD.preferredSize.width = 130;
        eDD.onChange = function(){ state.easing = eDD.selection.text; };

        var rowLoop = aPanel.add("group"); rowLoop.orientation = "row";
        var lLbl = rowLoop.add("statictext", undefined, "Loop:"); lLbl.preferredSize.width = 110;
        var cbLoop = rowLoop.add("checkbox", undefined, "Cycle");
        cbLoop.value = state.loop;

        var cycleGrp = aPanel.add("group");
        cycleGrp.orientation = "column";
        cycleGrp.alignChildren = ["fill","top"];
        cycleGrp.enabled = state.loop;
        addSlider(cycleGrp, "Cycle Length (s)", 0.5, 20.0, state.cycle, 0.1, function(v){ state.cycle = v; });

        cbLoop.onClick = function(){
            state.loop = cbLoop.value;
            cycleGrp.enabled = state.loop;
        };

        divider(w);

        var btnRow = w.add("group");
        btnRow.orientation = "row";
        var btnGo = btnRow.add("button", undefined, "Create Walker");
        btnGo.preferredSize.height = 30;
        var btnHelp = btnRow.add("button", undefined, "?");
        btnHelp.preferredSize.width = 28;

        btnGo.onClick = function(){
            if (!state.pathRef) { alert("No path selected. Click ↻ after selecting a layer with a mask or shape path."); return; }
            if (!state.showMarkers && !state.showTrace) { alert("Enable at least 'Show markers' or 'Show trace'."); return; }
            app.beginUndoGroup(SCRIPT_NAME + ": Create Walker");
            try { generate(state); }
            catch(err) { alert("Error: " + err.toString()); }
            app.endUndoGroup();
        };

        btnHelp.onClick = function(){ alert(getHelpText()); };

                if (w instanceof Window) {
            w.center();
            w.show();
        } else {
            w.layout.layout(true);
            w.layout.resize();
            w.onResizing = w.onResize = function(){ this.layout.resize(); };
        }
        return w;

    }

    function getHelpText() {
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n" +
            "Walk along a path: markers + drawn segments.\n\n" +
            "USAGE:\n" +
            "1. Select a layer with a Mask Path or a Shape Layer with a Path.\n" +
            "2. Click ↻ to refresh the path dropdown.\n" +
            "3. Pick the path and direction (Vertex Order / CW / CCW).\n" +
            "4. Configure markers and trace.\n" +
            "5. Set CTI to where the animation should start.\n" +
            "6. Click 'Create Walker'.\n\n" +
            "PATH SOURCES:\n" +
            "• Mask Path — masks on any layer (priority).\n" +
            "• Shape Path — Pen-drawn paths inside a Shape Layer.\n" +
            "• Parametric Ellipse/Rect/Polystar shapes are NOT supported in v1.0\n" +
            "  (convert via right-click → Convert To Bezier Path).\n\n" +
            "DIRECTION:\n" +
            "• Vertex Order — uses raw vertex order from the path.\n" +
            "• CW / CCW — auto-reverses path if needed to match.\n\n" +
            "ANIMATION:\n" +
            "• Marker dur — pop-in time per vertex.\n" +
            "• Segment dur — draw time for each segment.\n" +
            "• Step delay = marker dur + segment dur.\n" +
            "• Loop — holds full trace, then resets at Cycle Length and replays.\n\n" +
            "OUTPUT:\n" +
            "• One Shape Layer named '" + LAYER_PREFIX + "<src>' is created above source.\n" +
            "• Markers + segments live as separate groups inside.\n" +
            "• Transform is copied from source for visual alignment.\n\n" +
            "NOTES:\n" +
            "• Bezier tangents from the original path are preserved.\n" +
            "• Closed paths: N markers + N segments (last connects back).\n" +
            "• Open paths: N markers + (N-1) segments.\n";
    }

    buildUI(thisObj);

})(this);
