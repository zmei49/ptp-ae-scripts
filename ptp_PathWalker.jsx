// ============================================================
// ptp_PathWalker.jsx
// Walk along a path: place markers at vertices and draw
// segments between them sequentially (clockwise/CCW).
// var SCRIPT_VERSION = "v1.0.3";
// Changes vs 1.0.2:
//   • Fixed sampleParametricToShape: Ellipse/Star now use matchName-based
//     property access (works in RU locale). Rect with roundness preserves
//     corners as 8-vertex bezier.
//   • Added filterCloseVertices: removes vertices closer than minDist
//     (avoids marker pile-up on rounded corners).
//   • Added "Min Vertex Distance" slider, wired into opts.minVertexDist.
//   • Loop debug uses findGroupByName (avoids "Object is invalid").
//   • addSlider/makeColorSwatch return refs (for external value access if needed).
// ============================================================

(function (thisObj) {
    var SCRIPT_NAME = "ptp_PathWalker";
    var SCRIPT_VERSION = "v1.0.3";
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
        try {
            prop.expression = 'loopOut("' + (mode || "cycle") + '")';
            prop.expressionEnabled = true;
        } catch(e) {}
    }

    // ============================================================
    // PATH DISCOVERY
    // ============================================================
    function findPaths(layer) {
        var paths = [];
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
                            getProp: function(){ return mask.property("ADBE Mask Shape"); }
                        });
                    })(i);
                }
            }
        } catch(e) {}

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
                                    getProp: function(){ return pp.property("ADBE Vector Shape"); }
                                });
                            })(p, breadcrumb + "/" + p.name);
                        }
                    }
                }
                if (root) walk(root, "");
            } catch(e) {}
        }
        return paths;
    }

    // ============================================================
    // CONVERT PARAMETRIC TO BEZIER
    // ============================================================
    function convertParametricToBezier(layer) {
        if (!(layer instanceof ShapeLayer)) {
            alert("Select a Shape Layer to convert parametric paths.");
            return 0;
        }
        var paramTypes = {
            "ADBE Vector Shape - Rect":    true,
            "ADBE Vector Shape - Ellipse": true,
            "ADBE Vector Shape - Star":    true
        };

        var toConvert = [];
        function collect(group) {
            for (var i = 1; i <= group.numProperties; i++) {
                var p;
                try { p = group.property(i); } catch(e) { continue; }
                if (!p) continue;
                if (p.matchName === "ADBE Vector Group") {
                    var inner = null;
                    try { inner = p.property("ADBE Vectors Group"); } catch(e) {}
                    if (inner) collect(inner);
                } else if (paramTypes[p.matchName]) {
                    toConvert.push({ parent: group, index: i, prop: p, name: p.name, matchName: p.matchName });
                }
            }
        }
        var root;
        try { root = layer.property("ADBE Root Vectors Group"); } catch(e) {}
        if (!root) return 0;
        collect(root);

        var converted = 0;
        for (var k = toConvert.length - 1; k >= 0; k--) {
            var item = toConvert[k];
            try {
                var shapeData = sampleParametricToShape(item.prop);
                if (!shapeData) continue;
                var bezPath = item.parent.addProperty("ADBE Vector Shape - Group");
                try { bezPath.property("ADBE Vector Shape").setValue(shapeData); } catch(e){}
                try { bezPath.name = item.name + " (Bezier)"; } catch(e){}
                try { bezPath.moveTo(item.index); } catch(e){}
                try { item.prop.remove(); } catch(e){}
                converted++;
            } catch(e) {}
        }
        return converted;
    }

    // Sample a parametric shape (Rect / Ellipse / Star) into a Shape object
    function sampleParametricToShape(prop) {
        var mn = prop.matchName;
        try {
            if (mn === "ADBE Vector Shape - Rect") {
                var size = prop.property("ADBE Vector Rect Size").value;
                var pos  = prop.property("ADBE Vector Rect Position").value;
                var rnd  = 0;
                try { rnd = prop.property("ADBE Vector Rect Roundness").value; } catch(e) {}
                var w = size[0]/2, h = size[1]/2;
                var cx = pos[0], cy = pos[1];
                var r = Math.min(rnd, w, h);
                if (r <= 0.01) {
                    var shape = new Shape();
                    shape.vertices    = [[cx-w,cy-h],[cx+w,cy-h],[cx+w,cy+h],[cx-w,cy+h]];
                    shape.inTangents  = [[0,0],[0,0],[0,0],[0,0]];
                    shape.outTangents = [[0,0],[0,0],[0,0],[0,0]];
                    shape.closed = true;
                    return shape;
                }
                var k = r * 0.5522847498;
                var shape = new Shape();
                shape.vertices = [
                    [cx-w+r, cy-h],   [cx+w-r, cy-h],
                    [cx+w,   cy-h+r], [cx+w,   cy+h-r],
                    [cx+w-r, cy+h],   [cx-w+r, cy+h],
                    [cx-w,   cy+h-r], [cx-w,   cy-h+r]
                ];
                shape.inTangents  = [[-k,0],[0,0],[0,-k],[0,0],[ k,0],[0,0],[0, k],[0,0]];
                shape.outTangents = [[ 0,0],[ k,0],[0, 0],[0, k],[ 0,0],[-k,0],[0, 0],[0,-k]];
                shape.closed = true;
                return shape;
            }
            if (mn === "ADBE Vector Shape - Ellipse") {
                var size = prop.property("ADBE Vector Ellipse Size").value;
                var pos  = prop.property("ADBE Vector Ellipse Position").value;
                var rx = size[0]/2, ry = size[1]/2;
                var cx = pos[0], cy = pos[1];
                var k = 0.5522847498;
                var s = new Shape();
                s.vertices = [
                    [cx,      cy - ry],
                    [cx + rx, cy     ],
                    [cx,      cy + ry],
                    [cx - rx, cy     ]
                ];
                s.inTangents  = [[-rx*k, 0], [0, -ry*k], [ rx*k, 0], [0,  ry*k]];
                s.outTangents = [[ rx*k, 0], [0,  ry*k], [-rx*k, 0], [0, -ry*k]];
                s.closed = true;
                return s;
            }
            if (mn === "ADBE Vector Shape - Star") {
                var points = Math.round(prop.property("ADBE Vector Star Points").value);
                var pos    = prop.property("ADBE Vector Star Position").value;
                var rot    = prop.property("ADBE Vector Star Rotation").value * Math.PI / 180;
                var outerR = prop.property("ADBE Vector Star Outer Radius").value;
                var starType = prop.property("ADBE Vector Star Type").value; // 1=Star, 2=Polygon
                var s = new Shape();
                var verts = [], inT = [], outT = [];
                if (starType === 2) {
                    for (var i = 0; i < points; i++) {
                        var a = rot - Math.PI/2 + (Math.PI*2*i/points);
                        verts.push([pos[0] + outerR*Math.cos(a), pos[1] + outerR*Math.sin(a)]);
                        inT.push([0,0]); outT.push([0,0]);
                    }
                } else {
                    var innerR = prop.property("ADBE Vector Star Inner Radius").value;
                    var n = points * 2;
                    for (var j = 0; j < n; j++) {
                        var r = (j % 2 === 0) ? outerR : innerR;
                        var ang = rot - Math.PI/2 + (Math.PI*2*j/n);
                        verts.push([pos[0] + r*Math.cos(ang), pos[1] + r*Math.sin(ang)]);
                        inT.push([0,0]); outT.push([0,0]);
                    }
                }
                s.vertices = verts;
                s.inTangents = inT;
                s.outTangents = outT;
                s.closed = true;
                return s;
            }
        } catch(e) {}
        return null;
    }

    // ============================================================
    // PATH GEOMETRY
    // ============================================================
    function readPathData(pathRef) {
        var p = pathRef.getProp().value;
        return { verts: p.vertices, inT: p.inTangents, outT: p.outTangents, closed: p.closed };
    }

    function signedArea(verts) {
        var a = 0;
        for (var i = 0; i < verts.length; i++) {
            var p1 = verts[i];
            var p2 = verts[(i + 1) % verts.length];
            a += (p2[0] - p1[0]) * (p2[1] + p1[1]);
        }
        return a;
    }

    function reversePathData(pd) {
        var n = pd.verts.length;
        var v = [], iT = [], oT = [];
        for (var i = n - 1; i >= 0; i--) {
            v.push(pd.verts[i]);
            iT.push(pd.outT[i]);
            oT.push(pd.inT[i]);
        }
        return { verts:v, inT:iT, outT:oT, closed: pd.closed };
    }

    function buildSegments(pd) {
        var segs = [];
        var n = pd.verts.length;
        var lastIdx = pd.closed ? n : (n - 1);
        for (var i = 0; i < lastIdx; i++) {
            var a = i;
            var b = (i + 1) % n;
            segs.push({ a: pd.verts[a], b: pd.verts[b], oTa: pd.outT[a], iTb: pd.inT[b] });
        }
        return segs;
    }

            // Cluster nearby vertices, return marker placement data.
    // mode:
    //   "centroid" — marker positions = centroid of cluster (path NOT preserved between markers)
    //   "smooth"   — marker positions = middle vertex of cluster (real point on path)
    function clusterMarkers(pd, minDist, mode, dbg) {
        var verts = pd.verts;
        var n = verts.length;
        var closed = !!pd.closed;
        // Default: no filtering — every vertex is its own marker
        if (!verts || n < 2 || minDist <= 0) {
            var idxAll = [], posAll = [];
            for (var z = 0; z < n; z++) { idxAll.push(z); posAll.push(verts[z]); }
            if (dbg) dbg.push("cluster: off, " + n + " markers");
            return { indices: idxAll, positions: posAll, clusters: null };
        }

        // Build consecutive clusters
        var clusters = [];
        var cur = [0];
        for (var i = 1; i < n; i++) {
            var prev = verts[cur[cur.length - 1]];
            var dx = verts[i][0] - prev[0], dy = verts[i][1] - prev[1];
            if (Math.sqrt(dx*dx + dy*dy) < minDist) cur.push(i);
            else { clusters.push(cur); cur = [i]; }
        }
        clusters.push(cur);

        // Wrap-around for closed paths
        if (closed && clusters.length > 1) {
            var lastC = clusters[clusters.length - 1];
            var firstC = clusters[0];
            var pLast = verts[lastC[lastC.length - 1]];
            var pFirst = verts[firstC[0]];
            var dxc = pLast[0] - pFirst[0], dyc = pLast[1] - pFirst[1];
            if (Math.sqrt(dxc*dxc + dyc*dyc) < minDist) {
                clusters[0] = lastC.concat(firstC);
                clusters.pop();
            }
        }

        var indices = [], positions = [];
        for (var c = 0; c < clusters.length; c++) {
            var cl = clusters[c];
            if (cl.length === 1) {
                indices.push(cl[0]);
                positions.push(verts[cl[0]]);
            } else if (mode === "centroid") {
                // Center of cluster — independent of path
                var sx = 0, sy = 0;
                for (var j = 0; j < cl.length; j++) { sx += verts[cl[j]][0]; sy += verts[cl[j]][1]; }
                indices.push(cl[Math.floor(cl.length / 2)]); // for boundary tracking
                positions.push([sx / cl.length, sy / cl.length]);
            } else {
                // "smooth" — pick real middle vertex of cluster
                var midIdx = cl[Math.floor(cl.length / 2)];
                indices.push(midIdx);
                positions.push(verts[midIdx]);
            }
        }

        if (dbg) {
            dbg.push("cluster: mode=" + mode + ", minDist=" + minDist);
            dbg.push("  verts=" + n + ", clusters=" + clusters.length);
        }
        return { indices: indices, positions: positions, clusters: clusters };
    }



    // ============================================================
    // SHAPE BUILDERS
    // ============================================================
    function buildMarkerPath(markerType, size) {
        var s = new Shape();
        var r = size / 2;
        if (markerType === "Dot" || markerType === "Circle") {
            var k = 0.5522847498 * r;
            s.vertices = [[0,-r],[r,0],[0,r],[-r,0]];
            s.inTangents  = [[-k,0],[0,-k],[k,0],[0,k]];
            s.outTangents = [[k,0],[0,k],[-k,0],[0,-k]];
            s.closed = true;
        } else if (markerType === "Square") {
            s.vertices = [[-r,-r],[r,-r],[r,r],[-r,r]];
            s.inTangents = [[0,0],[0,0],[0,0],[0,0]];
            s.outTangents = [[0,0],[0,0],[0,0],[0,0]];
            s.closed = true;
        } else if (markerType === "Triangle") {
            s.vertices = [[0,-r],[r*0.866,r*0.5],[-r*0.866,r*0.5]];
            s.inTangents = [[0,0],[0,0],[0,0]];
            s.outTangents = [[0,0],[0,0],[0,0]];
            s.closed = true;
        } else if (markerType === "Diamond") {
            s.vertices = [[0,-r],[r,0],[0,r],[-r,0]];
            s.inTangents = [[0,0],[0,0],[0,0],[0,0]];
            s.outTangents = [[0,0],[0,0],[0,0],[0,0]];
            s.closed = true;
        }
        return s;
    }

    function buildSegmentPath(seg) {
        var s = new Shape();
        s.vertices    = [seg.a, seg.b];
        s.outTangents = [seg.oTa, [0, 0]];
        s.inTangents  = [[0, 0], seg.iTb];
        s.closed = false;
        return s;
    }

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
    function applyDashIfNeeded(info, dashed) {
        if (!dashed || !info.group) return;
        try {
            var inner = info.group.property("ADBE Vectors Group");
            for (var kk = 1; kk <= inner.numProperties; kk++) {
                var pp = inner.property(kk);
                if (pp && pp.matchName === "ADBE Vector Graphic - Stroke") {
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

    // Helper for loop-block: get fresh group ref by name
    function findGroupByName(parent, name) {
        for (var i = 1; i <= parent.numProperties; i++) {
            var p = parent.property(i);
            if (p && p.name === name) return p;
        }
        return null;
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

        if (opts.direction === "CW" || opts.direction === "CCW") {
            var area = signedArea(pd.verts);
            if (opts.direction === "CW"  && area < 0) pd = reversePathData(pd);
            if (opts.direction === "CCW" && area > 0) pd = reversePathData(pd);
        }

                       // === CLUSTER MARKERS ===
        // Markers may be filtered; segments behavior depends on mode:
        //   centroid → straight lines between centroid markers
        //   smooth   → full original path between sparse markers
        //   off (minVertexDist=0) → every vertex gets a marker, full path segments
        var filterDbg = [];
        var mode = opts.mergeMode || "centroid";
        var cluster = clusterMarkers(pd, opts.minVertexDist || 0, mode, filterDbg);
        var markerPositions = cluster.positions;     // where to place markers
        var markerIndices   = cluster.indices;        // index into pd.verts (for boundaries)
        var numMarkers = markerPositions.length;
        if (numMarkers < 1) {
            alert("No markers after clustering.\nReduce 'Min Vertex Distance'.\n\n" + filterDbg.join("\n"));
            return;
        }
        // alert("Cluster report:\n" + filterDbg.join("\n"));

        var numVerts = pd.verts.length;
        var numSegs = 0; // will be filled in segments block


        var outLayer = comp.layers.addShape();
        outLayer.name = LAYER_PREFIX + srcLayer.name;
        outLayer.moveBefore(srcLayer);

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
        var stepDelay = markerDur + segDur;

                // Build MARKERS FIRST so they occupy lower indices (= rendered on top)
        if (opts.showMarkers) {
            for (var m = 0; m < numMarkers; m++) {
                var v = markerPositions[m];
                var mShape = buildMarkerPath(opts.markerType, opts.markerSize);
                var useStrokeForMarker = (opts.markerType === "Circle");
                var info2 = addPathGroup(
                    contents, "Marker_" + (m + 1), mShape,
                    opts.markerColor, opts.markerColor, opts.markerStrokeWidth,
                    useStrokeForMarker, !useStrokeForMarker, false
                );
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
                } catch(e) {}
            }
        }

                // Build SEGMENTS AFTER markers.
        // In "centroid" mode: straight segments between marker centroids.
        // In "smooth" mode (or off): segments follow the full original path,
        // grouped between consecutive marker indices to keep tempo aligned.
        if (opts.showTrace) {
            var useSmooth = (mode === "smooth") || (!opts.minVertexDist || opts.minVertexDist <= 0);
            var segCounter = 0;

            if (!useSmooth) {
                // CENTROID: straight lines between markerPositions
                var lastIdx = pd.closed ? numMarkers : (numMarkers - 1);
                for (var s = 0; s < lastIdx; s++) {
                    var a = markerPositions[s];
                    var b = markerPositions[(s + 1) % numMarkers];
                    var segShape = buildSegmentPath({ a:a, b:b, oTa:[0,0], iTb:[0,0] });
                    segCounter++;
                    var info = addPathGroup(
                        contents, "Segment_" + segCounter, segShape,
                        null, opts.traceColor, opts.traceWidth,
                        true, false, true
                    );
                    applyDashIfNeeded(info, opts.dashed);
                    var trimEnd = info.trim.property("End");
                    var segStart = t0 + s * stepDelay + markerDur;
                    trimEnd.setValueAtTime(segStart, 0);
                    trimEnd.setValueAtTime(segStart + segDur, 100);
                    applyEasingToProp(trimEnd, opts.easing);
                }
            } else {
                // SMOOTH (or off): follow real path between marker indices
                var boundaries = [];
                var bLast = pd.closed ? numMarkers : (numMarkers - 1);
                for (var bi = 0; bi < bLast; bi++) {
                    var iA = markerIndices[bi];
                    var iB = markerIndices[(bi + 1) % numMarkers];
                    // For wrap-around make end index > start
                    if (iB <= iA && pd.closed) iB += pd.verts.length;
                    boundaries.push([iA, iB]);
                }

                for (var bIdx = 0; bIdx < boundaries.length; bIdx++) {
                    var a0 = boundaries[bIdx][0];
                    var b0 = boundaries[bIdx][1];
                    var subCount = b0 - a0;
                    if (subCount < 1) continue;
                    var chunkStart = t0 + bIdx * stepDelay + markerDur;
                    var perSub = segDur / subCount;

                    for (var k = 0; k < subCount; k++) {
                        var srcA = (a0 + k) % pd.verts.length;
                        var srcB = (a0 + k + 1) % pd.verts.length;
                        var seg = {
                            a: pd.verts[srcA],
                            b: pd.verts[srcB],
                            oTa: pd.outT[srcA] || [0,0],
                            iTb: pd.inT[srcB]  || [0,0]
                        };
                        var segShape = buildSegmentPath(seg);
                        segCounter++;
                        var info = addPathGroup(
                            contents, "Segment_" + segCounter, segShape,
                            null, opts.traceColor, opts.traceWidth,
                            true, false, true
                        );
                        applyDashIfNeeded(info, opts.dashed);
                        var trimEnd = info.trim.property("End");
                        var subStart = chunkStart + k * perSub;
                        trimEnd.setValueAtTime(subStart, 0);
                        trimEnd.setValueAtTime(subStart + perSub, 100);
                        applyEasingToProp(trimEnd, opts.easing);
                    }
                }
            }

            numSegs = segCounter;
        }


        // ---- LOOP HANDLING ----
        var lastActiveTime = t0;
        var cycleEnd = t0;
        if (opts.loop) {
                       var lastSegEnd  = numMarkers > 0 ? (t0 + (numMarkers - 1) * stepDelay + markerDur + segDur) : t0;
            var lastMarkEnd = numMarkers > 0 ? (t0 + (numMarkers - 1) * stepDelay + markerDur)          : t0;

            lastActiveTime = Math.max(lastSegEnd, lastMarkEnd);
            cycleEnd = t0 + opts.cycle;
            if (cycleEnd <= lastActiveTime + 0.2) cycleEnd = lastActiveTime + 0.5;

            // Segments
            if (opts.showTrace) {
                for (var ti = 0; ti < numSegs; ti++) {
                    try {
                        var g = findGroupByName(contents, "Segment_" + (ti + 1));
                        if (!g) continue;
                        var innerG = g.property("ADBE Vectors Group");
                        var trim = null;
                        for (var jj = 1; jj <= innerG.numProperties; jj++) {
                            var pr = innerG.property(jj);
                            if (pr && pr.matchName === "ADBE Vector Filter - Trim") { trim = pr; break; }
                        }
                        if (!trim) continue;
                        var tp = trim.property("End");
                        tp.setValueAtTime(cycleEnd - 0.05, 100);
                        tp.setValueAtTime(cycleEnd, 0);
                        var nLast = tp.numKeys;
                        tp.setInterpolationTypeAtKey(nLast,     KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                        tp.setInterpolationTypeAtKey(nLast - 1, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                        setLoopExpression(tp, "cycle");
                    } catch(e) {}
                }
            }

            // Markers
            if (opts.showMarkers) {
                               for (var mi = 0; mi < numMarkers; mi++) {

                    try {
                        var g2 = findGroupByName(contents, "Marker_" + (mi + 1));
                        if (!g2) continue;
                        var gt2 = g2.property("ADBE Vector Transform Group");
                        var mop = gt2.property("ADBE Vector Group Opacity");
                        var msc = gt2.property("ADBE Vector Scale");
                        mop.setValueAtTime(cycleEnd - 0.05, 100);
                        mop.setValueAtTime(cycleEnd, 0);
                        msc.setValueAtTime(cycleEnd - 0.05, [100,100]);
                        msc.setValueAtTime(cycleEnd, [0,0]);
                        var n1 = mop.numKeys, n2 = msc.numKeys;
                        mop.setInterpolationTypeAtKey(n1,     KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                        mop.setInterpolationTypeAtKey(n1 - 1, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                        msc.setInterpolationTypeAtKey(n2,     KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                        msc.setInterpolationTypeAtKey(n2 - 1, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                        setLoopExpression(mop, "cycle");
                        setLoopExpression(msc, "cycle");
                    } catch(e) {}
                }
            }

            // Debug alert
            var dbg = "Loop debug:\n";
            dbg += "lastActive=" + lastActiveTime.toFixed(2) + "s\n";
            dbg += "cycleEnd="   + cycleEnd.toFixed(2) + "s\n";
            try {
                var dbgGroup = findGroupByName(contents, "Marker_1");
                if (dbgGroup) {
                    var dbgOp = dbgGroup.property("ADBE Vector Transform Group").property("ADBE Vector Group Opacity");
                    dbg += "Marker_1 Opacity keys: " + dbgOp.numKeys + "\n";
                    dbg += "expr: " + (dbgOp.expression || "(empty)") + "\n";
                    dbg += "exprEnabled: " + dbgOp.expressionEnabled + "\n";
                } else {
                    dbg += "Marker_1 not found\n";
                }
            } catch(e) { dbg += "err: " + e.toString(); }
            alert(dbg);
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
            if (onChange) onChange(v);
        };
        box.onChange = function(){
            var v = parseFloat(box.text);
            if (isNaN(v)) return;
            v = clamp(v, mn, mx);
            sld.value = v;
            box.text = (step >= 1) ? String(Math.round(v)) : v.toFixed(2);
            if (onChange) onChange(v);
        };
        return { slider: sld, box: box };
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
            cycle:             3.0,
            minVertexDist:     0,
            mergeMode:         "centroid",
        };

        // -------- Source Path --------
        var srcPanel = w.add("panel", undefined, "Source Path");
        srcPanel.orientation = "column";
        srcPanel.alignChildren = ["fill","top"];
        srcPanel.margins = 8;
        srcPanel.minimumSize.width = 310;

        var rowPath = srcPanel.add("group");
        rowPath.orientation = "row";
        rowPath.minimumSize.width = 290;
        var pathLbl = rowPath.add("statictext", undefined, "Path:");
        pathLbl.preferredSize.width = 60;
        pathLbl.minimumSize.width = 60;
        var pathDD = rowPath.add("dropdownlist", undefined, ["(none)"]);
        pathDD.preferredSize.width = 180;
        pathDD.minimumSize.width = 150;
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
            pathDD.removeAll();
            if (pathsCache.length === 0) {
                pathDD.add("item", "(no paths found)");
                state.pathRef = null;
            } else {
                for (var i = 0; i < pathsCache.length; i++) pathDD.add("item", pathsCache[i].label);
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

        // Convert button
        var rowConv = srcPanel.add("group");
        rowConv.orientation = "row";
        rowConv.minimumSize.width = 290;
        var convBtn = rowConv.add("button", undefined, "Convert to Bezier Paths");
        convBtn.preferredSize.width = 200;
        convBtn.helpTip = "Converts parametric Rect/Ellipse/Star paths to editable Bezier paths.";
        convBtn.onClick = function(){
            var lyr;
            try {
                var c = app.project.activeItem;
                if (c && c instanceof CompItem && c.selectedLayers.length > 0) lyr = c.selectedLayers[0];
            } catch(e){}
            if (!lyr) { alert("Select a Shape Layer first."); return; }
            app.beginUndoGroup(SCRIPT_NAME + ": Convert to Bezier");
            var n = convertParametricToBezier(lyr);
            app.endUndoGroup();
            alert(n + " parametric path(s) converted.");
            refreshPaths();
        };

        var rowDir = srcPanel.add("group");
        rowDir.orientation = "row";
        rowDir.minimumSize.width = 290;
        var dirLbl = rowDir.add("statictext", undefined, "Direction:");
        dirLbl.preferredSize.width = 60;
        dirLbl.minimumSize.width = 60;
        var dirDD = rowDir.add("dropdownlist", undefined, ["Vertex Order", "CW", "CCW"]);
        dirDD.selection = dirDD.find("CW");
        dirDD.preferredSize.width = 130;
        dirDD.minimumSize.width = 100;
        dirDD.onChange = function(){
            var t = dirDD.selection.text;
            state.direction = (t === "Vertex Order") ? "VertexOrder" : t;
        };

        // Min Vertex Distance (now in Source Path panel — controls path itself)
        addSlider(srcPanel, "Min vert dist (px)", 0, 200, state.minVertexDist, 1,
            function(v){ state.minVertexDist = v; });
        var rowMerge = srcPanel.add("group");
        rowMerge.orientation = "row";
        rowMerge.minimumSize.width = 290;
        var mergeLbl = rowMerge.add("statictext", undefined, "Merge mode:");
        mergeLbl.preferredSize.width = 110;
        mergeLbl.minimumSize.width = 110;
                var mergeDD = rowMerge.add("dropdownlist", undefined, ["Centroid", "Smooth"]);
        mergeDD.selection = mergeDD.find("Centroid");
        mergeDD.preferredSize.width = 130;
        mergeDD.minimumSize.width = 100;
        mergeDD.helpTip = "Centroid: markers at cluster center, straight lines between them.\nSmooth: markers on path, segments follow original path with curves.";
        mergeDD.onChange = function(){
            state.mergeMode = mergeDD.selection.text.toLowerCase();
        };



        // -------- Markers --------
        var mPanel = w.add("panel", undefined, "Markers");
        mPanel.orientation = "column";
        mPanel.alignChildren = ["fill","top"];
        mPanel.margins = 8;
        mPanel.minimumSize.width = 310;

        var cbShowM = mPanel.add("checkbox", undefined, "Show markers");
        cbShowM.value = state.showMarkers;
        cbShowM.onClick = function(){ state.showMarkers = cbShowM.value; };

        var rowMT = mPanel.add("group"); rowMT.orientation = "row"; rowMT.minimumSize.width = 290;
        var mtLbl = rowMT.add("statictext", undefined, "Type:");
        mtLbl.preferredSize.width = 110; mtLbl.minimumSize.width = 110;
        var mtDD = rowMT.add("dropdownlist", undefined, ["Dot","Circle","Square","Triangle","Diamond"]);
        mtDD.selection = mtDD.find("Dot");
        mtDD.preferredSize.width = 130; mtDD.minimumSize.width = 100;
        mtDD.onChange = function(){ state.markerType = mtDD.selection.text; };

        addSlider(mPanel, "Size (px)", 2, 60, state.markerSize, 1, function(v){ state.markerSize = v; });
        addSlider(mPanel, "Stroke W (Circle)", 1, 10, state.markerStrokeWidth, 1, function(v){ state.markerStrokeWidth = v; });
        makeColorSwatch(mPanel, "Color", state.markerColor, function(c){ state.markerColor = c; });

        // -------- Trace --------
        var tPanel = w.add("panel", undefined, "Path Trace");
        tPanel.orientation = "column";
        tPanel.alignChildren = ["fill","top"];
        tPanel.margins = 8;
        tPanel.minimumSize.width = 310;

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
        aPanel.minimumSize.width = 310;

        addSlider(aPanel, "Marker dur (s)",  0.05, 10.0, state.markerDur, 0.05, function(v){ state.markerDur = v; });
        addSlider(aPanel, "Segment dur (s)", 0.05, 20.0, state.segDur,    0.05, function(v){ state.segDur = v; });

        var rowEase = aPanel.add("group"); rowEase.orientation = "row"; rowEase.minimumSize.width = 290;
        var eLbl = rowEase.add("statictext", undefined, "Easing:");
        eLbl.preferredSize.width = 110; eLbl.minimumSize.width = 110;
        var eDD = rowEase.add("dropdownlist", undefined, EASING_NAMES);
        eDD.selection = eDD.find(state.easing);
        eDD.preferredSize.width = 130; eDD.minimumSize.width = 100;
        eDD.onChange = function(){ state.easing = eDD.selection.text; };

        var rowLoop = aPanel.add("group"); rowLoop.orientation = "row"; rowLoop.minimumSize.width = 290;
        var lLbl = rowLoop.add("statictext", undefined, "Loop:");
        lLbl.preferredSize.width = 110; lLbl.minimumSize.width = 110;
        var cbLoop = rowLoop.add("checkbox", undefined, "Cycle");
        cbLoop.value = state.loop;

        var cycleGrp = aPanel.add("group");
        cycleGrp.orientation = "column";
        cycleGrp.alignChildren = ["fill","top"];
        cycleGrp.enabled = state.loop;
        addSlider(cycleGrp, "Cycle Length (s)", 0.5, 30.0, state.cycle, 0.1, function(v){ state.cycle = v; });

        cbLoop.onClick = function(){
            state.loop = cbLoop.value;
            cycleGrp.enabled = state.loop;
        };

        divider(w);

        var btnRow = w.add("group");
        btnRow.orientation = "row";
        btnRow.minimumSize.width = 290;
        var btnGo = btnRow.add("button", undefined, "Create Walker");
        btnGo.preferredSize.height = 30;
        btnGo.preferredSize.width = 200;
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
        "Последовательное прохождение по пути: маркеры на вершинах + трасса между ними.\n\n" +
        "БЫСТРЫЙ СТАРТ:\n" +
        "1. Создай путь — маска на слое или Shape Layer с Path.\n" +
        "2. Выдели этот слой.\n" +
        "3. Поставь CTI на время старта анимации.\n" +
        "4. Нажми Refresh — в дропдауне появятся найденные пути.\n" +
        "5. Выбери путь, настрой параметры, нажми Create Walker.\n\n" +
        "SOURCE PATH:\n" +
        "• Refresh — пересканировать выбранный слой.\n" +
        "• Convert to Bezier — конвертирует параметрические фигуры\n" +
        "  (Rectangle, Ellipse, Star) в Bezier Path. Делать ДО Refresh.\n" +
        "  Rounded Rectangle сохраняет скругления (8 вершин).\n" +
        "• Direction — Vertex Order / CW / CCW.\n" +
        "• Min vert dist — минимальное расстояние между маркерами в px.\n" +
        "  0 = без фильтра. Полезно на скруглённых углах.\n" +
        "• Merge mode:\n" +
        "   - Centroid: маркер в центре кластера, сегменты прямыми.\n" +
        "   - Smooth: маркер на пути, сегменты повторяют форму со скруглениями.\n\n" +
        "MARKERS:\n" +
        "• Show markers — вкл/выкл точки.\n" +
        "• Type — Circle / Square / Triangle / Diamond.\n" +
        "• Size, Stroke width, Color.\n\n" +
        "TRACE:\n" +
        "• Show trace — вкл/выкл соединительные сегменты.\n" +
        "• Trace width, Color, Dash (пунктир).\n\n" +
        "ANIMATION:\n" +
        "• Marker duration — длительность появления маркера (fade-in + scale).\n" +
        "• Segment duration — длительность отрисовки одного сегмента (Trim End).\n" +
        "• Easing — Linear / Ease Out / Ease In-Out / Ease Out Back.\n" +
        "• Loop — добавляет HOLD-ключи и loopOut('cycle').\n" +
        "• Cycle length — длина цикла в секундах (если меньше длительности трассы,\n" +
        "  скрипт сам подвинет на lastActiveTime + 0.5 с).\n\n" +
        "Z-ORDER:\n" +
        "• Маркеры создаются ПЕРЕД сегментами, поэтому всегда сверху.\n\n" +
        "СОЗДАВАЕМЫЕ СЛОИ:\n" +
        "• " + LAYER_PREFIX + "<source> — один shape-слой с Contents:\n" +
        "   Marker_1..N (сверху), Segment_1..M (снизу).\n\n" +
        "СОВЕТЫ:\n" +
        "• Если маркеры скапливаются на скруглениях — Min vert dist = 40-60.\n" +
        "• Параметрический Ellipse/Rect сначала Convert to Bezier, потом Refresh.\n" +
        "• Для GPS-трека маски: Direction = Vertex Order.\n" +
        "• Undo откатывает создание целиком.";
}


    buildUI(thisObj);

})(this);
