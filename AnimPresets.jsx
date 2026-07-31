// ptp_AnimPresets.jsx v1.0.1 — PART 1 (fixed)


(function ptp_AnimPresets(thisObj) {

    var SCRIPT_NAME = "ptp_AnimPresets";
    var SCRIPT_VERSION = "v1.0.2";
    var LAYER_PREFIX = "AP_";
// v1.0.2 changelog:
//   • Fix: Tint colors без alpha в Glitch Pop-In (RGB split)
//   • Fix: MicroJitter больше не даёт двойного смещения по X/Y
//   • Fix: Concentric Arcs Trim свойства через matchName (не англ.-only)
//   • Fix: Aura Circle Ramp свойства через индексы (не англ.-only)
//   • Fix: Glow Pulse с fallback matchName + display name
//   • Cleanup: убраны draft-версии Shimmer expression
//   • Cleanup: убраны битые попытки менять nStart.source.width
//   • Help: добавлены разделы Aura Circle, Drag Inertia, COMMON,
//           предупреждение о Light Sweep alpha matte
    var COL_ACCENT = [1.0, 0.55, 0.15];

    // ---------- UTILS ----------
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function hexToRGB(h) {
        h = String(h).replace('#', '');
        if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        var r = parseInt(h.substr(0, 2), 16) / 255;
        var g = parseInt(h.substr(2, 2), 16) / 255;
        var b = parseInt(h.substr(4, 2), 16) / 255;
        if (isNaN(r) || isNaN(g) || isNaN(b)) return [1, 1, 1];
        return [r, g, b];
    }
    function rgbToHex(rgb) {
        function h(v) { v = Math.round(v * 255); var s = v.toString(16); return s.length < 2 ? "0" + s : s; }
        return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
    }
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) {
            alert("Активная композиция не найдена.");
            return null;
        }
        return c;
    }
    function getSelectedLayers(comp) {
        var sel = comp.selectedLayers;
        if (!sel || sel.length === 0) {
            alert("Выделите хотя бы один слой.");
            return null;
        }
        return sel;
    }
    function setEaseOut(prop) {
        try {
            var n = prop.numKeys;
            for (var i = 1; i <= n; i++) {
                var eIn = new KeyframeEase(0, 66);
                var eOut = new KeyframeEase(0, 66);
                prop.setTemporalEaseAtKey(i, [eIn, eIn, eIn], [eOut, eOut, eOut]);
            }
        } catch (e) { }
    }
    function setEaseOutBack(prop) {
        try {
            var n = prop.numKeys;
            for (var i = 1; i <= n; i++) {
                var eIn = new KeyframeEase(0, 85);
                var eOut = new KeyframeEase(0, 30);
                prop.setTemporalEaseAtKey(i, [eIn, eIn, eIn], [eOut, eOut, eOut]);
            }
        } catch (e) { }
    }
    function addLineShape(root, name, p1, p2, color, strokeW) {
        var g = root.addProperty("ADBE Vector Group");
        g.name = name;
        var inner = g.property("ADBE Vectors Group");
        var path = inner.addProperty("ADBE Vector Shape - Group");
        var shp = new Shape();
        shp.vertices = [p1, p2];
        shp.inTangents = [[0, 0], [0, 0]];
        shp.outTangents = [[0, 0], [0, 0]];
        shp.closed = false;
        path.property("ADBE Vector Shape").setValue(shp);
        var s = inner.addProperty("ADBE Vector Graphic - Stroke");
        s.property("ADBE Vector Stroke Color").setValue(color);
        s.property("ADBE Vector Stroke Width").setValue(strokeW);
        return g;
    }

    function getFirstShapeGroupName(layer) {
        try {
            var contents = layer.property("Contents");
            if (contents && contents.numProperties > 0) {
                return contents.property(1).name;
            }
        } catch (e) { }
        return "Shape 1";
    }
    function getFirstPathName(layer) {
        try {
            var contents = layer.property("Contents");
            if (contents && contents.numProperties > 0) {
                var firstGroup = contents.property(1);
                var inner = firstGroup.property("Contents");
                if (inner && inner.numProperties > 0) {
                    for (var i = 1; i <= inner.numProperties; i++) {
                        var p = inner.property(i);
                        if (p.matchName === "ADBE Vector Shape - Group" ||
                            p.matchName === "ADBE Vector Shape - Rect" ||
                            p.matchName === "ADBE Vector Shape - Ellipse" ||
                            p.matchName === "ADBE Vector Shape - Star") {
                            return p.name;
                        }
                    }
                }
            }
        } catch (e) { }
        return "Path 1";
    }

    // =====================================================
    // PRESET 1: Glitch Pop-In
    // =====================================================
    function applyGlitchPopIn(layer, comp, params) {
        var startT = params.startTime;
        var dur = params.glitch_duration;
        var offX = params.glitch_offsetX;
        var glOp = params.glitch_opacity;
        var scFrom = params.glitch_scaleFrom;

        var tr = layer.property("Transform");
        var scl = tr.property("Scale");
        var opa = tr.property("Opacity");
        var origScale = scl.value;

        scl.setValueAtTime(startT, [origScale[0] * scFrom / 100, origScale[1] * scFrom / 100]);
        scl.setValueAtTime(startT + dur, origScale);
        setEaseOutBack(scl);

        opa.setValueAtTime(startT, 0);
        opa.setValueAtTime(startT + dur, 100);
        setEaseOut(opa);

        var pos = tr.property("Position").value;

        var redCopy = layer.duplicate();
        redCopy.moveBefore(layer);
        redCopy.name = LAYER_PREFIX + "Glitch_R_" + layer.name;
        try {
            var eR = redCopy.property("Effects").addProperty("ADBE Tint");
            eR.property(2).setValue([1, 0.15, 0.15]);
eR.property(1).setValue([0, 0, 0]);

        } catch (e) { }
        redCopy.blendingMode = BlendingMode.ADD;
        redCopy.property("Transform").property("Position").setValue([pos[0] + offX, pos[1]]);
        var rOp = redCopy.property("Transform").property("Opacity");
        rOp.setValueAtTime(startT, 0);
        rOp.setValueAtTime(startT + 0.02, glOp);
        rOp.setValueAtTime(startT + dur, 0);
        setEaseOut(rOp);

        var cyanCopy = layer.duplicate();
        cyanCopy.moveBefore(layer);
        cyanCopy.name = LAYER_PREFIX + "Glitch_C_" + layer.name;
        try {
            var eC = cyanCopy.property("Effects").addProperty("ADBE Tint");
            eC.property(2).setValue([0.15, 0.9, 1]);
            eC.property(1).setValue([0, 0, 0]);
        } catch (e) { }
        cyanCopy.blendingMode = BlendingMode.ADD;
        cyanCopy.property("Transform").property("Position").setValue([pos[0] - offX, pos[1]]);
        var cOp = cyanCopy.property("Transform").property("Opacity");
        cOp.setValueAtTime(startT, 0);
        cOp.setValueAtTime(startT + 0.02, glOp);
        cOp.setValueAtTime(startT + dur, 0);
        setEaseOut(cOp);
    }

    // =====================================================
    // PRESET 2: Slide-In Cascade
    // =====================================================
    function applySlideInCascade(layers, comp, params) {
        var startT = params.startTime;
        var dur = params.slide_duration;
        var dist = params.slide_distance;
        var dir = params.slide_direction;
        var stagger = params.slide_stagger;

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var t0 = startT + i * stagger;
            var t1 = t0 + dur;

            var tr = layer.property("Transform");
            var pos = tr.property("Position");
            var opa = tr.property("Opacity");
            var finalPos = pos.value;

            var offX = 0, offY = 0;
            if (dir === "Left") offX = -dist;
            if (dir === "Right") offX = dist;
            if (dir === "Top") offY = -dist;
            if (dir === "Bottom") offY = dist;

            pos.setValueAtTime(t0, [finalPos[0] + offX, finalPos[1] + offY]);
            pos.setValueAtTime(t1, finalPos);
            setEaseOut(pos);

            opa.setValueAtTime(t0, 0);
            opa.setValueAtTime(t1, 100);
            setEaseOut(opa);
        }
    }
        // Приводит подписи из dropdown к каноническим именам фигур
    function normShape(s){
        var k = String(s).toLowerCase().replace(/[\s_\-]/g, "");
        if (k === "l" || k === "lbracket" || k === "bracket" || k === "уголок") return "L-bracket";
        if (k === "cross" || k === "plus" || k === "pluscross" || k === "+") return "Plus cross";
        if (k === "x" || k === "xcross" || k === "diag") return "X-cross";
        if (k === "squarewithinner" || k === "squareinner" || k === "squarefill" ||
            k === "boxfill" || k === "squaredot") return "Square with inner";
        if (k === "square" || k === "squarehollow" || k === "rect" ||
            k === "box" || k === "hollow") return "Square hollow";
        if (k === "dot" || k === "circledot" || k === "point") return "Circle dot";
        if (k === "ring" || k === "circle" || k === "circlering") return "Circle ring";
        return String(s);
    }


    // =====================================================
    // PRESET 3: Corner Markers (FIXED — expression-driven)
    // =====================================================
    function buildMarkerShape(inner, shapeType, size, color, strokeW) {
        if (!strokeW) strokeW = 2;
        var original = shapeType;
        try {
            shapeType = normShape(shapeType);

            if (shapeType === "Square hollow") {
                var s1 = inner.addProperty("ADBE Vector Shape - Rect");
                s1.property("ADBE Vector Rect Size").setValue([size, size]);
                s1.property("ADBE Vector Rect Position").setValue([0, 0]);
                var st = inner.addProperty("ADBE Vector Graphic - Stroke");
                st.property("ADBE Vector Stroke Color").setValue(color);
                st.property("ADBE Vector Stroke Width").setValue(strokeW);
            }
            else if (shapeType === "Square with inner") {
                var s1b = inner.addProperty("ADBE Vector Shape - Rect");
                s1b.property("ADBE Vector Rect Size").setValue([size, size]);
                s1b.property("ADBE Vector Rect Position").setValue([0, 0]);
                var st1 = inner.addProperty("ADBE Vector Graphic - Stroke");
                st1.property("ADBE Vector Stroke Color").setValue(color);
                st1.property("ADBE Vector Stroke Width").setValue(strokeW);
                var sub = inner.addProperty("ADBE Vector Group");
                sub.name = "InnerFill";
                var subInner = sub.property("ADBE Vectors Group");
                var s2b = subInner.addProperty("ADBE Vector Shape - Rect");
                s2b.property("ADBE Vector Rect Size").setValue([size * 0.4, size * 0.4]);
                s2b.property("ADBE Vector Rect Position").setValue([0, 0]);
                var f2 = subInner.addProperty("ADBE Vector Graphic - Fill");
                f2.property("ADBE Vector Fill Color").setValue(color);
            }
            else if (shapeType === "Circle dot") {
                var e1 = inner.addProperty("ADBE Vector Shape - Ellipse");
                e1.property("ADBE Vector Ellipse Size").setValue([size * 0.5, size * 0.5]);
                e1.property("ADBE Vector Ellipse Position").setValue([0, 0]);
                var fd = inner.addProperty("ADBE Vector Graphic - Fill");
                fd.property("ADBE Vector Fill Color").setValue(color);
            }
            else if (shapeType === "Circle ring") {
                var e2 = inner.addProperty("ADBE Vector Shape - Ellipse");
                e2.property("ADBE Vector Ellipse Size").setValue([size, size]);
                e2.property("ADBE Vector Ellipse Position").setValue([0, 0]);
                var srg = inner.addProperty("ADBE Vector Graphic - Stroke");
                srg.property("ADBE Vector Stroke Color").setValue(color);
                srg.property("ADBE Vector Stroke Width").setValue(strokeW);
            }
            else if (shapeType === "L-bracket") {
                addLineShape(inner, "L_h", [-size / 2, -size / 2], [ size / 2, -size / 2], color, strokeW);
                addLineShape(inner, "L_v", [-size / 2, -size / 2], [-size / 2,  size / 2], color, strokeW);
            }
            else if (shapeType === "Plus cross") {
                addLineShape(inner, "P_h", [-size / 2, 0], [size / 2, 0], color, strokeW);
                addLineShape(inner, "P_v", [0, -size / 2], [0, size / 2], color, strokeW);
            }
            else if (shapeType === "X-cross") {
                addLineShape(inner, "X_a", [-size / 2, -size / 2], [ size / 2,  size / 2], color, strokeW);
                addLineShape(inner, "X_b", [-size / 2,  size / 2], [ size / 2, -size / 2], color, strokeW);
            }
            else {
                // неизвестный тип — рисуем уголок, чтобы группа не осталась пустой
                addLineShape(inner, "L_h", [-size / 2, -size / 2], [ size / 2, -size / 2], color, strokeW);
                addLineShape(inner, "L_v", [-size / 2, -size / 2], [-size / 2,  size / 2], color, strokeW);
                if (!$.global.__ptpShapeWarned) {
                    $.global.__ptpShapeWarned = true;
                    alert("Неизвестный тип маркера: \"" + original + "\"\n" +
                          "Добавь его в normShape() или в buildMarkerShape().");
                }
            }
        } catch (e) {
            alert("buildMarkerShape (" + original + "): " + e.toString() + "\nLine: " + e.line);
        }
    }



        function applyCornerMarkers(layer, comp, params) {
        var startT  = params.startTime;
        var dur     = params.cm_duration;
        var size    = params.cm_size;
        var padding = params.cm_padding;
        var color   = hexToRGB(params.cm_color);
        var looped  = params.gen_looped;
        var hideEnd = params.cm_hideEnd;
        var gap     = (params.cm_loopGap === undefined) ? 0 : params.cm_loopGap;
        var stagger = 0.05;

        // экранируем кавычки/слэши в имени слоя для expression
        var targetName = String(layer.name).replace(/(['\\])/g, "\\$1");

        var sl = comp.layers.addShape();
        sl.name = LAYER_PREFIX + "Corners_" + layer.name;
        try { sl.property("Contents").property(1).remove(); } catch (e) { }
        sl.parent = layer;
        sl.property("Transform").property("Position").setValue([0, 0]);

        var corners = [
            { name: "TL", sx: -1, sy: -1, shape: params.cm_midShape1 },
            { name: "TR", sx:  1, sy: -1, shape: params.cm_midShape2 },
            { name: "BR", sx:  1, sy:  1, shape: params.cm_midShape3 },
            { name: "BL", sx: -1, sy:  1, shape: params.cm_midShape4 }
        ];

        for (var i = 0; i < 4; i++) {
            try {
                var c = corners[i];
                var root = sl.property("Contents");

                var wrap = root.addProperty("ADBE Vector Group");
                wrap.name = "Corner_" + c.name;

                var startG = wrap.property("Contents").addProperty("ADBE Vector Group");
                startG.name = "Start";
                buildMarkerShape(startG.property("Contents"), params.cm_startShape, size, color);

                var midG = wrap.property("Contents").addProperty("ADBE Vector Group");
                midG.name = "Mid";
                buildMarkerShape(midG.property("Contents"), c.shape, size, color);

                var wrapNow   = root.property(i + 1);
                var wrapTrNow = wrapNow.property("Transform");
                var posProp   = wrapTrNow.property("Position");
                var expr =
                    "var L = thisComp.layer('" + targetName + "');\n" +
                    "var r = L.sourceRectAtTime(time, false);\n" +
                    "var a = L.anchorPoint;\n" +
                    "var sx = " + c.sx + ", sy = " + c.sy + ";\n" +
                    "var pad = " + padding + ";\n" +
                    "var cx = (sx < 0 ? r.left : r.left + r.width)  - a[0] + sx*pad;\n" +
                    "var cy = (sy < 0 ? r.top  : r.top  + r.height) - a[1] + sy*pad;\n" +
                    "[cx, cy]";
                try { posProp.expression = expr; } catch (e) { }

                var off = i * stagger;
                var t0 = startT + off;
                var t1 = t0 + dur * 0.25;
                var t2 = t0 + dur * 0.75;
                var t3 = t0 + dur;

                var wrapOp  = wrapTrNow.property("Opacity");
                var startOp = wrapNow.property("Contents").property("Start").property("Transform").property("Opacity");
                var midOp   = wrapNow.property("Contents").property("Mid").property("Transform").property("Opacity");

                if (looped) {
                    // ---- ЦИКЛ ЧЕРЕЗ EXPRESSIONS (без keyframes) ----
                    var period = dur + gap;
                    if (period <= 0) period = 0.01;

                    try { wrapOp.expression = "(time < " + t0 + ") ? 0 : 100"; } catch (e) { }

                    var pre =
                        "var startT=" + startT + ";\n" +
                        "var off=" + off + ";\n" +
                        "var dur=" + dur + ";\n" +
                        "var per=" + period + ";\n" +
                        "var q1=dur*0.25, q2=dur*0.75;\n" +
                        "var t=time-startT-off;\n";

                    var startTail = hideEnd ? "0" : "100*((p-q2)/(dur-q2))";
                    var startIdle = hideEnd ? "0" : "100";

                    var exprStart = pre +
                        "if (t < 0) 0; else {\n" +
                        "  var p = t % per; if (p < 0) p += per;\n" +
                        "  if (p <= q1) 100*(1 - p/q1);\n" +
                        "  else if (p <= q2) 0;\n" +
                        "  else if (p <= dur) " + startTail + ";\n" +
                        "  else " + startIdle + ";\n" +
                        "}";

                    var exprMid = pre +
                        "if (t < 0) 0; else {\n" +
                        "  var p = t % per; if (p < 0) p += per;\n" +
                        "  if (p <= q1) 100*(p/q1);\n" +
                        "  else if (p <= q2) 100;\n" +
                        "  else if (p <= dur) 100*(1-(p-q2)/(dur-q2));\n" +
                        "  else 0;\n" +
                        "}";

                    try { startOp.expression = exprStart; } catch (e) { }
                    try { midOp.expression   = exprMid;   } catch (e) { }

                    if (startOp.expressionError || midOp.expressionError) {
                        alert("Corner Markers (loop) " + c.name + ":\n" +
                              (startOp.expressionError || midOp.expressionError));
                    }
                }
                else {
                    // ---- ОДНОКРАТНО, KEYFRAMES ----
                    wrapOp.setValueAtTime(Math.max(0, startT - 0.001), 0);
                    wrapOp.setValueAtTime(t0, 100);
                    setEaseOut(wrapOp);

                    startOp.setValueAtTime(Math.max(0, startT - 0.001), 0);
                    startOp.setValueAtTime(t0, 100);
                    startOp.setValueAtTime(t1, 0);
                    startOp.setValueAtTime(t2, 0);
                    startOp.setValueAtTime(t3, hideEnd ? 0 : 100);

                    midOp.setValueAtTime(Math.max(0, startT - 0.001), 0);
                    midOp.setValueAtTime(t0, 0);
                    midOp.setValueAtTime(t1, 100);
                    midOp.setValueAtTime(t2, 100);
                    midOp.setValueAtTime(t3, 0);
                }

            } catch (err) {
                alert("Угол " + i + " (" + corners[i].name + "): " + err.toString() + "\nLine: " + err.line);
            }
        }
    }

    // =====================================================
    // PRESET: Shockwave
    // =====================================================
    function applyShockwave(layer, comp, params) {
        var startT = params.startTime;
        var count = params.sw_count;
        var dur = params.sw_duration;
        var maxRad = params.sw_maxRadius;
        var strokeW = params.sw_stroke;
        var color = hexToRGB(params.sw_color);
        var looped = params.gen_looped;
        var fromCtr = params.gen_fromContour;
        var matchSh = params.gen_matchShape;
        var matchScl = params.gen_matchScale;
        var delay = 0.15;

        var sl = comp.layers.addShape();
        sl.name = LAYER_PREFIX + "Shockwave_" + layer.name;
        try { sl.property("Contents").property(1).remove(); } catch (e) { }
        sl.parent = layer;
        sl.property("Transform").property("Position").setValue([0, 0]);

        for (var i = 0; i < count; i++) {
            var t0 = startT + i * delay;
            var t1 = t0 + dur;

            var root = sl.property("Contents");
            var g = root.addProperty("ADBE Vector Group");
            g.name = "Ring_" + (i + 1);
            var inner = g.property("Contents");

            // Форма кольца
            // === Определяем форму target ===
            var srcShapeType = null; // "path" | "rect" | "ellipse" | "star" | null
            var srcShapeProp = null;
            try {
                var testContents = layer.property("Contents");
                if (testContents && testContents.numProperties > 0) {
                    var firstGroup = testContents.property(1);
                    var innerC = firstGroup.property("Contents");
                    for (var pi = 1; pi <= innerC.numProperties; pi++) {
                        var pp = innerC.property(pi);
                        var mn = pp.matchName;
                        if (mn === "ADBE Vector Shape - Group") {
                            srcShapeType = "path";
                            srcShapeProp = pp;
                            break;
                        } else if (mn === "ADBE Vector Shape - Rect") {
                            srcShapeType = "rect";
                            srcShapeProp = pp;
                            break;
                        } else if (mn === "ADBE Vector Shape - Ellipse") {
                            srcShapeType = "ellipse";
                            srcShapeProp = pp;
                            break;
                        } else if (mn === "ADBE Vector Shape - Star") {
                            srcShapeType = "star";
                            srcShapeProp = pp;
                            break;
                        }
                    }
                }
            } catch (e) { }

            if (matchSh && srcShapeType === "path") {
                // Custom path — копируем Shape value
                var pathGroup = inner.addProperty("ADBE Vector Shape - Group");
                try {
                    pathGroup.property("ADBE Vector Shape").setValue(
                        srcShapeProp.property("ADBE Vector Shape").value
                    );
                } catch (e) { }
            }
            else if (matchSh && srcShapeType === "rect") {
                var rect = inner.addProperty("ADBE Vector Shape - Rect");
                rect.property("ADBE Vector Rect Position").setValue([0, 0]);
                if (matchScl) {
                    // Размер = bbox target на текущем кадре (с учётом любых изменений)
                    rect.property("ADBE Vector Rect Size").setValue([10, 10]);
                    var szExpr =
                        "var L = thisComp.layer('" + layer.name + "');\n" +
                        "var r = L.sourceRectAtTime(time, false);\n" +
                        "[r.width, r.height]";
                    try { rect.property("ADBE Vector Rect Size").expression = szExpr; } catch (e) { }
                    try {
                        rect.property("ADBE Vector Rect Roundness").setValue(
                            srcShapeProp.property("ADBE Vector Rect Roundness").value
                        );
                    } catch (e) { }
                } else {
                    try {
                        rect.property("ADBE Vector Rect Size").setValue(
                            srcShapeProp.property("ADBE Vector Rect Size").value
                        );
                        rect.property("ADBE Vector Rect Roundness").setValue(
                            srcShapeProp.property("ADBE Vector Rect Roundness").value
                        );
                    } catch (e) { }
                }
            }
            else if (matchSh && srcShapeType === "ellipse") {
                var elC = inner.addProperty("ADBE Vector Shape - Ellipse");
                elC.property("ADBE Vector Ellipse Position").setValue([0, 0]);
                if (matchScl) {
                    elC.property("ADBE Vector Ellipse Size").setValue([10, 10]);
                    var elSzExpr =
                        "var L = thisComp.layer('" + layer.name + "');\n" +
                        "var r = L.sourceRectAtTime(time, false);\n" +
                        "[r.width, r.height]";
                    try { elC.property("ADBE Vector Ellipse Size").expression = elSzExpr; } catch (e) { }
                } else {
                    try {
                        elC.property("ADBE Vector Ellipse Size").setValue(
                            srcShapeProp.property("ADBE Vector Ellipse Size").value
                        );
                    } catch (e) { }
                }
            }
            else if (matchSh && srcShapeType === "star") {
                // Star/Polygon — Match scale через выражения на радиусах
                var starC = inner.addProperty("ADBE Vector Shape - Star");
                try {
                    var srcStarProps = [
                        "ADBE Vector Star Type",
                        "ADBE Vector Star Points",
                        "ADBE Vector Star Rotation",
                        "ADBE Vector Star Inner Radiu",
                        "ADBE Vector Star Outer Radiu",
                        "ADBE Vector Star Inner Roundess",
                        "ADBE Vector Star Outer Roundess"
                    ];
                    for (var spi = 0; spi < srcStarProps.length; spi++) {
                        try {
                            starC.property(srcStarProps[spi]).setValue(
                                srcShapeProp.property(srcStarProps[spi]).value
                            );
                        } catch (e) { }
                    }
                    starC.property("ADBE Vector Star Position").setValue([0, 0]);
                    if (matchScl) {
                        // Масштабируем радиусы через выражение по bbox
                        var origOuter = srcShapeProp.property("ADBE Vector Star Outer Radiu").value;
                        var origInner = srcShapeProp.property("ADBE Vector Star Inner Radiu").value;
                        var starOuterExpr =
                            "var L = thisComp.layer('" + layer.name + "');\n" +
                            "var r = L.sourceRectAtTime(time, false);\n" +
                            "var origR = " + origOuter + ";\n" +
                            "var baseD = origR * 2;\n" +
                            "var curD = Math.max(r.width, r.height);\n" +
                            "origR * (curD / baseD)";
                        var starInnerExpr =
                            "var L = thisComp.layer('" + layer.name + "');\n" +
                            "var r = L.sourceRectAtTime(time, false);\n" +
                            "var origR = " + origInner + ";\n" +
                            "var baseD = " + origOuter + " * 2;\n" +
                            "var curD = Math.max(r.width, r.height);\n" +
                            "origR * (curD / baseD)";
                        try { starC.property("ADBE Vector Star Outer Radiu").expression = starOuterExpr; } catch (e) { }
                        try { starC.property("ADBE Vector Star Inner Radiu").expression = starInnerExpr; } catch (e) { }
                    }
                } catch (e) { }
            }
            else if (matchSh) {
                // Не shape layer — rounded rect по bounding box
                var rectBB = inner.addProperty("ADBE Vector Shape - Rect");
                rectBB.property("ADBE Vector Rect Size").setValue([10, 10]);
                rectBB.property("ADBE Vector Rect Position").setValue([0, 0]);
                var rectSzExpr =
                    "var L = thisComp.layer('" + layer.name + "');\n" +
                    "var r = L.sourceRectAtTime(time, false);\n" +
                    "[r.width, r.height]";
                try { rectBB.property("ADBE Vector Rect Size").expression = rectSzExpr; } catch (e) { }
                var rectRExpr =
                    "var L = thisComp.layer('" + layer.name + "');\n" +
                    "var r = L.sourceRectAtTime(time, false);\n" +
                    "Math.min(r.width, r.height) / 4";
                try { rectBB.property("ADBE Vector Rect Roundness").expression = rectRExpr; } catch (e) { }
            }
            else {
                var el = inner.addProperty("ADBE Vector Shape - Ellipse");
                el.property("ADBE Vector Ellipse Size").setValue([10, 10]);
                el.property("ADBE Vector Ellipse Position").setValue([0, 0]);
            }


            var st = inner.addProperty("ADBE Vector Graphic - Stroke");
            st.property("ADBE Vector Stroke Color").setValue(color);
            st.property("ADBE Vector Stroke Width").setValue(strokeW);

            var gTr = g.property("Transform");
            var posExpr =
                "var L = thisComp.layer('" + layer.name + "');\n" +
                "var r = L.sourceRectAtTime(time, false);\n" +
                "var a = L.anchorPoint;\n" +
                "[r.left + r.width/2 - a[0], r.top + r.height/2 - a[1]]";
            try { gTr.property("Position").expression = posExpr; } catch (e) { }

            var scl = gTr.property("Scale");
            var op = gTr.property("Opacity");

            // База для scale: matchSh — Size уже равен target, scale в процентах
            //                 ellipse — Size=[10,10], scale в % от 10
            // Формула: чтобы получить диаметр D, нужен scale = D/base * 100
            var baseSize = matchSh ? "Math.max(r.width, r.height)" : "10";

            if (looped) {
                var period = dur + delay * count;
                var offset = i * delay;
                var sExpr =
                    "var L = thisComp.layer('" + layer.name + "');\n" +
                    "var r = L.sourceRectAtTime(time, false);\n" +
                    "var base = " + baseSize + ";\n" +
                    "var edgeR = " + (fromCtr ? "Math.max(r.width, r.height)/2" : "0") + ";\n" +
                    "var startT = " + startT + ";\n" +
                    "var period = " + period + ";\n" +
                    "var offset = " + offset + ";\n" +
                    "var dur = " + dur + ";\n" +
                    "var maxR = " + maxRad + ";\n" +
                    "if (time < startT) { [0,0]; } else {\n" +
                    "  var t = ((time - startT - offset) % period);\n" +
                    "  if (t < 0) t += period;\n" +
                    "  if (t > dur) { [0,0]; } else {\n" +
                    "    var k = t/dur;\n" +
                    "    var r0 = edgeR + (maxR - edgeR) * k;\n" +
                    "    var s = (r0*2 / base) * 100;\n" +
                    "    [s, s];\n" +
                    "  }\n" +
                    "}";
                try { scl.expression = sExpr; } catch (e) { }
                var oExpr =
                    "var startT = " + startT + ";\n" +
                    "var period = " + period + ";\n" +
                    "var offset = " + offset + ";\n" +
                    "var dur = " + dur + ";\n" +
                    "if (time < startT) 0; else {\n" +
                    "  var t = ((time - startT - offset) % period);\n" +
                    "  if (t < 0) t += period;\n" +
                    "  if (t > dur) 0; else 100 * (1 - t/dur);\n" +
                    "}";
                try { op.expression = oExpr; } catch (e) { }
            }
            else {
                if (fromCtr || matchSh) {
                    var scaleExpr =
                        "var L = thisComp.layer('" + layer.name + "');\n" +
                        "var r = L.sourceRectAtTime(time, false);\n" +
                        "var base = " + baseSize + ";\n" +
                        "var edgeR = " + (fromCtr ? "Math.max(r.width, r.height)/2" : "0") + ";\n" +
                        "var t0 = " + t0 + ";\n" +
                        "var t1 = " + t1 + ";\n" +
                        "var maxR = " + maxRad + ";\n" +
                        "if (time < t0) { var s0 = (edgeR*2/base)*100; [s0, s0]; }\n" +
                        "else if (time > t1) { var s1 = (maxR*2/base)*100; [s1, s1]; }\n" +
                        "else {\n" +
                        "  var k = (time-t0)/(t1-t0);\n" +
                        "  k = 1 - Math.pow(1-k, 3);\n" +
                        "  var r0 = edgeR + (maxR - edgeR) * k;\n" +
                        "  var s = (r0*2/base)*100;\n" +
                        "  [s, s];\n" +
                        "}";
                    try { scl.expression = scaleExpr; } catch (e) { }
                } else {
                    scl.setValueAtTime(t0, [0, 0]);
                    scl.setValueAtTime(t1, [maxRad * 20, maxRad * 20]);
                    setEaseOut(scl);
                }
                op.setValueAtTime(Math.max(0, startT - 0.001), 0);
                op.setValueAtTime(t0, 100);
                op.setValueAtTime(t1, 0);
                setEaseOut(op);
            }
        }
    }



    // =====================================================
    // PRESET: Reverse Pulse
    // =====================================================
    function applyReversePulse(layer, comp, params) {
        var startT = params.startTime;
        var count = params.rp_count;
        var period = params.rp_period;
        var startS = params.rp_startScale;
        var strokeW = params.rp_stroke;
        var color = hexToRGB(params.rp_color);
        var fromCtr = params.gen_fromContour;
        var matchSh = params.gen_matchShape;
        var matchScl = params.gen_matchScale;

        var sl = comp.layers.addShape();
        sl.name = LAYER_PREFIX + "ReversePulse_" + layer.name;
        try { sl.property("Contents").property(1).remove(); } catch (e) { }
        sl.parent = layer;
        sl.property("Transform").property("Position").setValue([0, 0]);

        for (var i = 0; i < count; i++) {
            var offset = (period / count) * i;

            var root = sl.property("Contents");
            var g = root.addProperty("ADBE Vector Group");
            g.name = "Pulse_" + (i + 1);
            var inner = g.property("Contents");

            // === Определяем форму target ===
            var srcShapeType = null;
            var srcShapeProp = null;
            try {
                var testContents = layer.property("Contents");
                if (testContents && testContents.numProperties > 0) {
                    var firstGroup = testContents.property(1);
                    var innerC = firstGroup.property("Contents");
                    for (var pi = 1; pi <= innerC.numProperties; pi++) {
                        var pp = innerC.property(pi);
                        var mn = pp.matchName;
                        if (mn === "ADBE Vector Shape - Group") { srcShapeType = "path"; srcShapeProp = pp; break; }
                        else if (mn === "ADBE Vector Shape - Rect") { srcShapeType = "rect"; srcShapeProp = pp; break; }
                        else if (mn === "ADBE Vector Shape - Ellipse") { srcShapeType = "ellipse"; srcShapeProp = pp; break; }
                        else if (mn === "ADBE Vector Shape - Star") { srcShapeType = "star"; srcShapeProp = pp; break; }
                    }
                }
            } catch (e) { }

            if (matchSh && srcShapeType === "path") {
                var pathGroup = inner.addProperty("ADBE Vector Shape - Group");
                try {
                    pathGroup.property("ADBE Vector Shape").setValue(
                        srcShapeProp.property("ADBE Vector Shape").value
                    );
                } catch (e) { }
            }
            else if (matchSh && srcShapeType === "rect") {
                var rect = inner.addProperty("ADBE Vector Shape - Rect");
                rect.property("ADBE Vector Rect Position").setValue([0, 0]);
                if (matchScl) {
                    rect.property("ADBE Vector Rect Size").setValue([10, 10]);
                    var szExpr =
                        "var L = thisComp.layer('" + layer.name + "');\n" +
                        "var r = L.sourceRectAtTime(time, false);\n" +
                        "[r.width, r.height]";
                    try { rect.property("ADBE Vector Rect Size").expression = szExpr; } catch (e) { }
                    try {
                        rect.property("ADBE Vector Rect Roundness").setValue(
                            srcShapeProp.property("ADBE Vector Rect Roundness").value
                        );
                    } catch (e) { }
                } else {
                    try {
                        rect.property("ADBE Vector Rect Size").setValue(
                            srcShapeProp.property("ADBE Vector Rect Size").value
                        );
                        rect.property("ADBE Vector Rect Roundness").setValue(
                            srcShapeProp.property("ADBE Vector Rect Roundness").value
                        );
                    } catch (e) { }
                }
            }
            else if (matchSh && srcShapeType === "ellipse") {
                var elC = inner.addProperty("ADBE Vector Shape - Ellipse");
                elC.property("ADBE Vector Ellipse Position").setValue([0, 0]);
                if (matchScl) {
                    elC.property("ADBE Vector Ellipse Size").setValue([10, 10]);
                    var elSzExpr =
                        "var L = thisComp.layer('" + layer.name + "');\n" +
                        "var r = L.sourceRectAtTime(time, false);\n" +
                        "[r.width, r.height]";
                    try { elC.property("ADBE Vector Ellipse Size").expression = elSzExpr; } catch (e) { }
                } else {
                    try {
                        elC.property("ADBE Vector Ellipse Size").setValue(
                            srcShapeProp.property("ADBE Vector Ellipse Size").value
                        );
                    } catch (e) { }
                }
            }
            else if (matchSh && srcShapeType === "star") {
                var starC = inner.addProperty("ADBE Vector Shape - Star");
                try {
                    var srcStarProps = [
                        "ADBE Vector Star Type",
                        "ADBE Vector Star Points",
                        "ADBE Vector Star Rotation",
                        "ADBE Vector Star Inner Radiu",
                        "ADBE Vector Star Outer Radiu",
                        "ADBE Vector Star Inner Roundess",
                        "ADBE Vector Star Outer Roundess"
                    ];
                    for (var spi = 0; spi < srcStarProps.length; spi++) {
                        try {
                            starC.property(srcStarProps[spi]).setValue(
                                srcShapeProp.property(srcStarProps[spi]).value
                            );
                        } catch (e) { }
                    }
                    starC.property("ADBE Vector Star Position").setValue([0, 0]);
                    if (matchScl) {
                        var origOuter = srcShapeProp.property("ADBE Vector Star Outer Radiu").value;
                        var origInner = srcShapeProp.property("ADBE Vector Star Inner Radiu").value;
                        var starOuterExpr =
                            "var L = thisComp.layer('" + layer.name + "');\n" +
                            "var r = L.sourceRectAtTime(time, false);\n" +
                            "var origR = " + origOuter + ";\n" +
                            "var baseD = origR * 2;\n" +
                            "var curD = Math.max(r.width, r.height);\n" +
                            "origR * (curD / baseD)";
                        var starInnerExpr =
                            "var L = thisComp.layer('" + layer.name + "');\n" +
                            "var r = L.sourceRectAtTime(time, false);\n" +
                            "var origR = " + origInner + ";\n" +
                            "var baseD = " + origOuter + " * 2;\n" +
                            "var curD = Math.max(r.width, r.height);\n" +
                            "origR * (curD / baseD)";
                        try { starC.property("ADBE Vector Star Outer Radiu").expression = starOuterExpr; } catch (e) { }
                        try { starC.property("ADBE Vector Star Inner Radiu").expression = starInnerExpr; } catch (e) { }
                    }
                } catch (e) { }
            }
            else if (matchSh) {
                var rectBB = inner.addProperty("ADBE Vector Shape - Rect");
                rectBB.property("ADBE Vector Rect Size").setValue([10, 10]);
                rectBB.property("ADBE Vector Rect Position").setValue([0, 0]);
                var rectSzExpr =
                    "var L = thisComp.layer('" + layer.name + "');\n" +
                    "var r = L.sourceRectAtTime(time, false);\n" +
                    "[r.width, r.height]";
                try { rectBB.property("ADBE Vector Rect Size").expression = rectSzExpr; } catch (e) { }
                var rectRExpr =
                    "var L = thisComp.layer('" + layer.name + "');\n" +
                    "var r = L.sourceRectAtTime(time, false);\n" +
                    "Math.min(r.width, r.height) / 4";
                try { rectBB.property("ADBE Vector Rect Roundness").expression = rectRExpr; } catch (e) { }
            }
            else {
                var el = inner.addProperty("ADBE Vector Shape - Ellipse");
                el.property("ADBE Vector Ellipse Size").setValue([10, 10]);
                el.property("ADBE Vector Ellipse Position").setValue([0, 0]);
            }

            var st = inner.addProperty("ADBE Vector Graphic - Stroke");
            st.property("ADBE Vector Stroke Color").setValue(color);
            st.property("ADBE Vector Stroke Width").setValue(strokeW);

            var gTr = g.property("Transform");
            var posExpr =
                "var L = thisComp.layer('" + layer.name + "');\n" +
                "var r = L.sourceRectAtTime(time, false);\n" +
                "var a = L.anchorPoint;\n" +
                "[r.left + r.width/2 - a[0], r.top + r.height/2 - a[1]]";
            try { gTr.property("Position").expression = posExpr; } catch (e) { }

            var baseSize = matchSh ? "Math.max(r.width, r.height)" : "10";
            var sclExpr =
                "var L = thisComp.layer('" + layer.name + "');\n" +
                "var r = L.sourceRectAtTime(time, false);\n" +
                "var base = " + baseSize + ";\n" +
                "var edgeR = " + (fromCtr ? "Math.max(r.width, r.height)/2" : "50") + ";\n" +
                "var startT = " + startT + ";\n" +
                "var period = " + period + ";\n" +
                "var offset = " + offset + ";\n" +
                "var startS = " + startS + ";\n" +
                "if (time < startT) { var s0 = ((edgeR*startS/100)*2/base)*100; [s0,s0]; } else {\n" +
                "  var t = ((time - startT + offset) % period) / period;\n" +
                "  var baseR = edgeR;\n" +
                "  var startR = baseR * startS / 100;\n" +
                "  var r0 = startR + (baseR - startR) * t;\n" +
                "  var s = (r0*2/base)*100;\n" +
                "  [s, s];\n" +
                "}";
            try { gTr.property("Scale").expression = sclExpr; } catch (e) { }

            var opExpr =
                "var startT = " + startT + ";\n" +
                "var period = " + period + ";\n" +
                "var offset = " + offset + ";\n" +
                "if (time < startT) 0; else {\n" +
                "  var t = ((time - startT + offset) % period) / period;\n" +
                "  var o = t < 0.2 ? t/0.2 * 100 : (t > 0.8 ? (1-t)/0.2 * 100 : 100);\n" +
                "  o;\n" +
                "}";
            try { gTr.property("Opacity").expression = opExpr; } catch (e) { }
        }
    }




    // =====================================================
    // PRESET: Impact Burst (solid + blur)
    // =====================================================
    function applyImpactBurst(layer, comp, params) {
        var startT = params.startTime;
        var dur = params.ib_duration;
        var rays = params.ib_rays;
        var rayLen = params.ib_rayLength;
        var flashSz = params.ib_flashSize;
        var color = hexToRGB(params.ib_color);
        var looped = params.gen_looped;
        var fromCtr = params.gen_fromContour;

        var sl = comp.layers.addShape();
        sl.name = LAYER_PREFIX + "ImpactBurst_" + layer.name;
        try { sl.property("Contents").property(1).remove(); } catch (e) { }
        sl.parent = layer;

        // Позиция shape-слоя = центр bounding box target
        var slPosExpr =
            "var L = thisComp.layer('" + layer.name + "');\n" +
            "var r = L.sourceRectAtTime(time, false);\n" +
            "var a = L.anchorPoint;\n" +
            "[r.left + r.width/2 - a[0], r.top + r.height/2 - a[1]]";
        try { sl.property("Transform").property("Position").expression = slPosExpr; } catch (e) { }

        // Fast Blur на весь слой — рассеянное свечение
        try {
            var blur = sl.property("Effects").addProperty("ADBE Fast Blur");
            blur.property(1).setValue(8); // Blurriness
        } catch (e) { }

        var root = sl.property("Contents");

        // === Flash ===
        var flashG = root.addProperty("ADBE Vector Group");
        flashG.name = "Flash";
        var flashInner = flashG.property("Contents");
        var flashEl = flashInner.addProperty("ADBE Vector Shape - Ellipse");
        flashEl.property("ADBE Vector Ellipse Size").setValue([flashSz, flashSz]);
        flashEl.property("ADBE Vector Ellipse Position").setValue([0, 0]);
        var flashFill = flashInner.addProperty("ADBE Vector Graphic - Fill");
        flashFill.property("ADBE Vector Fill Color").setValue(color);

        var flashTr = flashG.property("Transform");
        var flashScl = flashTr.property("Scale");
        var flashOp = flashTr.property("Opacity");

        if (looped) {
            var expr =
                "var startT = " + startT + ";\n" +
                "var dur = " + dur + ";\n" +
                "var period = dur * 1.5;\n" +
                "var t = ((time - startT) % period);\n" +
                "if (t < 0) t += period;\n" +
                "if (t > dur) [0,0];\n" +
                "else {\n" +
                "  var k = t/dur;\n" +
                "  var s = k < 0.3 ? (k/0.3)*120 : 120 - (k-0.3)/0.7*80;\n" +
                "  [s, s];\n" +
                "}";
            try { flashScl.expression = expr; } catch (e) { }
            var oExpr =
                "var startT = " + startT + ";\n" +
                "var dur = " + dur + ";\n" +
                "var period = dur * 1.5;\n" +
                "var t = ((time - startT) % period);\n" +
                "if (t < 0) t += period;\n" +
                "if (t > dur) 0; else 100 * (1 - t/dur);";
            try { flashOp.expression = oExpr; } catch (e) { }
        } else {
            flashScl.setValueAtTime(startT, [0, 0]);
            flashScl.setValueAtTime(startT + dur * 0.3, [120, 120]);
            flashScl.setValueAtTime(startT + dur, [40, 40]);
            setEaseOut(flashScl);
            flashOp.setValueAtTime(Math.max(0, startT - 0.001), 0);
            flashOp.setValueAtTime(startT, 100);
            flashOp.setValueAtTime(startT + dur, 0);
            setEaseOut(flashOp);
        }

        // === Rays ===
        for (var i = 0; i < rays; i++) {
            var angle = (360 / rays) * i;

            var rayG = root.addProperty("ADBE Vector Group");
            rayG.name = "Ray_" + (i + 1);
            var rayInner = rayG.property("Contents");

            var rayRect = rayInner.addProperty("ADBE Vector Shape - Rect");
            rayRect.property("ADBE Vector Rect Size").setValue([3, rayLen]);
            // Position — если fromContour, смещаем начало наружу
            var rayOffY = fromCtr ? -rayLen / 2 - 30 : -rayLen / 2;
            rayRect.property("ADBE Vector Rect Position").setValue([0, rayOffY]);

            var rayFill = rayInner.addProperty("ADBE Vector Graphic - Fill");
            rayFill.property("ADBE Vector Fill Color").setValue(color);

            var rayTr = rayG.property("Transform");
            rayTr.property("Rotation").setValue(angle);

            var rayScl = rayTr.property("Scale");
            var rayOp = rayTr.property("Opacity");

            if (looped) {
                var rExpr =
                    "var startT = " + startT + ";\n" +
                    "var dur = " + dur + ";\n" +
                    "var period = dur * 1.5;\n" +
                    "var t = ((time - startT) % period);\n" +
                    "if (t < 0) t += period;\n" +
                    "if (t > dur) [100,0];\n" +
                    "else {\n" +
                    "  var k = t/dur;\n" +
                    "  var sy = k < 0.4 ? k/0.4*100 : (1-(k-0.4)/0.6)*100;\n" +
                    "  [100, sy];\n" +
                    "}";
                try { rayScl.expression = rExpr; } catch (e) { }
                var roExpr =
                    "var startT = " + startT + ";\n" +
                    "var dur = " + dur + ";\n" +
                    "var period = dur * 1.5;\n" +
                    "var t = ((time - startT) % period);\n" +
                    "if (t < 0) t += period;\n" +
                    "if (t > dur) 0; else 100 * (1 - t/dur);";
                try { rayOp.expression = roExpr; } catch (e) { }
            } else {
                rayScl.setValueAtTime(startT, [100, 0]);
                rayScl.setValueAtTime(startT + dur * 0.4, [100, 100]);
                rayScl.setValueAtTime(startT + dur, [100, 0]);
                setEaseOut(rayScl);
                rayOp.setValueAtTime(Math.max(0, startT - 0.001), 0);
                rayOp.setValueAtTime(startT, 100);
                rayOp.setValueAtTime(startT + dur, 0);
            }
        }
    }


    // =====================================================
    // PRESET: Orbiting Dots
    // =====================================================
    function applyOrbitingDots(layer, comp, params){
        var startT   = params.startTime;
        var count    = params.od_count;
        var period   = params.od_period;
        var dotSize  = params.od_dotSize;
        var color    = hexToRGB(params.od_color);
        var padding  = params.od_padding;
        var padInward = params.od_padInward;
        var reverse  = params.od_reverse;
        var elliptical = params.od_elliptical;
        var follow   = params.od_follow;
        var looped   = params.gen_looped;
        var fromCtr  = params.gen_fromContour;

        var extraPad = (padInward ? -padding : padding) + (fromCtr ? 10 : 0);
        var dirSign = reverse ? -1 : 1;

        // Уникальное имя (учёт index для мульти-применения)
        var oldName = LAYER_PREFIX + "OrbitDots_" + layer.index + "_" + layer.name;
        for (var k = comp.numLayers; k >= 1; k--) {
            try {
                if (comp.layer(k).name === oldName) comp.layer(k).remove();
            } catch(e){}
        }

        var sl = comp.layers.addShape();
        sl.name = oldName;
        try { sl.property("Contents").property(1).remove(); } catch(e){}
        sl.parent = layer;

        // Позиция shape-слоя = центр target (следует за движением через expression)
        var slPosExpr =
            "var L = thisComp.layer('" + layer.name + "');\n" +
            "var r = L.sourceRectAtTime(time, false);\n" +
            "var a = L.anchorPoint;\n" +
            "[r.left + r.width/2 - a[0], r.top + r.height/2 - a[1]]";
        try { sl.property("Transform").property("Position").expression = slPosExpr; } catch(e){}

        var root = sl.property("Contents");

        for (var i = 0; i < count; i++){
            var phase = i / count;

            var g = root.addProperty("ADBE Vector Group");
            g.name = "Dot_" + (i+1);
            var innerG = g.property("Contents");

            var dot = innerG.addProperty("ADBE Vector Shape - Ellipse");
            dot.property("ADBE Vector Ellipse Size").setValue([dotSize, dotSize]);
            dot.property("ADBE Vector Ellipse Position").setValue([0,0]);

            var fill = innerG.addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").setValue(color);

            var gTr = g.property("Transform");
            var posExpr;

            if (follow){
                // Follow shape: точки движутся по периметру bbox (прямоугольник со скруглением углов)
                // Периметр разбит на 4 стороны + 4 угла (четверть окружности радиуса cornerR)
                posExpr =
                    "var L = thisComp.layer('" + layer.name + "');\n" +
                    "var r = L.sourceRectAtTime(time, false);\n" +
                    "var pad = " + extraPad + ";\n" +
                    "var w = r.width + pad*2;\n" +
                    "var h = r.height + pad*2;\n" +
                    "var cornerR = Math.min(w, h) * 0.15;\n" +
                    "var startT = " + startT + ";\n" +
                    "var period = " + period + ";\n" +
                    "var phase = " + phase + ";\n" +
                    "var dir = " + dirSign + ";\n" +
                    "var t = ((time - startT) / period + phase) * dir;\n" +
                    "t = t - Math.floor(t);\n" +
                    "if (t < 0) t += 1;\n" +
                    "var sideW = w - cornerR*2;\n" +
                    "var sideH = h - cornerR*2;\n" +
                    "var arcLen = cornerR * Math.PI / 2;\n" +
                    "var total = sideW*2 + sideH*2 + arcLen*4;\n" +
                    "var d = t * total;\n" +
                    "var x, y;\n" +
                    "if (d < sideW){ x = -sideW/2 + d; y = -h/2; }\n" +
                    "else if (d < sideW + arcLen){\n" +
                    "  var a = (d - sideW)/arcLen * Math.PI/2 - Math.PI/2;\n" +
                    "  x = sideW/2 + cornerR*Math.cos(a);\n" +
                    "  y = -sideH/2 + cornerR*Math.sin(a);\n" +
                    "}\n" +
                    "else if (d < sideW + arcLen + sideH){\n" +
                    "  x = w/2; y = -sideH/2 + (d - sideW - arcLen);\n" +
                    "}\n" +
                    "else if (d < sideW + arcLen*2 + sideH){\n" +
                    "  var a = (d - sideW - arcLen - sideH)/arcLen * Math.PI/2;\n" +
                    "  x = sideW/2 + cornerR*Math.cos(a);\n" +
                    "  y = sideH/2 + cornerR*Math.sin(a);\n" +
                    "}\n" +
                    "else if (d < sideW*2 + arcLen*2 + sideH){\n" +
                    "  x = sideW/2 - (d - sideW - arcLen*2 - sideH); y = h/2;\n" +
                    "}\n" +
                    "else if (d < sideW*2 + arcLen*3 + sideH){\n" +
                    "  var a = (d - sideW*2 - arcLen*2 - sideH)/arcLen * Math.PI/2 + Math.PI/2;\n" +
                    "  x = -sideW/2 + cornerR*Math.cos(a);\n" +
                    "  y = sideH/2 + cornerR*Math.sin(a);\n" +
                    "}\n" +
                    "else if (d < sideW*2 + arcLen*3 + sideH*2){\n" +
                    "  x = -w/2; y = sideH/2 - (d - sideW*2 - arcLen*3 - sideH);\n" +
                    "}\n" +
                    "else {\n" +
                    "  var a = (d - sideW*2 - arcLen*3 - sideH*2)/arcLen * Math.PI/2 + Math.PI;\n" +
                    "  x = -sideW/2 + cornerR*Math.cos(a);\n" +
                    "  y = -sideH/2 + cornerR*Math.sin(a);\n" +
                    "}\n" +
                    "[x, y];";
            } else {
                // Circle / Ellipse: радиусы из bbox или max(w,h)/2 для круга
                posExpr =
                    "var L = thisComp.layer('" + layer.name + "');\n" +
                    "var r = L.sourceRectAtTime(time, false);\n" +
                    "var pad = " + extraPad + ";\n" +
                    "var ell = " + (elliptical ? "true" : "false") + ";\n" +
                    "var rx = ell ? (r.width/2 + pad) : (Math.max(r.width, r.height)/2 + pad);\n" +
                    "var ry = ell ? (r.height/2 + pad) : (Math.max(r.width, r.height)/2 + pad);\n" +
                    "var startT = " + startT + ";\n" +
                    "var period = " + period + ";\n" +
                    "var phase = " + phase + ";\n" +
                    "var dir = " + dirSign + ";\n" +
                    "var t = ((time - startT) / period + phase) * dir;\n" +
                    "var ang = t * 2 * Math.PI;\n" +
                    "[rx*Math.cos(ang), ry*Math.sin(ang)];";
            }
            try { gTr.property("Position").expression = posExpr; } catch(e){}

            // Opacity
            var op = gTr.property("Opacity");
            if (!looped){
                op.setValueAtTime(Math.max(0, startT-0.001), 0);
                op.setValueAtTime(startT+0.1, 100);
                op.setValueAtTime(startT+period-0.1, 100);
                op.setValueAtTime(startT+period, 0);
                setEaseOut(op);
            } else {
                op.setValueAtTime(Math.max(0, startT-0.001), 0);
                op.setValueAtTime(startT+0.2, 100);
                setEaseOut(op);
            }
        }
    }

// =====================================================
// PRESET: Rounded Rect Stroke Draw
// =====================================================
 function applyRoundedRectStroke(layer, comp, params){
        var startT   = params.startTime;
        var dur      = params.rr_duration;
        var strokeW  = params.rr_stroke;
        var round    = params.rr_roundness;
        var padding  = params.rr_padding;
        var color    = hexToRGB(params.rr_color);
        var autoR    = params.rr_auto;
        var corners  = params.rr_corners; // [TL, TR, BR, BL]
        var segLenPct = params.rr_segLen; // 10-100%
        var looped   = params.gen_looped;
        var fromCtr  = params.gen_fromContour;

        var snapRect;
        try { snapRect = layer.sourceRectAtTime(startT, false); }
        catch(e){ snapRect = { width: 100, height: 100, left: 0, top: 0 }; }

        var pad = padding + (fromCtr ? 10 : 0);
        var rectW = snapRect.width + pad*2;
        var rectH = snapRect.height + pad*2;

        // Auto → полный круг
        if (autoR){
            round = Math.min(rectW, rectH) / 2;
        }

        // Уникальное имя (мульти-применение)
        var oldName = LAYER_PREFIX + "RoundedStroke_" + layer.index + "_" + layer.name;
        for (var k = comp.numLayers; k >= 1; k--) {
            try {
                if (comp.layer(k).name === oldName) comp.layer(k).remove();
            } catch(e){}
        }

        var sl = comp.layers.addShape();
        sl.name = oldName;
        try { sl.property("Contents").property(1).remove(); } catch(e){}
        sl.parent = layer;

        // Позиция следует за target
        var slPosExpr =
            "var L = thisComp.layer('" + layer.name + "');\n" +
            "var r = L.sourceRectAtTime(time, false);\n" +
            "var a = L.anchorPoint;\n" +
            "[r.left + r.width/2 - a[0], r.top + r.height/2 - a[1]]";
        try { sl.property("Transform").property("Position").expression = slPosExpr; } catch(e){}

        var root = sl.property("Contents");

        // Углы path (Rect Roundness) в Trim Paths — Offset:
        // AE рисует rounded rect начиная с середины правой стороны, направление CW.
        // Offset в градусах смещает старт. Для 4 углов:
        // TR ≈ 0°, BR ≈ 90°, BL ≈ 180°, TL ≈ 270° (эмпирически, зависит от AE)
        // Проверено: 0° = середина правой стороны → нам нужны смещения к углам.
        var cornerOffsets = [
            { on: corners[0], off: -45  }, // TL
            { on: corners[1], off:  45  }, // TR
            { on: corners[2], off:  135 }, // BR
            { on: corners[3], off:  225 }  // BL
        ];

        // Считаем сколько углов выбрано
        var activeCount = 0;
        for (var c = 0; c < 4; c++) if (cornerOffsets[c].on) activeCount++;
        if (activeCount === 0){
            // Fallback: TL если ничего не выбрано
            cornerOffsets[0].on = true;
            activeCount = 1;
        }

       // Длина одного сегмента в процентах (с учётом slider'а Segment length %)
var segLen = (100 / activeCount) * (segLenPct / 100);

        var idx = 0;
        for (var ci = 0; ci < 4; ci++){
            if (!cornerOffsets[ci].on) continue;

            var g = root.addProperty("ADBE Vector Group");
            g.name = "Stroke_" + ["TL","TR","BR","BL"][ci];
            var inner = g.property("Contents");

            var rect = inner.addProperty("ADBE Vector Shape - Rect");
            rect.property("ADBE Vector Rect Size").setValue([rectW, rectH]);
            rect.property("ADBE Vector Rect Roundness").setValue(round);
            rect.property("ADBE Vector Rect Position").setValue([0, 0]);

            var st = inner.addProperty("ADBE Vector Graphic - Stroke");
            st.property("ADBE Vector Stroke Color").setValue(color);
            st.property("ADBE Vector Stroke Width").setValue(strokeW);

            var trim = inner.addProperty("ADBE Vector Filter - Trim");
            var trStart = trim.property("ADBE Vector Trim Start");
            var trEnd   = trim.property("ADBE Vector Trim End");
            var trOff   = trim.property("ADBE Vector Trim Offset");

            

                       // Trim Offset = базовый угол угла. Каждый сегмент стартует со своего угла независимо.
            trOff.setValue(cornerOffsets[ci].off);


            trStart.setValue(0);

            if (looped){
                var enExpr =
                    "var startT = " + startT + ";\n" +
                    "var period = " + dur + ";\n" +
                    "var segLen = " + segLen + ";\n" +
                    "if (time < startT) 0; else {\n" +
                    "  var t = ((time - startT) % period) / period;\n" +
                    "  t * segLen;\n" +
                    "}";
                try { trEnd.expression = enExpr; } catch(e){}
            } else {
                trEnd.setValueAtTime(Math.max(0, startT-0.001), 0);
                trEnd.setValueAtTime(startT+dur, segLen);
                setEaseOut(trEnd);
            }

            idx++;

        }
    }

// =====================================================
// PRESET: Light Sweep (blur-edged + alpha matte)
// =====================================================
function applyLightSweep(layer, comp, params){
var startT   = params.startTime;
var dur      = params.ls_duration;
var width    = params.ls_width;
var color    = hexToRGB(params.ls_color);
var looped   = params.gen_looped;

var sl = comp.layers.addShape();
sl.name = LAYER_PREFIX + "LightSweep_" + layer.name;
try { sl.property("Contents").property(1).remove(); } catch(e){}
sl.parent = layer;

// Fast Blur — рассеянные края блика
try {
   var blur = sl.property("Effects").addProperty("ADBE Fast Blur");
   blur.property(1).setValue(width * 0.4); // мягкие края пропорционально ширине
} catch(e){}

var root = sl.property("Contents");
var g = root.addProperty("ADBE Vector Group");
g.name = "Sweep";
var inner = g.property("Contents");

var rect = inner.addProperty("ADBE Vector Shape - Rect");
rect.property("ADBE Vector Rect Size").setValue([width, 3000]);
rect.property("ADBE Vector Rect Position").setValue([0, 0]);

var fill = inner.addProperty("ADBE Vector Graphic - Fill");
fill.property("ADBE Vector Fill Color").setValue(color);

var gTr = g.property("Transform");
gTr.property("Rotation").setValue(20);
gTr.property("Opacity").setValue(80);

// Позиция shape-слоя = центр bounding box target
var slPosExpr =
   "var L = thisComp.layer('" + layer.name + "');\n" +
   "var r = L.sourceRectAtTime(time, false);\n" +
   "var a = L.anchorPoint;\n" +
   "[r.left + r.width/2 - a[0], r.top + r.height/2 - a[1]]";
try { sl.property("Transform").property("Position").expression = slPosExpr; } catch(e){}

// Движение полосы X
var xExpr;
if (looped){
   xExpr =
       "var L = thisComp.layer('" + layer.name + "');\n" +
       "var r = L.sourceRectAtTime(time, false);\n" +
       "var w = r.width;\n" +
       "var startT = " + startT + ";\n" +
       "var dur = " + dur + ";\n" +
       "var period = dur * 2;\n" +
       "var t = ((time - startT) % period) / dur;\n" +
       "if (t < 0 || t > 1) [-9999, 0];\n" +
       "else {\n" +
       "  var x = -w/2 - 150 + (w + 300) * t;\n" +
       "  [x, 0];\n" +
       "}";
} else {
   xExpr =
       "var L = thisComp.layer('" + layer.name + "');\n" +
       "var r = L.sourceRectAtTime(time, false);\n" +
       "var w = r.width;\n" +
       "var startT = " + startT + ";\n" +
       "var dur = " + dur + ";\n" +
       "var t = (time - startT) / dur;\n" +
       "t = Math.max(0, Math.min(1, t));\n" +
       "var x = -w/2 - 150 + (w + 300) * t;\n" +
       "[x, 0];";
}
try { gTr.property("Position").expression = xExpr; } catch(e){}

// === Alpha Matte: дублируем target как матовый источник ===
try {
   var matte = layer.duplicate();
   matte.name = LAYER_PREFIX + "Matte_" + layer.name;
   matte.moveBefore(sl);
   // Отключаем эффекты у матовой копии (если были)
   try {
       var mEfx = matte.property("Effects");
       while (mEfx.numProperties > 0){
           mEfx.property(1).remove();
       }
   } catch(e){}
   // Устанавливаем track matte: sl → Alpha Matte по matte-слою
   // AE: sl.trackMatteType = TrackMatteType.ALPHA
   sl.trackMatteType = TrackMatteType.ALPHA;
} catch(e){}
}


// =====================================================
// PRESET 4: Cascade Reverse (right-to-left order)
// =====================================================
function applyCascadeReverse(layers, comp, params){
// применяет Slide-In к слоям в обратном порядке
var reversed = [];
for (var i=layers.length-1; i>=0; i--) reversed.push(layers[i]);
applySlideInCascade(reversed, comp, params);
}

// =====================================================
// PRESET 5: Digital Manifestation (flicker)
// =====================================================
function applyDigitalManifestation(layer, comp, params){
var startT = params.startTime;
var flickerDur = params.dm_flickerDuration;

var opa = layer.property("Transform").property("Opacity");
// Скрываем до startT
opa.setValueAtTime(Math.max(0, startT - 0.001), 0);
opa.setValueAtTime(startT, 100);
// Далее — expression с flicker
var expr =
   "var inT = " + startT + ";\n" +
   "var flickDur = " + flickerDur + ";\n" +
   "if (time < inT) 0\n" +
   "else if (time < inT + flickDur){\n" +
   "  seedRandom(Math.floor(time*30), true);\n" +
   "  var prog = (time - inT) / flickDur;\n" +
   "  (random() < prog) ? 100 : 0;\n" +
   "} else 100;";
try { opa.expression = expr; } catch(e){}
}

// =====================================================
// PRESET 6: RGB Split Manifestation
// =====================================================
function applyRGBSplit(layer, comp, params){
var startT = params.startTime;
var dur    = params.rgb_duration;
var maxOff = params.rgb_offset;

var pos = layer.property("Transform").property("Position").value;

// 3 копии: Red, Green, Blue channels
var channels = [
   { tint: [1, 0, 0, 1],   suffix: "R", offX:  maxOff },
   { tint: [0, 1, 0, 1],   suffix: "G", offX:  0 },
   { tint: [0, 0, 1, 1],   suffix: "B", offX: -maxOff }
];
for (var i=0; i<3; i++){
   var ch = channels[i];
   var dup = layer.duplicate();
   dup.moveBefore(layer);
   dup.name = LAYER_PREFIX + "RGB_" + ch.suffix + "_" + layer.name;
   try {
       var eff = dup.property("Effects").addProperty("ADBE Tint");
       eff.property(2).setValue(ch.tint);      // Map White To
       eff.property(1).setValue([0,0,0,1]);    // Map Black To
   } catch(e){}
   dup.blendingMode = BlendingMode.ADD;

   var dpos = dup.property("Transform").property("Position");
   dpos.setValueAtTime(startT,     [pos[0] + ch.offX, pos[1]]);
   dpos.setValueAtTime(startT+dur, pos);
   setEaseOut(dpos);

   var dop = dup.property("Transform").property("Opacity");
   dop.setValueAtTime(Math.max(0, startT-0.001), 0);
   dop.setValueAtTime(startT,      80);
   dop.setValueAtTime(startT+dur*0.7, 80);
   dop.setValueAtTime(startT+dur,  0);
   setEaseOut(dop);
}
}

// =====================================================
// PRESET 7: Slice Glitch (adjustment layer with fractal noise + displacement)
// =====================================================
   function applySliceGlitch(layer, comp, params){
var startT = params.startTime;
var dur    = params.slice_duration;
var maxDisp= params.slice_displacement;

// === Источник шума: solid + pre-compose ===
// Displacement Map читает содержимое источника, включая эффекты.
// enabled=false ломает рендер. Используем pre-comp с чёрным solid'ом +
// Fractal Noise. Сам pre-comp невидим, потому что размещён ПОД target-слоем
// и заслонён им, либо moved to end композиции.
 
var noiseSrc = comp.layers.addSolid([0.5,0.5,0.5],
   LAYER_PREFIX + "SliceNoise_" + layer.name,
   comp.width, comp.height, comp.pixelAspect);

// Fractal Noise на источнике
var fnFx = noiseSrc.property("Effects");
var fn = fnFx.addProperty("ADBE Fractal Noise");
try { fn.property(1).setValue(6); } catch(e){} // Fractal Type: Rocky
try {
   fn.property("Contrast").setValue(500);
   fn.property("Brightness").setValue(0);
   fn.property("Transform").property("Scale").setValue(400);
   fn.property("Transform").property("Scale Width").setValue(1000);
   fn.property("Transform").property("Scale Height").setValue(20);
} catch(e){}
try { fn.property("Evolution").expression = "time * 720;"; } catch(e){}

// Прячем noise-слой через opacity=0
// (Displacement Map читает pre-composed content ДО применения opacity к слою в comp)
// Но чтобы точно работало — делаем pre-compose
var noiseIndex = noiseSrc.index;
noiseSrc.selected = true;
// Deselect всех остальных
for (var i=1; i<=comp.numLayers; i++){
   if (comp.layer(i) !== noiseSrc) comp.layer(i).selected = false;
}
var precompName = LAYER_PREFIX + "SlicePC_" + layer.name;
var precomp = comp.layers.precompose([noiseIndex], precompName, true);
// precompose возвращает CompItem — новый pre-comp
// Находим слой pre-comp в composition
var pcLayer = null;
for (var j=1; j<=comp.numLayers; j++){
   if (comp.layer(j).name === precompName){ pcLayer = comp.layer(j); break; }
}
if (pcLayer){
   pcLayer.enabled = false; // теперь можно выключить — pre-comp рендерится независимо
   pcLayer.moveToEnd();
}

// === Displacement Map — на target-слое ===
var dm = layer.property("Effects").addProperty("ADBE Displacement Map");
try {
   if (pcLayer) dm.property(1).setValue(pcLayer.index);
   dm.property(2).setValue(1); // Use For Horizontal: Luminance
   dm.property(4).setValue(0); // Use For Vertical: Red
} catch(e){}

var hDisp = dm.property("Max Horizontal Displacement");
hDisp.setValueAtTime(Math.max(0, startT-0.001), 0);
hDisp.setValueAtTime(startT,     maxDisp);
hDisp.setValueAtTime(startT+dur, 0);
setEaseOut(hDisp);
try { dm.property("Max Vertical Displacement").setValue(0); } catch(e){}
}



// =====================================================
// PRESET 8: Fade-Up Delayed
// =====================================================
function applyFadeUp(layers, comp, params){
var startT = params.startTime;
var dur    = params.fu_duration;
var offY   = params.fu_offsetY;
var stagger= params.fu_stagger;
var delay  = params.fu_delay;

for (var i=0; i<layers.length; i++){
   var L = layers[i];
   var t0 = startT + delay + i*stagger;
   var t1 = t0 + dur;

   var pos = L.property("Transform").property("Position");
   var opa = L.property("Transform").property("Opacity");
   var finalPos = pos.value;

   pos.setValueAtTime(t0, [finalPos[0], finalPos[1] + offY]);
   pos.setValueAtTime(t1, finalPos);
   setEaseOut(pos);

   opa.setValueAtTime(Math.max(0, t0-0.001), 0);
   opa.setValueAtTime(t0, 0);
   opa.setValueAtTime(t1, 100);
   setEaseOut(opa);
}
}

// =====================================================
// IDLE PRESETS
// =====================================================

function applyGlowPulse(layer, params){
var base = params.gp_base;
var amp  = params.gp_amp;
var period = params.gp_period;

    var fx = layer.property("Effects");
    var glow = null;
    var tries = ["ADBE Glo2", "ADBE Glow", "Glow"];
    for (var t = 0; t < tries.length; t++){
        try { glow = fx.addProperty(tries[t]); if (glow) break; } catch(e){}
    }
    if (!glow) { alert("Glow effect not available."); return; }

    try { glow.property(1).setValue(15); } catch(e){}   // Glow Threshold or Radius
    try { glow.property(2).setValue(base); } catch(e){} // Intensity — приблизительно

    // Ищем свойство интенсивности по имени + fallback на property(3)
    var intProp = null;
    try { intProp = glow.property("Glow Intensity"); } catch(e){}
    if (!intProp) { try { intProp = glow.property(3); } catch(e){} }
    if (!intProp) return;

        var expr =
        "var base = " + base + ";\n" +
        "var amp  = " + amp + ";\n" +
        "var period = " + period + ";\n" +
        "base + Math.sin(time*Math.PI*2/period)*amp;";
    try { intProp.expression = expr; } catch(e){}
}

function applyMicroJitter(layer, params){
var freq = params.mj_freq;
var amp  = params.mj_amp;
var axis = params.mj_axis;

    var pos = layer.property("Transform").property("Position");
    var expr;
    if (axis === "X"){
        expr = "var w = wiggle(" + freq + "," + amp + ");\n[w[0], value[1]];";
    } else if (axis === "Y"){
        expr = "var w = wiggle(" + freq + "," + amp + ");\n[value[0], w[1]];";
    } else {
        expr = "wiggle(" + freq + "," + amp + ");";
    }
    try { pos.expression = expr; } catch (e) {}

}

function applyIdlePulse(layer, params){
var period = params.ip_period;
var amp    = params.ip_amp;

var scl = layer.property("Transform").property("Scale");
var expr =
   "var period = " + period + ";\n" +
   "var amp = " + amp + ";\n" +
   "var s = 100 + Math.sin(time*Math.PI*2/period)*amp;\n" +
   "[value[0]*s/100, value[1]*s/100];";
try { scl.expression = expr; } catch(e){}
}

function applyGentleFloat(layer, params){
var period = params.gf_period;
var amp    = params.gf_amp;

var pos = layer.property("Transform").property("Position");
var expr =
   "var period = " + period + ";\n" +
   "var amp = " + amp + ";\n" +
   "var y = Math.sin(time*Math.PI*2/period)*amp;\n" +
   "[value[0], value[1] + y];";
try { pos.expression = expr; } catch(e){}
}

// =====================================================
// PRESET: Concentric Arcs Reveal
// =====================================================
function applyConcentricArcs(layer, comp, params){
var startT   = params.startTime;
var count    = params.ca_count;       // число дуг (default 3)
var dur      = params.ca_duration;    // время одного цикла
var maxR     = params.ca_maxRadius;
var strokeW  = params.ca_stroke;
var color    = hexToRGB(params.ca_color);
var stagger  = params.ca_stagger;     // задержка между дугами
var segment  = params.ca_segment;     // true = дуга, false = полный круг
var segAng   = params.ca_segAngle;    // угол дуги в градусах
var reverse  = params.ca_reverse;     // NEW: обратное направление
var corners  = params.ca_corners || [true, false, false, false];
var segLenPct = params.ca_segLen || 100;


var looped   = params.gen_looped;
var fromCtr  = params.gen_fromContour;
var matchSh  = params.gen_matchShape;
// Привязываем ConcentricArcs к конкретному target по его index (уникально)
var oldName = LAYER_PREFIX + "ConcentricArcs_" + layer.index + "_" + layer.name;
for (var k = comp.numLayers; k >= 1; k--) {
    try {
        if (comp.layer(k).name === oldName) {
            comp.layer(k).remove();
        }
    } catch (e) {}
}

var sl = comp.layers.addShape();
sl.name = oldName;
try { sl.property("Contents").property(1).remove(); } catch(e){}
sl.parent = layer;

var slPosExpr =
"var L = thisComp.layer('" + layer.name + "');\n" +
"var r = L.sourceRectAtTime(time, false);\n" +
"var a = L.anchorPoint;\n" +
"[r.left + r.width/2 - a[0], r.top + r.height/2 - a[1]]";
try { sl.property("Transform").property("Position").expression = slPosExpr; } catch(e){}

var root = sl.property("Contents");
var dir = reverse ? -1 : 1;

        // Базовые углы стартов (в градусах, где 0° = 3 часа/TR)
        // AE Trim Offset для эллипса: 0 = 3ч, 90 = 6ч, 180 = 9ч, 270 = 12ч
        var cornerAngles = [
            { on: corners[0], off: 270 }, // TL = 12 часов
            { on: corners[1], off: 0   }, // TR = 3 часа
            { on: corners[2], off: 90  }, // BR = 6 часов
            { on: corners[3], off: 180 }  // BL = 9 часов
        ];
        var activeCount = 0;
        for (var c = 0; c < 4; c++) if (cornerAngles[c].on) activeCount++;
        if (activeCount === 0){
            cornerAngles[0].on = true;
            activeCount = 1;
        }

        for (var i=0; i<count; i++){
            var arcDelay = i * stagger;
            var radius = maxR * ((i+1) / count);

            for (var ci = 0; ci < 4; ci++){
                if (!cornerAngles[ci].on) continue;

                var g = root.addProperty("ADBE Vector Group");
                g.name = "Arc_" + (i+1) + "_" + ["TL","TR","BR","BL"][ci];
                var inner = g.property("Contents");

                var el = inner.addProperty("ADBE Vector Shape - Ellipse");
                el.property("ADBE Vector Ellipse Size").setValue([radius*2, radius*2]);
                el.property("ADBE Vector Ellipse Position").setValue([0, 0]);

                var st = inner.addProperty("ADBE Vector Graphic - Stroke");
                st.property("ADBE Vector Stroke Color").setValue(color);
                st.property("ADBE Vector Stroke Width").setValue(strokeW);

                var trim = inner.addProperty("ADBE Vector Filter - Trim");
                var startProp = trim.property("ADBE Vector Trim Start");
var endProp   = trim.property("ADBE Vector Trim End");
var offProp   = trim.property("ADBE Vector Trim Offset");


                var baseAngle = cornerAngles[ci].off;

                if (segment){
                    var segPct = (segAng / 360) * 100;
                    startProp.setValue(0);
                    endProp.setValue(segPct);

                    if (looped){
                        var offExpr =
                            "var startT = " + startT + ";\n" +
                            "var dur = " + dur + ";\n" +
                            "var delay = " + arcDelay + ";\n" +
                            "var dir = " + dir + ";\n" +
                            "var baseA = " + baseAngle + ";\n" +
                            "var t = ((time - startT - delay) % dur);\n" +
                            "if (t < 0) t += dur;\n" +
                            "baseA + dir * (t/dur) * 360;";
                        try { offProp.expression = offExpr; } catch(e){}
                    } else {
                        var t0 = startT + arcDelay;
                        offProp.setValueAtTime(t0,     baseAngle);
                        offProp.setValueAtTime(t0+dur, baseAngle + dir * 360);
                        setEaseOut(offProp);
                    }
                } else {
                    var segLen = (100 / activeCount) * (segLenPct / 100);
                    offProp.setValue(baseAngle);

                    if (looped){
                        var eExpr =
                            "var startT = " + startT + ";\n" +
                            "var dur = " + dur + ";\n" +
                            "var delay = " + arcDelay + ";\n" +
                            "var segLen = " + segLen + ";\n" +
                            "var t = ((time - startT - delay) % dur);\n" +
                            "if (t < 0) t += dur;\n" +
                            "(t/dur) * segLen;";
                        try { endProp.expression = eExpr; } catch(e){}
                        startProp.setValue(0);
                    } else {
                        var t0b = startT + arcDelay;
                        startProp.setValue(0);
                        endProp.setValueAtTime(t0b,     0);
                        endProp.setValueAtTime(t0b+dur, segLen);
                        setEaseOut(endProp);
                    }

                    if (reverse){
                        var rotProp = g.property("Transform").property("Rotation");
                        if (looped){
                            var rExpr =
                                "var startT = " + startT + ";\n" +
                                "var dur = " + dur + ";\n" +
                                "var delay = " + arcDelay + ";\n" +
                                "var t = ((time - startT - delay) % dur);\n" +
                                "if (t < 0) t += dur;\n" +
                                "-(t/dur) * 360;";
                            try { rotProp.expression = rExpr; } catch(e){}
                        } else {
                            var t0r = startT + arcDelay;
                            rotProp.setValueAtTime(t0r,     0);
                            rotProp.setValueAtTime(t0r+dur, -360);
                            setEaseOut(rotProp);
                        }
                    }
                }
            }
        }
    }



    // =====================================================
    // PRESET: Focus Frame
    // =====================================================
    function applyFocusFrame(layer, comp, params){
        var startT      = params.startTime;
        var dur         = params.ff_duration;
        var cornerLenP  = params.ff_cornerLen; // %
        var padding     = params.ff_padding;
        var padInward   = params.ff_padInward;
        var strokeW     = params.ff_stroke;
        var jitterRate  = params.ff_jitterRate;
        var flashPeriod = params.ff_flashPeriod;
        var colFrame    = hexToRGB(params.ff_colFrame);
        var colCorner   = hexToRGB(params.ff_colCorner);
        var introFlash  = params.ff_introFlash;
        var repeatFlash = params.ff_repeatFlash;
        var sJitter     = params.ff_jitter;
        var sFade       = params.ff_fade;
        var sTeleport   = params.ff_teleport;
        var sGhost      = params.ff_ghost;
        var sScale      = params.ff_scale;
        var sShrink     = params.ff_shrink;
        var looped      = params.gen_looped;
        var fromCtr     = params.gen_fromContour;

        var pad = (padInward ? -padding : padding) + (fromCtr && !padInward ? 10 : 0);

        // Уникальное имя (мульти-применение)
        var oldName = LAYER_PREFIX + "FocusFrame_" + layer.index + "_" + layer.name;
        for (var k = comp.numLayers; k >= 1; k--) {
            try {
                if (comp.layer(k).name === oldName) comp.layer(k).remove();
            } catch(e){}
        }

        var sl = comp.layers.addShape();
        sl.name = oldName;
        try { sl.property("Contents").property(1).remove(); } catch(e){}
        sl.parent = layer;

        // Позиция следует за target
        var slPosExpr =
            "var L = thisComp.layer('" + layer.name + "');\n" +
            "var r = L.sourceRectAtTime(time, false);\n" +
            "var a = L.anchorPoint;\n" +
            "[r.left + r.width/2 - a[0], r.top + r.height/2 - a[1]]";
        try { sl.property("Transform").property("Position").expression = slPosExpr; } catch(e){}

        var root = sl.property("Contents");

        // ========== INTRO/REPEAT FLASH (обводка вокруг фигуры) ==========
        if (introFlash){
            var gFlash = root.addProperty("ADBE Vector Group");
            gFlash.name = "IntroFlash";
            var flashIn = gFlash.property("Contents");

            var flashRect = flashIn.addProperty("ADBE Vector Shape - Rect");
            var flashSizeExpr =
                "var L = thisComp.layer('" + layer.name + "');\n" +
                "var r = L.sourceRectAtTime(time, false);\n" +
                "var pad = " + pad + ";\n" +
                "[r.width + pad*2, r.height + pad*2];";
            try { flashRect.property("ADBE Vector Rect Size").expression = flashSizeExpr; } catch(e){}
            flashRect.property("ADBE Vector Rect Position").setValue([0,0]);
            flashRect.property("ADBE Vector Rect Roundness").setValue(0);

            var flashStroke = flashIn.addProperty("ADBE Vector Graphic - Stroke");
            flashStroke.property("ADBE Vector Stroke Color").setValue(colFrame);
            flashStroke.property("ADBE Vector Stroke Width").setValue(strokeW);

            var flashOpa = gFlash.property("Transform").property("Opacity");
            if (repeatFlash || looped){
                // Repeat: мигает с периодом flashPeriod (2 мигания в начале, потом пауза)
                var flExpr =
                    "var startT = " + startT + ";\n" +
                    "var period = " + flashPeriod + ";\n" +
                    "if (time < startT) 0; else {\n" +
                    "  var t = ((time - startT) % period) / period;\n" +
                    "  if (t < 0.1) 50 * (t/0.1);\n" +
                    "  else if (t < 0.2) 50 * (1 - (t-0.1)/0.1);\n" +
                    "  else if (t < 0.3) 50 * ((t-0.2)/0.1);\n" +
                    "  else if (t < 0.4) 50 * (1 - (t-0.3)/0.1);\n" +
                    "  else 0;\n" +
                    "}";
                try { flashOpa.expression = flExpr; } catch(e){}
            } else {
                // Intro only: 3 мигания в первую половину duration
                flashOpa.setValueAtTime(Math.max(0, startT-0.001), 0);
                flashOpa.setValueAtTime(startT + dur*0.05, 50);
                flashOpa.setValueAtTime(startT + dur*0.10, 0);
                flashOpa.setValueAtTime(startT + dur*0.15, 50);
                flashOpa.setValueAtTime(startT + dur*0.20, 0);
                flashOpa.setValueAtTime(startT + dur*0.25, 50);
                flashOpa.setValueAtTime(startT + dur*0.30, 0);
            }
        }

        // ========== 4 УГЛОВЫХ L-МАРКЕРА ==========
        // Углы: TL, TR, BR, BL с координатами (относительно центра bbox)
        var cornerCfg = [
            { name:"TL", sx:-1, sy:-1 }, // top-left
            { name:"TR", sx: 1, sy:-1 },
            { name:"BR", sx: 1, sy: 1 },
            { name:"BL", sx:-1, sy: 1 }
        ];

        // Ghost duplicate: рисуем дополнительный набор углов рядом
        var passes = sGhost ? 2 : 1;

        for (var p = 0; p < passes; p++){
            for (var c = 0; c < 4; c++){
                var cfg = cornerCfg[c];
                var g = root.addProperty("ADBE Vector Group");
                g.name = "Corner_" + cfg.name + (p===1 ? "_ghost" : "");
                var inner = g.property("Contents");

                // Path угла: два отрезка (горизонтальный и вертикальный) от точки угла внутрь
                // Позиция и длина — через expression чтобы следовать за размером target
                var pathProp = inner.addProperty("ADBE Vector Shape - Group");
                var pathExpr =
                    "var L = thisComp.layer('" + layer.name + "');\n" +
                    "var r = L.sourceRectAtTime(time, false);\n" +
                    "var pad = " + pad + ";\n" +
                    "var w = r.width + pad*2;\n" +
                    "var h = r.height + pad*2;\n" +
                    "var lenP = " + cornerLenP + " / 100;\n" +
                    "var lx = w * lenP;\n" +
                    "var ly = h * lenP;\n";
                if (sShrink){
                    // Length shrink: стартовая длина = полная сторона, уменьшается до lenP
                    pathExpr +=
                        "var startT = " + startT + ";\n" +
                        "var dur = " + dur + ";\n" +
                        "var t = Math.min(1, Math.max(0, (time - startT) / dur));\n" +
                        "lx = w*0.5 - (w*0.5 - lx) * t;\n" +
                        "ly = h*0.5 - (h*0.5 - ly) * t;\n";
                }
                pathExpr +=
                    "var sx = " + cfg.sx + ";\n" +
                    "var sy = " + cfg.sy + ";\n" +
                    "var cx = sx * w/2;\n" +
                    "var cy = sy * h/2;\n" +
                    "createPath(\n" +
                    "  [[cx - sx*lx, cy], [cx, cy], [cx, cy - sy*ly]],\n" +
                    "  [], [], false);";
                try { pathProp.property("ADBE Vector Shape").expression = pathExpr; } catch(e){}

                var st = inner.addProperty("ADBE Vector Graphic - Stroke");
                st.property("ADBE Vector Stroke Color").setValue(colCorner);
                st.property("ADBE Vector Stroke Width").setValue(strokeW);

                var gTr = g.property("Transform");

                // ===== POSITION (Jitter / Teleport) =====
                if (sJitter){
                    var jExpr =
                        "var startT = " + startT + ";\n" +
                        "var rate = " + jitterRate + ";\n" +
                        "if (time < startT) [0,0]; else {\n" +
                        "  seedRandom(Math.floor((time-startT)/rate) + " + (c*100 + p*10) + ", true);\n" +
                        "  [(random()-0.5)*6, (random()-0.5)*6];\n" +
                        "}";
                    try { gTr.property("Position").expression = jExpr; } catch(e){}
                } else if (sTeleport){
                    var tExpr =
                        "var startT = " + startT + ";\n" +
                        "var rate = " + jitterRate + ";\n" +
                        "if (time < startT) [0,0]; else {\n" +
                        "  seedRandom(Math.floor((time-startT)/rate) + " + (c*100 + p*10) + ", true);\n" +
                        "  var r1 = Math.round((random()-0.5)*4);\n" +
                        "  var r2 = Math.round((random()-0.5)*4);\n" +
                        "  [r1*2, r2*2];\n" +
                        "}";
                    try { gTr.property("Position").expression = tExpr; } catch(e){}
                }

                // ===== SCALE (Scale collapse) =====
                if (sScale){
                    var scExpr =
                        "var startT = " + startT + ";\n" +
                        "var period = " + (looped ? flashPeriod : dur) + ";\n" +
                        "if (time < startT) [100,100]; else {\n" +
                        "  var t = ((time - startT) % period) / period;\n" +
                        "  var s = 100 - t*30;\n" +
                        "  [s, s];\n" +
                        "}";
                    try { gTr.property("Scale").expression = scExpr; } catch(e){}
                }

                // ===== OPACITY (Fade / Scale collapse / Ghost) =====
                var opa = gTr.property("Opacity");
                var opaExpr = "";

                if (sFade){
                    // Fade: пульсация через flashPeriod (свет проходит, углы гаснут и снова появляются)
                    opaExpr =
                        "var startT = " + startT + ";\n" +
                        "var period = " + flashPeriod + ";\n" +
                        "if (time < startT) 0; else {\n" +
                        "  var t = ((time - startT) % period) / period;\n" +
                        "  if (t < 0.3) 100 * (t/0.3);\n" +
                        "  else if (t < 0.7) 100;\n" +
                        "  else 100 * (1 - (t-0.7)/0.3);\n" +
                        "}";
                } else if (sScale){
                    // Scale режим — прозрачность падает синхронно
                    opaExpr =
                        "var startT = " + startT + ";\n" +
                        "var period = " + (looped ? flashPeriod : dur) + ";\n" +
                        "if (time < startT) 0; else {\n" +
                        "  var t = ((time - startT) % period) / period;\n" +
                        "  100 * (1 - t);\n" +
                        "}";
                } else if (p === 1){
                    // Ghost duplicate: вторая копия появляется когда первая исчезает
                    opaExpr =
                        "var startT = " + startT + ";\n" +
                        "var period = " + flashPeriod + ";\n" +
                        "if (time < startT) 0; else {\n" +
                        "  var t = ((time - startT) % period) / period;\n" +
                        "  100 * t;\n" +
                        "}";
                } else if (sGhost && p === 0){
                    // Ghost duplicate: первая копия исчезает пока вторая появляется
                    opaExpr =
                        "var startT = " + startT + ";\n" +
                        "var period = " + flashPeriod + ";\n" +
                        "if (time < startT) 0; else {\n" +
                        "  var t = ((time - startT) % period) / period;\n" +
                        "  100 * (1 - t);\n" +
                        "}";
                } else {
                    // Простое появление
                    opa.setValueAtTime(Math.max(0, startT-0.001), 0);
                    opa.setValueAtTime(startT + 0.1, 100);
                    if (!looped){
                        opa.setValueAtTime(startT + dur, 100);
                    }
                    setEaseOut(opa);
                }

                if (opaExpr !== ""){
                    try { opa.expression = opaExpr; } catch(e){}
                }

                // Ghost pass — сдвиг позиции на несколько px чтобы копия была рядом
                if (p === 1 && !sJitter && !sTeleport){
                    var gExpr = "[" + (cfg.sx * 4) + ", " + (cfg.sy * 4) + "]";
                    try { gTr.property("Position").expression = gExpr; } catch(e){}
                }
            }
        }
    }
        function applyAuraCircle(layer, comp, params){
        var startT   = params.startTime;
        var type     = params.au_type;              // 0 radial, 1 linear
        var invert   = params.au_invert;
        var innerC   = hexToRGB(params.au_innerColor);
        var outerC   = hexToRGB(params.au_outerColor);
        var innerOp  = params.au_innerOp;           // 0..100
        var outerOp  = params.au_outerOp;
        var radius   = params.au_radius;
        var padding  = params.au_padding;
        var padIn    = params.au_padInward;
        var strokeSt = params.au_strokeStyle;
        var strokeW  = params.au_stroke;
        var strokeC  = hexToRGB(params.au_strokeColor);
        var pulseStroke = params.au_pulseStroke;
        var pulseGrad   = params.au_pulseGrad;
        var dashLen  = params.au_dashLen;
        var dashGap  = params.au_dashGap;
        var anim     = params.au_anim;              // 0 none,1 sweep,2 breathing,3 shimmer,4 hue,5 rotate
        var speed    = params.au_speed;
        var looped   = params.gen_looped;
        var fromCtr  = params.gen_fromContour;

        var extraPad = (padIn ? -padding : padding) + (fromCtr ? 10 : 0);
        var effR = Math.max(4, radius + extraPad);
        var size = effR * 2;

        // Unique name — multi-apply safe
        var baseName = LAYER_PREFIX + "AuraCircle_" + layer.index + "_" + layer.name;
        // Remove previous instances (same target)
        for (var k = comp.numLayers; k >= 1; k--) {
            try {
                var nm = comp.layer(k).name;
                if (nm === baseName || nm === baseName + "_stroke") comp.layer(k).remove();
            } catch(e) {}
        }

        // Position expression — attaches aura to target center
        var posExpr =
            "var L = thisComp.layer('" + layer.name + "');\n" +
            "var r = L.sourceRectAtTime(time, false);\n" +
            "var a = L.anchorPoint;\n" +
            "var s = L.scale;\n" +
            "[r.left + r.width/2 - a[0], r.top + r.height/2 - a[1]]";

        // ---------- Gradient layer: solid + Ramp + circular mask ----------
        var solidColor = [0,0,0]; // will be overwritten by Ramp
        var gradLayer = comp.layers.addSolid(solidColor, baseName, size, size, comp.pixelAspect, comp.duration);
        gradLayer.parent = layer;
        try { gradLayer.property("Transform").property("Position").expression = posExpr; } catch(e){}
        try { gradLayer.property("Transform").property("Anchor Point").setValue([size/2, size/2]); } catch(e){}
        try { gradLayer.moveAfter(layer); } catch(e){}

        // Circular mask to cut solid into a circle
        try {
            var mask = gradLayer.property("Masks").addProperty("Mask");
            mask.name = "AuraMask";
            var mShape = new Shape();
            // Ellipse via 4 bezier vertices
            var cx = size/2, cy = size/2, r = effR;
            var k = 0.5522847498 * r;
            mShape.vertices = [
                [cx,   cy-r],
                [cx+r, cy  ],
                [cx,   cy+r],
                [cx-r, cy  ]
            ];
            mShape.inTangents = [
                [-k, 0], [0, -k], [ k, 0], [0,  k]
            ];
            mShape.outTangents = [
                [ k, 0], [0,  k], [-k, 0], [0, -k]
            ];
            mShape.closed = true;
            mask.property("Mask Path").setValue(mShape);
            mask.property("Mask Feather").setValue([0,0]);
        } catch(e){}

        // Add Ramp effect
        var ramp = gradLayer.property("Effects").addProperty("ADBE Ramp");
        // Ramp Type: 1 = Linear, 2 = Radial
        try { ramp.property("Ramp Shape").setValue(type === 0 ? 2 : 1); } catch(e){}
        // Start = center, End = edge (right side)
        try { ramp.property("Start of Ramp").setValue([size/2, size/2]); } catch(e){}
        try { ramp.property("End of Ramp").setValue([size, size/2]); } catch(e){}

        // Colors: invert flag decides which color is at center
        // For "Invert = true" → center = inner color (bright), edge = outer color (usually transparent-ish via opacity)
        // For "Invert = false" → swap
        if (invert){
            try { ramp.property("Start Color").setValue(innerC); } catch(e){}
            try { ramp.property("End Color").setValue(outerC); } catch(e){}
        } else {
            try { ramp.property("Start Color").setValue(outerC); } catch(e){}
            try { ramp.property("End Color").setValue(innerC); } catch(e){}
        }

        // Opacity on group: use layer opacity blended with average of two opacities
        // For per-stop opacity, we use two Ramps stacked with track matte — too complex.
        // Practical solution: apply CC Composite or just set layer opacity = average, and use alpha via mask feather.
        // Simplest: layer opacity = max(innerOp, outerOp); the "transparent edge" effect achieved via mask feather when inner>outer.
        try {
            var layerOp = gradLayer.property("Transform").property("Opacity");
            var avgOp = (innerOp + outerOp) / 2;
            layerOp.setValue(avgOp);
        } catch(e){}

        // Feather the mask if outer opacity is much lower than inner (creates soft fade to edge)
        if (invert && outerOp < innerOp - 20){
            try {
                var fAmount = Math.min(effR * 0.6, 60);
                gradLayer.property("Masks").property(1).property("Mask Feather").setValue([fAmount, fAmount]);
            } catch(e){}
        } else if (!invert && innerOp < outerOp - 20){
            try {
                var fAmount2 = Math.min(effR * 0.6, 60);
                gradLayer.property("Masks").property(1).property("Mask Feather").setValue([fAmount2, fAmount2]);
            } catch(e){}
        }

        // ---------- Animation (on Ramp End of Ramp / layer opacity) ----------
                if (anim !== 0){
            try {
                // Ramp порядок свойств (matchName для не-англ. локалей):
                // 1 Start of Ramp  |  2 Start Color
                // 3 End of Ramp    |  4 End Color
                // 5 Ramp Shape     |  6 Ramp Scatter  |  7 Blend With Original
                var startRampProp = ramp.property(1);
                var startColorProp = ramp.property(2);
                var endRampProp   = ramp.property(3);
                var endColorProp  = ramp.property(4);

                var layerOpProp = gradLayer.property("Transform").property("Opacity");
                var scaleProp   = gradLayer.property("Transform").property("Scale");

                if (anim === 1){ // Sweep — rotate End around center
                    var sweepExpr =
                        "var startT=" + startT + ";\n" +
                        "var period=" + speed + ";\n" +
                        "var r=" + effR + ";\n" +
                        "var cx=" + (size/2) + ";\n" +
                        "var cy=" + (size/2) + ";\n" +
                        "var a=((time-startT)/period)*Math.PI*2;\n" +
                        "[cx + Math.cos(a)*r, cy + Math.sin(a)*r];";
                    endRampProp.expression = sweepExpr;
                } else if (anim === 2){ // Breathing — pulse layer scale
                    var breathExpr =
                        "var startT=" + startT + ";\n" +
                        "var period=" + speed + ";\n" +
                        "var t=time-startT;\n" +
                        "var k=100 + Math.sin(t/period*Math.PI*2)*8;\n" +
                        "[k, k];";
                    scaleProp.expression = breathExpr;
                } else if (anim === 3){ // Shimmer — Math.sin opacity
                    var shimExpr =
                        "var base=" + ((innerOp+outerOp)/2) + ";\n" +
                        "var f=" + (1/speed).toFixed(3) + ";\n" +
                        "Math.max(0, Math.min(100, base + (Math.sin(time*Math.PI*2*f)*10)));";
                    layerOpProp.expression = shimExpr;
                } else if (anim === 4){ // Hue shift — cycle Start Color hue
                    var hueExpr =
                        "var startT=" + startT + ";\n" +
                        "var period=" + speed + ";\n" +
                        "var t=(time-startT)/period;\n" +
                        "var a=t*Math.PI*2;\n" +
                        "var r=0.5+0.5*Math.sin(a);\n" +
                        "var g=0.5+0.5*Math.sin(a+2.094);\n" +
                        "var b=0.5+0.5*Math.sin(a+4.189);\n" +
                        "[r,g,b,1];";
                    try { startColorProp.expression = hueExpr; } catch(e){}
                } else if (anim === 5){ // Rotate gradient — rotate whole layer
                    var rotProp = gradLayer.property("Transform").property("Rotation");
                    var rotExpr =
                        "var startT=" + startT + ";\n" +
                        "var period=" + speed + ";\n" +
                        "((time-startT)/period)*360;";
                    rotProp.expression = rotExpr;
                }
            } catch(e){}
        }


        // Pulse gradient (independent of anim) — pulses layer scale
        if (pulseGrad){
            try {
                var scP = gradLayer.property("Transform").property("Scale");
                var pgExpr =
                    "var startT=" + startT + ";\n" +
                    "var period=" + speed + ";\n" +
                    "var t=time-startT;\n" +
                    "var k=100 + Math.sin(t/period*Math.PI*2)*12;\n" +
                    "[k, k];";
                // If Breathing (anim===2) already set scale expression, pulseGrad enhances it — overwrite with stronger version
                scP.expression = pgExpr;
            } catch(e){}
        }

        // ---------- Stroke layer (separate shape layer on top) ----------
        if (strokeSt !== 0){
            var strokeLayer = comp.layers.addShape();
            strokeLayer.name = baseName + "_stroke";
            try { strokeLayer.property("Contents").property(1).remove(); } catch(e){}
            strokeLayer.parent = layer;
            try { strokeLayer.property("Transform").property("Position").expression = posExpr; } catch(e){}
            try { strokeLayer.moveAfter(gradLayer); } catch(e){}

            var root = strokeLayer.property("Contents");
            var gStroke = root.addProperty("ADBE Vector Group");
            gStroke.name = "AuraStroke";
            var strokeContents = gStroke.property("Contents");
            var elS = strokeContents.addProperty("ADBE Vector Shape - Ellipse");
            elS.property("ADBE Vector Ellipse Size").setValue([effR*2, effR*2]);
            elS.property("ADBE Vector Ellipse Position").setValue([0, 0]);
            var st = strokeContents.addProperty("ADBE Vector Graphic - Stroke");
            st.property("ADBE Vector Stroke Color").setValue(strokeC);
            var strokeWProp = st.property("ADBE Vector Stroke Width");
            strokeWProp.setValue(strokeW);
            try { st.property("ADBE Vector Stroke Line Cap").setValue(2); } catch(e){}

            // Dash config
            if (strokeSt >= 2){
                try {
                    var dashes = st.property("ADBE Vector Stroke Dashes");
                    var dProp = dashes.addProperty("ADBE Vector Stroke Dash 1");
                    var gProp = dashes.addProperty("ADBE Vector Stroke Gap 1");
                    if (strokeSt === 3){ // dotted
                        dProp.setValue(0.1);
                        gProp.setValue(dashGap);
                    } else {
                        dProp.setValue(dashLen);
                        gProp.setValue(dashGap);
                    }
                    if (strokeSt === 4){ // march
                        var offProp = dashes.addProperty("ADBE Vector Stroke Offset");
                        var mExpr =
                            "var startT=" + startT + ";\n" +
                            "var period=" + speed + ";\n" +
                            "var step=" + (dashLen + dashGap) + ";\n" +
                            "((time-startT)/period)*step;";
                        try { offProp.expression = mExpr; } catch(e){}
                    }
                } catch(e){}
            }

            // Pulse stroke width
            if (pulseStroke){
                var pulseExpr =
                    "var startT=" + startT + ";\n" +
                    "var base=" + strokeW + ";\n" +
                    "var period=" + speed + ";\n" +
                    "var t=time-startT;\n" +
                    "base + Math.sin(t/period*Math.PI*2)*base*0.35;";
                try { strokeWProp.expression = pulseExpr; } catch(e){}
            }
        }
    }


    function applyDragInertia(comp, params){
        var sel = comp.selectedLayers;
        if (sel.length !== 3){
            alert("Drag Inertia: select 3 layers — target + DI_Start_* + DI_End_*.\nUse 'Create markers' button first.");
            return;
        }

        var target = null, nStart = null, nEnd = null;
        for (var i = 0; i < sel.length; i++){
            var nm = sel[i].name;
            if (nm.indexOf("DI_Start_") === 0)      nStart = sel[i];
            else if (nm.indexOf("DI_End_") === 0)   nEnd   = sel[i];
            else                                    target = sel[i];
        }
        if (!target || !nStart || !nEnd){
            alert("Drag Inertia: could not identify target + DI_Start_* + DI_End_* in selection.");
            return;
        }

        var startT   = params.startTime;
        var dur      = params.di_duration;
        var lag      = params.di_lag;
        var wobAmt   = params.di_wobbleAmt;
        var wobDec   = params.di_wobbleDecay;
        var stretch  = params.di_stretch;
        var loop     = params.di_loop;

        var pStart = nStart.transform.position.value;
        var pEnd   = nEnd.transform.position.value;

        // ---- Auto anchor to top of layer ----
        try {
            var rect = target.sourceRectAtTime(startT, false);
            var curAnchor = target.transform.anchorPoint.value;
            var newAnchor = [rect.left + rect.width/2, rect.top]; // top-center
            var deltaX = newAnchor[0] - curAnchor[0];
            var deltaY = newAnchor[1] - curAnchor[1];
            target.transform.anchorPoint.setValue(newAnchor);
            // Compensate current position so visual placement doesn't jump
            var curPos = target.transform.position.value;
            // Note: we'll overwrite position anyway below, so compensation only matters if user later removes keys
        } catch(e){}

        var posProp = target.transform.position;
        var rotProp = target.transform.rotation;
        var scaleProp = target.transform.scale;

        // Clear existing expressions
        try { posProp.expression = ""; } catch(e){}
        try { rotProp.expression = ""; } catch(e){}
        try { scaleProp.expression = ""; } catch(e){}

        if (loop){
            // Expressions for looped motion
            var loopDur = dur * 2; // A→B→A
            var posExpr =
                "var startT=" + startT + ";\n" +
                "var dur=" + dur + ";\n" +
                "var loopDur=" + loopDur + ";\n" +
                "var pA=[" + pStart[0] + "," + pStart[1] + "];\n" +
                "var pB=[" + pEnd[0]   + "," + pEnd[1]   + "];\n" +
                "var t=(time-startT) % loopDur; if(t<0) t+=loopDur;\n" +
                "var k, forward=true;\n" +
                "if (t < dur){ k = t/dur; } else { k = 1-(t-dur)/dur; forward=false; }\n" +
                "var e = 0.5 - 0.5*Math.cos(k*Math.PI);\n" +
                "[pA[0]+(pB[0]-pA[0])*e, pA[1]+(pB[1]-pA[1])*e];";
            posProp.expression = posExpr;

            var rotExpr =
                "var startT=" + startT + ";\n" +
                "var dur=" + dur + ";\n" +
                "var lag=" + lag + ";\n" +
                "var wobA=" + wobAmt + ";\n" +
                "var wobD=" + wobDec + ";\n" +
                "var loopDur=" + (dur*2) + ";\n" +
                "var t=(time-startT-lag) % loopDur; if(t<0) t+=loopDur;\n" +
                "var phase, sign;\n" +
                "if (t < dur){ phase = t/dur; sign = 1; } else { phase = (t-dur)/dur; sign = -1; }\n" +
                "var decay = Math.exp(-phase*wobD*2);\n" +
                "sign * Math.sin(phase*Math.PI*(1+wobD)) * wobA * decay;";
            rotProp.expression = rotExpr;
        } else {
            // Keyframes
            posProp.setValueAtTime(startT,       pStart);
            posProp.setValueAtTime(startT + dur, pEnd);
            setEaseOut(posProp);

            // Rotation with lag + wobble via expression on top of keyframes:
            // We'll simulate wobble via expression only.
            var rotExprK =
                "var startT=" + startT + ";\n" +
                "var dur=" + dur + ";\n" +
                "var lag=" + lag + ";\n" +
                "var wobA=" + wobAmt + ";\n" +
                "var wobD=" + wobDec + ";\n" +
                "var t=time-startT-lag;\n" +
                "if (t<0) 0;\n" +
                "else {\n" +
                "  var phase = Math.min(t/dur, 2);\n" +
                "  var decay = Math.exp(-phase*wobD);\n" +
                "  Math.sin(phase*Math.PI*(1+wobD)) * wobA * decay;\n" +
                "}";
            rotProp.expression = rotExprK;
        }

        // Stretch on Scale Y during motion (subtle)
        if (stretch){
            var baseScale = scaleProp.value;
            var sx = baseScale[0], sy = baseScale[1];
            var scaleExpr;
            if (loop){
                scaleExpr =
                    "var startT=" + startT + ";\n" +
                    "var dur=" + dur + ";\n" +
                    "var loopDur=" + (dur*2) + ";\n" +
                    "var sx=" + sx + "; var sy=" + sy + ";\n" +
                    "var t=(time-startT) % loopDur; if(t<0) t+=loopDur;\n" +
                    "var phase = (t<dur) ? t/dur : (t-dur)/dur;\n" +
                    "var boost = Math.sin(phase*Math.PI)*0.08;\n" +
                    "[sx*(1-boost*0.5), sy*(1+boost)];";
            } else {
                scaleExpr =
                    "var startT=" + startT + ";\n" +
                    "var dur=" + dur + ";\n" +
                    "var sx=" + sx + "; var sy=" + sy + ";\n" +
                    "var t=(time-startT)/dur;\n" +
                    "if (t<0 || t>1) [sx,sy];\n" +
                    "else {\n" +
                    "  var boost = Math.sin(t*Math.PI)*0.08;\n" +
                    "  [sx*(1-boost*0.5), sy*(1+boost)];\n" +
                    "}";
            }
            scaleProp.expression = scaleExpr;
        }
    }

// =====================================================
// HELP TEXT (RU)
// =====================================================
        function showHelp(){
        var txt =
            SCRIPT_NAME + " " + SCRIPT_VERSION + "\n" +
            "Универсальный аниматор для After Effects.\n\n" +
            "ИСПОЛЬЗОВАНИЕ:\n" +
            "1. Выделите слой(и) в композиции.\n" +
            "2. Выберите вкладку и пресет.\n" +
            "3. Настройте параметры.\n" +
            "4. Установите CTI (или задайте Start Time вручную).\n" +
            "5. Нажмите Apply.\n\n" +
            "═══ COMMON ═══\n" +
            "• Use CTI — Start Time берётся из текущей позиции CTI.\n" +
            "• Looped — циклический режим через expressions (без keyframes).\n" +
            "• From contour — старт с контура фигуры (bbox), не из центра.\n" +
            "• Match shape — форма генератора повторяет форму target\n" +
            "  (только Shockwave, Reverse Pulse).\n\n" +
            "═══ ENTRANCE ═══\n" +
            "• Glitch Pop-In — Scale + Opacity с overshoot + 2 цветных дубликата (R/G/B tint).\n" +
            "• Slide-In Cascade — сдвиг с направления + fade-in. Stagger — задержка между слоями.\n" +
            "• Cascade Reverse — Slide-In, но с обратным порядком слоёв.\n" +
            "• Digital Manifestation — рваный flicker через expression, затем стабильно.\n" +
            "• RGB Split — 3 цветных дубликата (R/G/B), схождение к центру.\n" +
            "• Slice Glitch — adjustment layer + fractal noise + displacement. Тяжёлый пресет.\n" +
            "• Fade-Up Delayed — плавное появление снизу с задержкой и stagger.\n\n" +
            "═══ IDLE (петлевые) ═══\n" +
            "• Glow Pulse — Glow с синусоидальной пульсацией интенсивности.\n" +
            "• Micro-Jitter — wiggle expression на Position (X / Y / Both).\n" +
            "• Idle Pulse — синусоидальная пульсация Scale (дыхание).\n" +
            "• Gentle Float — плавное покачивание по Y.\n\n" +
            "═══ GENERATORS ═══\n" +
            "• Corner Markers — 4 маркера вокруг bounding box слоя.\n" +
            "• Shockwave — концентрические ударные волны.\n" +
            "• Reverse Pulse — сжимающиеся круги (обратная пульсация).\n" +
            "• Impact Burst — вспышка + лучи от центра.\n" +
            "• Light Sweep — полоса света через слой с alpha matte.\n" +
            "   ⚠ Alpha matte использует target как маску: если target — solid без\n" +
            "     прозрачности, блик покроет всё. Используй shape/text layers.\n" +
            "• Concentric Arcs — концентрические дуги/круги с reveal, staggered.\n" +
            "• Orbiting Dots — точки движутся по орбите (bbox или ellipse).\n" +
            "   При Follow shape=on путь = скруглённый bbox (elliptical игнорируется).\n" +
            "• Rounded Stroke — обводка по периметру со скруглёнными углами и trim.\n" +
            "• Focus Frame — рамка с угловыми маркерами и стилями:\n" +
            "   Jitter / Fade / Teleport / Ghost / Scale / Shrink (комбинируются).\n" +
            "• Aura Circle — радиальный/линейный градиент вокруг слоя.\n" +
            "   Gradient: Radial / Linear. Invert — поменять inner↔outer.\n" +
            "   Stroke styles: None / Solid / Dashed / Dotted / March.\n" +
            "   Animation: None / Sweep / Breathing / Shimmer / Hue shift / Rotate gradient.\n" +
            "   Pulse Stroke / Gradient — независимые пульсации.\n" +
            "• Drag Inertia — 3 nulls (Start/End/Target) для движения с lag+wobble.\n" +
            "   Требует ровно 1 выделенный слой; создаёт 2 null-контроллера.\n" +
            "   Stretch — лёгкое растяжение Scale во время движения.\n\n" +
            "СОВЕТЫ:\n" +
            "• Looped-режим предпочтителен для Idle и повторяющихся эффектов.\n" +
            "• From contour + Match shape отлично работают с фигурами (Shape layers).\n" +
            "• Slice Glitch — тяжёлый: применяй по одному слою за раз.\n" +
            "• Все генераторы parent'ятся к target — двигай target, генератор следует.\n\n" +
            "Версия: " + SCRIPT_VERSION;
        alert(txt);
    }




// =====================================================
// UI
// =====================================================
   function buildUI(thisObj){
var win = (thisObj instanceof Panel) ? thisObj :
         new Window("palette", SCRIPT_NAME, undefined, {resizeable:true});
win.orientation = "column";
win.alignChildren = ["fill","top"];
win.spacing = 4;
win.margins = 8;
win.preferredSize.width = 340;
win.minimumSize.width   = 340;

var hdr = win.add("group");
hdr.orientation = "row"; hdr.alignChildren = ["fill","center"]; hdr.spacing = 4;
var title = hdr.add("statictext", undefined, SCRIPT_NAME + "  " + SCRIPT_VERSION);
title.graphics.foregroundColor = title.graphics.newPen(title.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);
var helpBtn = hdr.add("button", undefined, "?");
helpBtn.preferredSize = [28, 22];
helpBtn.onClick = showHelp;

function addSectionHeader(parent, text){
   var st = parent.add("statictext", undefined, text);
   st.graphics.foregroundColor = st.graphics.newPen(st.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);
   return st;
}
function addSlider(parent, label, min, max, def, decimals, suffix){
   var row = parent.add("group");
   row.orientation = "row"; row.alignChildren = ["left","center"]; row.spacing = 4;
   var lbl = row.add("statictext", undefined, label); lbl.preferredSize.width = 90;
   var sl = row.add("slider", undefined, def, min, max); sl.preferredSize.width = 100;
   var et = row.add("edittext", undefined, def.toFixed(decimals||0)); et.preferredSize.width = 45;
   if (suffix){ row.add("statictext", undefined, suffix).preferredSize.width = 18; }
   sl.onChanging = function(){ et.text = sl.value.toFixed(decimals||0); };
   et.onChange   = function(){ var v = parseFloat(et.text); if (!isNaN(v)){ sl.value = clamp(v,min,max); } };
   return { value: function(){ return parseFloat(et.text); } };
}
function addDropdown(parent, label, items, defIndex){
   var row = parent.add("group");
   row.orientation = "row"; row.alignChildren = ["left","center"]; row.spacing = 4;
   var lbl = row.add("statictext", undefined, label); lbl.preferredSize.width = 90;
   var dd = row.add("dropdownlist", undefined, items);
   dd.selection = defIndex || 0; dd.preferredSize.width = 170;
   return dd;
}
function addColorField(parent, label, defHex){
   var row = parent.add("group");
   row.orientation = "row"; row.alignChildren = ["left","center"]; row.spacing = 4;
   var lbl = row.add("statictext", undefined, label); lbl.preferredSize.width = 90;
   var et = row.add("edittext", undefined, defHex); et.preferredSize.width = 90;
   var pickBtn = row.add("button", undefined, "▣"); pickBtn.preferredSize = [28, 22];
   pickBtn.onClick = function(){
       try {
           var picked = $.colorPicker();
           if (picked !== -1){
               var r = ((picked >> 16) & 0xFF);
               var g = ((picked >> 8) & 0xFF);
               var b = (picked & 0xFF);
               function h(v){ var s = v.toString(16); return s.length<2?"0"+s:s; }
               et.text = "#" + h(r) + h(g) + h(b);
           }
       } catch(e){}
   };
   return et;
}

                      var tabs = win.add("tabbedpanel");
tabs.alignChildren = ["fill","top"];
tabs.alignment = ["fill","fill"];
tabs.preferredSize.width = 320;





var tabEntrance = tabs.add("tab", undefined, "Entrance");
tabEntrance.orientation = "column"; tabEntrance.alignChildren = ["fill","top"];
tabEntrance.margins = 6; tabEntrance.spacing = 4;

var tabIdle = tabs.add("tab", undefined, "Idle");
tabIdle.orientation = "column"; tabIdle.alignChildren = ["fill","top"];
tabIdle.margins = 6; tabIdle.spacing = 4;

var tabGen = tabs.add("tab", undefined, "Generators");
tabGen.orientation = "column"; tabGen.alignChildren = ["fill","top"];
tabGen.margins = 6; tabGen.spacing = 4;

tabs.selection = 0;

       // ---------- COMMON ----------
addSectionHeader(win, "COMMON");
var startRow = win.add("group");
startRow.orientation = "row"; startRow.alignChildren = ["left","center"]; startRow.spacing = 4;
var useCTI = startRow.add("checkbox", undefined, "Use CTI"); useCTI.value = true;
var startTimeSl = addSlider(win, "Start (s):", 0, 30, 0, 2, "s");

var genOptsRow = win.add("group");
genOptsRow.orientation = "row"; genOptsRow.alignChildren = ["left","center"]; genOptsRow.spacing = 10;
var chkLooped   = genOptsRow.add("checkbox", undefined, "Looped");
chkLooped.value = false;
var chkFromCtr  = genOptsRow.add("checkbox", undefined, "From contour");
chkFromCtr.value = false;
var chkMatchSh  = genOptsRow.add("checkbox", undefined, "Match shape");
chkMatchSh.value = false;





function getStartTime(comp){
   if (useCTI.value) return comp.time;
   return startTimeSl.value();
}


// =====================================================
// TAB: ENTRANCE
// =====================================================
addSectionHeader(tabEntrance, "PRESET");
var entPresetDD = addDropdown(tabEntrance, "Preset:",
   ["Glitch Pop-In", "Slide-In Cascade", "Cascade Reverse",
    "Digital Manifestation", "RGB Split", "Slice Glitch", "Fade-Up Delayed"], 0);

// --- Glitch Pop-In ---
var entStack = tabEntrance.add("group");
entStack.orientation = "stack";
entStack.alignChildren = ["fill","top"];
entStack.alignment = ["fill","top"];
entStack.preferredSize.height = 180;
entStack.minimumSize.height = 180;
entStack.maximumSize.height = 180;
var pGlitch = entStack.add("group");
pGlitch.orientation = "column"; pGlitch.alignChildren = ["fill","top"]; pGlitch.spacing = 3;
addSectionHeader(pGlitch, "GLITCH POP-IN");
var gDur    = addSlider(pGlitch, "Duration:",   0.05, 1.0, 0.15, 2, "s");
var gOffX   = addSlider(pGlitch, "Offset X:",   0, 20, 4, 0, "px");
var gOpa    = addSlider(pGlitch, "Glitch op:",  0, 100, 70, 0, "%");
var gScFrom = addSlider(pGlitch, "Scale from:", 80, 200, 110, 0, "%");

// --- Slide-In ---
var pSlide = entStack.add("group");
pSlide.orientation = "column"; pSlide.alignChildren = ["fill","top"]; pSlide.spacing = 3;
addSectionHeader(pSlide, "SLIDE-IN CASCADE");
var sDir    = addDropdown(pSlide, "Direction:", ["Left","Right","Top","Bottom"], 0);
var sDist   = addSlider(pSlide,   "Distance:",  10, 500, 60, 0, "px");
var sDur    = addSlider(pSlide,   "Duration:",  0.1, 2.0, 0.35, 2, "s");
var sStag   = addSlider(pSlide,   "Stagger:",   0, 1.0, 0.05, 2, "s");

// --- Cascade Reverse (same params as slide) ---
var pCasR = entStack.add("group");
pCasR.orientation = "column"; pCasR.alignChildren = ["fill","top"]; pCasR.spacing = 3;
addSectionHeader(pCasR, "CASCADE REVERSE");
pCasR.add("statictext", undefined, "Использует параметры Slide-In Cascade,");
pCasR.add("statictext", undefined, "но применяет к слоям в обратном порядке.");

// --- Digital Manifestation ---
var pDM = entStack.add("group");
pDM.orientation = "column"; pDM.alignChildren = ["fill","top"]; pDM.spacing = 3;
addSectionHeader(pDM, "DIGITAL MANIFESTATION");
var dmFlick = addSlider(pDM, "Flicker (s):", 0.1, 2.0, 0.3, 2, "s");

// --- RGB Split ---
var pRGB = entStack.add("group");
pRGB.orientation = "column"; pRGB.alignChildren = ["fill","top"]; pRGB.spacing = 3;
addSectionHeader(pRGB, "RGB SPLIT");
var rgbDur  = addSlider(pRGB, "Duration:", 0.1, 2.0, 0.5, 2, "s");
var rgbOff  = addSlider(pRGB, "Max offset:", 1, 30, 8, 0, "px");

// --- Slice Glitch ---
var pSG = entStack.add("group");
pSG.orientation = "column"; pSG.alignChildren = ["fill","top"]; pSG.spacing = 3;
addSectionHeader(pSG, "SLICE GLITCH");
var sgDur   = addSlider(pSG, "Duration:", 0.1, 2.0, 0.5, 2, "s");
var sgDisp  = addSlider(pSG, "Max disp:", 1, 50, 15, 0, "px");

// --- Fade-Up ---
var pFU = entStack.add("group");
pFU.orientation = "column"; pFU.alignChildren = ["fill","top"]; pFU.spacing = 3;
addSectionHeader(pFU, "FADE-UP DELAYED");
var fuDur   = addSlider(pFU, "Duration:", 0.1, 2.0, 0.4, 2, "s");
var fuOffY  = addSlider(pFU, "Offset Y:", 5, 100, 25, 0, "px");
var fuStag  = addSlider(pFU, "Stagger:",  0, 1.0, 0.08, 2, "s");
var fuDelay = addSlider(pFU, "Delay:",    0, 2.0, 0.2, 2, "s");

         function refreshEntrance(){
   var idx = entPresetDD.selection.index;
   var groups = [pGlitch, pSlide, pCasR, pDM, pRGB, pSG, pFU];
   for (var g=0; g<groups.length; g++){
       groups[g].visible = (g===idx);
   }
   tabEntrance.layout.layout(true);
   win.layout.layout(true);
}


entPresetDD.onChange = refreshEntrance;
refreshEntrance();

var entApplyBtn = tabEntrance.add("button", undefined, "Apply to selected");
entApplyBtn.preferredSize.height = 26;
entApplyBtn.alignment = ["fill","bottom"];
entApplyBtn.onClick = function(){
   var comp = getComp(); if (!comp) return;
   var sel  = getSelectedLayers(comp); if (!sel) return;
   var params = {
       startTime: getStartTime(comp),
       glitch_duration: gDur.value(), glitch_offsetX: gOffX.value(),
       glitch_opacity: gOpa.value(),  glitch_scaleFrom: gScFrom.value(),
       slide_direction: sDir.selection.text, slide_distance: sDist.value(),
       slide_duration: sDur.value(),  slide_stagger: sStag.value(),
       dm_flickerDuration: dmFlick.value(),
       rgb_duration: rgbDur.value(),  rgb_offset: rgbOff.value(),
       slice_duration: sgDur.value(), slice_displacement: sgDisp.value(),
       fu_duration: fuDur.value(),    fu_offsetY: fuOffY.value(),
       fu_stagger: fuStag.value(),    fu_delay: fuDelay.value()
   };
   app.beginUndoGroup(SCRIPT_NAME + " Entrance");
   try {
       var idx = entPresetDD.selection.index;
       if (idx===0){
           var base = params.startTime;
           for (var i=0;i<sel.length;i++){
               params.startTime = base + i*0.03;
               applyGlitchPopIn(sel[i], comp, params);
           }
       } else if (idx===1){
           applySlideInCascade(sel, comp, params);
       } else if (idx===2){
           applyCascadeReverse(sel, comp, params);
       } else if (idx===3){
           for (var j=0;j<sel.length;j++) applyDigitalManifestation(sel[j], comp, params);
       } else if (idx===4){
           for (var k=0;k<sel.length;k++) applyRGBSplit(sel[k], comp, params);
       } else if (idx===5){
           for (var m=0;m<sel.length;m++) applySliceGlitch(sel[m], comp, params);
       } else if (idx===6){
           applyFadeUp(sel, comp, params);
       }
   } catch(e){ alert("Ошибка: " + e.toString()); }
   app.endUndoGroup();
};

// =====================================================
// TAB: IDLE
// =====================================================
       addSectionHeader(tabIdle, "PRESET");
var idlePresetDD = addDropdown(tabIdle, "Preset:",
   ["Glow Pulse", "Micro-Jitter", "Idle Pulse (Scale)", "Gentle Float"], 0);

var idleStack = tabIdle.add("group");
idleStack.orientation = "stack";
idleStack.alignChildren = ["fill","top"];
idleStack.alignment = ["fill","top"];
idleStack.preferredSize.height = 120;
idleStack.minimumSize.height = 120;
idleStack.maximumSize.height = 120;

var pGP = idleStack.add("group");
pGP.orientation = "column"; pGP.alignChildren = ["fill","top"]; pGP.spacing = 3;
addSectionHeader(pGP, "GLOW PULSE");
var gpBase = addSlider(pGP, "Base:",   0, 100, 20, 0, "%");
var gpAmp  = addSlider(pGP, "Amp:",    0, 100, 15, 0);
var gpPer  = addSlider(pGP, "Period:", 0.5, 10, 2.0, 2, "s");

var pMJ = idleStack.add("group");
pMJ.orientation = "column"; pMJ.alignChildren = ["fill","top"]; pMJ.spacing = 3;
addSectionHeader(pMJ, "MICRO-JITTER");
var mjFreq = addSlider(pMJ, "Freq:", 0.5, 10, 3, 1, "Hz");
var mjAmp  = addSlider(pMJ, "Amp:",  0.5, 20, 2, 1, "px");
var mjAxis = addDropdown(pMJ, "Axis:", ["X","Y","Both"], 0);

var pIP = idleStack.add("group");
pIP.orientation = "column"; pIP.alignChildren = ["fill","top"]; pIP.spacing = 3;
addSectionHeader(pIP, "IDLE PULSE");
var ipPer  = addSlider(pIP, "Period:", 0.5, 10, 2.0, 2, "s");
var ipAmp  = addSlider(pIP, "Amp:",    1, 30, 5, 0, "%");

var pGF = idleStack.add("group");
pGF.orientation = "column"; pGF.alignChildren = ["fill","top"]; pGF.spacing = 3;
addSectionHeader(pGF, "GENTLE FLOAT");
var gfPer  = addSlider(pGF, "Period:", 0.5, 10, 2.0, 2, "s");
var gfAmp  = addSlider(pGF, "Amp:",    1, 30, 6, 0, "px");



 

          function refreshIdle(){
   var idx = idlePresetDD.selection.index;
   var groups = [pGP, pMJ, pIP, pGF];
   for (var g=0; g<groups.length; g++){
       groups[g].visible = (g===idx);
   }
   tabIdle.layout.layout(true);
   win.layout.layout(true);
}


idlePresetDD.onChange = refreshIdle;
refreshIdle();

var idleApplyBtn = tabIdle.add("button", undefined, "Apply to selected");
idleApplyBtn.preferredSize.height = 26;
idleApplyBtn.alignment = ["fill","bottom"];
idleApplyBtn.onClick = function(){
   var comp = getComp(); if (!comp) return;
   var sel  = getSelectedLayers(comp); if (!sel) return;
   var params = {
       gp_base: gpBase.value(), gp_amp: gpAmp.value(), gp_period: gpPer.value(),
       mj_freq: mjFreq.value(), mj_amp: mjAmp.value(), mj_axis: mjAxis.selection.text,
       ip_period: ipPer.value(), ip_amp: ipAmp.value(),
       gf_period: gfPer.value(), gf_amp: gfAmp.value(),
       
   };
   app.beginUndoGroup(SCRIPT_NAME + " Idle");
   try {
       var idx = idlePresetDD.selection.index;
       for (var i=0;i<sel.length;i++){
           if (idx===0) applyGlowPulse(sel[i], params);
           else if (idx===1) applyMicroJitter(sel[i], params);
           else if (idx===2) applyIdlePulse(sel[i], params);
           else if (idx===3) applyGentleFloat(sel[i], params);
         
       }
   } catch(e){ alert("Ошибка: " + e.toString()); }
   app.endUndoGroup();
};

// =====================================================
// TAB: GENERATORS (Corner Markers пока единственный)
// =====================================================
             addSectionHeader(tabGen, "GENERATOR");
var genPresetDD = addDropdown(tabGen, "Preset:",
["Corner Markers", "Shockwave", "Reverse Pulse", "Impact Burst", "Light Sweep",
"Concentric Arcs", "Orbiting Dots", "Rounded Stroke", "Focus Frame", "Aura Circle", "Drag Inertia"], 0);




var genStack = tabGen.add("group");
genStack.orientation = "stack";
genStack.alignChildren = ["fill","top"];
genStack.alignment = ["fill","top"];
genStack.preferredSize.height = 440;
genStack.minimumSize.height = 440;
genStack.maximumSize.height = 440;

// --- Corner Markers ---
var pCM = genStack.add("group");
pCM.orientation = "column"; pCM.alignChildren = ["fill","top"]; pCM.spacing = 3;
addSectionHeader(pCM, "CORNER MARKERS");
var cmPad   = addSlider(pCM, "Padding:",   0, 100, 10, 0, "px");
var cmSize  = addSlider(pCM, "Size:",      5, 60, 18, 0, "px");
var CM_SHAPES = ["L-bracket","Plus cross","X-cross","Square hollow",
                 "Square with inner","Circle ring","Circle dot"];
var cmStart = addDropdown(pCM, "Start:",   CM_SHAPES, 0); // L-bracket
var cmM1    = addDropdown(pCM, "Mid TL:",  CM_SHAPES, 1); // Plus cross
var cmM2    = addDropdown(pCM, "Mid TR:",  CM_SHAPES, 3); // Square hollow
var cmM3    = addDropdown(pCM, "Mid BR:",  CM_SHAPES, 5); // Circle ring
var cmM4    = addDropdown(pCM, "Mid BL:",  CM_SHAPES, 0); // L-bracket
var cmDur   = addSlider(pCM, "Duration:",  0.2, 3.0, 0.6, 2, "s");
var cmCol   = addColorField(pCM, "Color:", "#FF8C26");
var cmOptRow = pCM.add("group");
cmOptRow.orientation = "row"; cmOptRow.alignChildren = ["left","center"]; cmOptRow.spacing = 10;
var cmHideEndChk = cmOptRow.add("checkbox", undefined, "Hide at end (opacity → 0)");
cmHideEndChk.value = false;
var cmGap = addSlider(pCM, "Loop pause:", 0, 3.0, 0.4, 2, "s");


// --- Shockwave ---
var pSW = genStack.add("group");
pSW.orientation = "column"; pSW.alignChildren = ["fill","top"]; pSW.spacing = 3;
addSectionHeader(pSW, "SHOCKWAVE");
var swCnt   = addSlider(pSW, "Count:",     1, 5, 3, 0);
var swDur   = addSlider(pSW, "Duration:",  0.2, 3.0, 0.8, 2, "s");
var swRad   = addSlider(pSW, "Max radius:", 20, 500, 150, 0, "px");
var swStr   = addSlider(pSW, "Stroke:",    0.5, 10, 2, 1, "px");
var swCol   = addColorField(pSW, "Color:", "#FFFFFF");

// --- Reverse Pulse ---
var pRP = genStack.add("group");
pRP.orientation = "column"; pRP.alignChildren = ["fill","top"]; pRP.spacing = 3;
addSectionHeader(pRP, "REVERSE PULSE");
var rpCnt   = addSlider(pRP, "Count:",     1, 5, 3, 0);
var rpPer   = addSlider(pRP, "Period:",    0.5, 5.0, 1.5, 2, "s");
var rpSS    = addSlider(pRP, "Start scale:", 100, 300, 200, 0, "%");
var rpStr   = addSlider(pRP, "Stroke:",    0.5, 10, 2, 1, "px");
var rpCol   = addColorField(pRP, "Color:", "#FFAA33");

// --- Impact Burst ---
var pIB = genStack.add("group");
pIB.orientation = "column"; pIB.alignChildren = ["fill","top"]; pIB.spacing = 3;
addSectionHeader(pIB, "IMPACT BURST");
var ibDur   = addSlider(pIB, "Duration:",  0.2, 2.0, 0.5, 2, "s");
var ibRays  = addSlider(pIB, "Rays:",      4, 16, 8, 0);
var ibRL    = addSlider(pIB, "Ray len:",   20, 300, 80, 0, "px");
var ibFS    = addSlider(pIB, "Flash size:", 20, 300, 60, 0, "px");
var ibCol   = addColorField(pIB, "Color:", "#FFFFFF");

// --- Light Sweep ---
var pLS = genStack.add("group");
pLS.orientation = "column"; pLS.alignChildren = ["fill","top"]; pLS.spacing = 3;
addSectionHeader(pLS, "LIGHT SWEEP");
var lsDur   = addSlider(pLS, "Duration:",  0.3, 3.0, 1.0, 2, "s");
var lsW     = addSlider(pLS, "Width:",     10, 200, 40, 0, "px");
var lsCol   = addColorField(pLS, "Color:", "#FFFFFF");

// --- Concentric Arcs ---
var pCA = genStack.add("group");
pCA.orientation = "column"; pCA.alignChildren = ["fill","top"]; pCA.spacing = 3;
addSectionHeader(pCA, "CONCENTRIC ARCS");
var caCnt    = addSlider(pCA, "Count:",      1, 6, 3, 0);
var caDur    = addSlider(pCA, "Duration:",   0.3, 5.0, 1.5, 2, "s");
var caStag   = addSlider(pCA, "Stagger:",    0, 1.0, 0.15, 2, "s");
var caRad    = addSlider(pCA, "Max radius:", 30, 500, 150, 0, "px");
var caStr    = addSlider(pCA, "Stroke:",     0.5, 10, 2, 1, "px");
var caSegAng = addSlider(pCA, "Segment °:",  30, 300, 90, 0, "°");
var caCol    = addColorField(pCA, "Color:",  "#FFAA33");
var caOpts   = pCA.add("group");
caOpts.orientation = "row"; caOpts.alignChildren = ["left","center"]; caOpts.spacing = 10;
var caSegChk = caOpts.add("checkbox", undefined, "Arc segment");
caSegChk.value = false;
var caRevChk = caOpts.add("checkbox", undefined, "Reverse");
caRevChk.value = false;
// Start corners for arc segment mode
var caCornerLbl = pCA.add("statictext", undefined, "Start corners:");
var caCornerRow = pCA.add("group");
caCornerRow.orientation = "row"; caCornerRow.alignChildren = ["left","center"]; caCornerRow.spacing = 8;
var caTL = caCornerRow.add("checkbox", undefined, "TL"); caTL.value = true;
var caTR = caCornerRow.add("checkbox", undefined, "TR"); caTR.value = false;
var caBR = caCornerRow.add("checkbox", undefined, "BR"); caBR.value = false;
var caBL = caCornerRow.add("checkbox", undefined, "BL"); caBL.value = false;
var caSegLen = addSlider(pCA, "Segment len:", 10, 150, 100, 0, "%");



// --- Orbiting Dots ---
var pOD = genStack.add("group");
pOD.orientation = "column"; pOD.alignChildren = ["fill","top"]; pOD.spacing = 3;
addSectionHeader(pOD, "ORBITING DOTS");
var odCnt   = addSlider(pOD, "Count:",     1, 12, 3, 0);
var odPer   = addSlider(pOD, "Period:",    0.5, 10, 3.0, 2, "s");
var odSize  = addSlider(pOD, "Dot size:",  2, 30, 8, 0, "px");
var odPadRow = pOD.add("group");
odPadRow.orientation = "row"; odPadRow.alignChildren = ["fill","center"]; odPadRow.spacing = 4;
var odPad   = addSlider(odPadRow, "Padding:",   0, 80, 10, 0, "px");
var odPadInChk = odPadRow.add("checkbox", undefined, "In");
odPadInChk.value = false;
var odCol   = addColorField(pOD, "Color:", "#FFFFFF");
var odRow   = pOD.add("group");
odRow.orientation = "row"; odRow.alignChildren = ["left","center"]; odRow.spacing = 8;
var odEllChk = odRow.add("checkbox", undefined, "Elliptical orbit");
odEllChk.value = true;
var odFollowChk = odRow.add("checkbox", undefined, "Follow shape");
odFollowChk.value = false;
var odRevChk = odRow.add("checkbox", undefined, "Reverse");
odRevChk.value = false;

// --- Rounded Rect Stroke ---
var pRR = genStack.add("group");
pRR.orientation = "column"; pRR.alignChildren = ["fill","top"]; pRR.spacing = 3;
addSectionHeader(pRR, "ROUNDED STROKE");
var rrDur   = addSlider(pRR, "Duration:", 0.2, 3.0, 0.8, 2, "s");
var rrStr   = addSlider(pRR, "Stroke:",   0.5, 10, 3, 1, "px");
var rrRoundRow = pRR.add("group");
rrRoundRow.orientation = "row"; rrRoundRow.alignChildren = ["fill","center"]; rrRoundRow.spacing = 4;
var rrRound = addSlider(rrRoundRow, "Roundness:", 0, 500, 20, 0, "px");
var rrAutoChk = rrRoundRow.add("checkbox", undefined, "Auto");
rrAutoChk.value = false;
var rrPad   = addSlider(pRR, "Padding:",  0, 60, 10, 0, "px");
var rrCol   = addColorField(pRR, "Color:", "#FFFFFF");

// Start corners
var rrCornerLbl = pRR.add("statictext", undefined, "Start corners:");
var rrCornerRow = pRR.add("group");
rrCornerRow.orientation = "row"; rrCornerRow.alignChildren = ["left","center"]; rrCornerRow.spacing = 8;
var rrTL = rrCornerRow.add("checkbox", undefined, "TL"); rrTL.value = true;
var rrTR = rrCornerRow.add("checkbox", undefined, "TR"); rrTR.value = false;
var rrBR = rrCornerRow.add("checkbox", undefined, "BR"); rrBR.value = false;
var rrBL = rrCornerRow.add("checkbox", undefined, "BL"); rrBL.value = false;
var rrSegLen = addSlider(pRR, "Segment len:", 10, 100, 100, 0, "%");


// --- Focus Frame ---
var pFF = genStack.add("group");
pFF.orientation = "column"; pFF.alignChildren = ["fill","top"]; pFF.spacing = 3;
addSectionHeader(pFF, "FOCUS FRAME");

var ffDur   = addSlider(pFF, "Duration:",   0.3, 5.0, 1.5, 2, "s");
var ffLen   = addSlider(pFF, "Corner len:", 5, 50, 20, 0, "%");
var ffPadRow = pFF.add("group");
ffPadRow.orientation = "row"; ffPadRow.alignChildren = ["fill","center"]; ffPadRow.spacing = 4;
var ffPad   = addSlider(ffPadRow, "Padding:",   0, 100, 15, 0, "px");
var ffPadInChk = ffPadRow.add("checkbox", undefined, "In");
ffPadInChk.value = false;
var ffStr   = addSlider(pFF, "Stroke:",     0.5, 8, 2, 1, "px");
var ffJitR  = addSlider(pFF, "Jitter rate:", 0.05, 0.5, 0.15, 2, "s");
var ffFlashP = addSlider(pFF, "Flash period:", 0.5, 5.0, 2.0, 2, "s");

var ffColF = addColorField(pFF, "Frame col:",  "#FFFFFF");
var ffColC = addColorField(pFF, "Corner col:", "#FFAA33");

// Intro / Repeat flash
var ffFlashRow = pFF.add("group");
ffFlashRow.orientation = "row"; ffFlashRow.alignChildren = ["left","center"]; ffFlashRow.spacing = 10;
var ffIntroChk  = ffFlashRow.add("checkbox", undefined, "Intro flash");
ffIntroChk.value = true;
var ffRepeatChk = ffFlashRow.add("checkbox", undefined, "Repeat flash");
ffRepeatChk.value = false;

// Corner animation styles (комбинируются)
var ffStyleLbl = pFF.add("statictext", undefined, "Corner styles:");
var ffStyleRow1 = pFF.add("group");
ffStyleRow1.orientation = "row"; ffStyleRow1.alignChildren = ["left","center"]; ffStyleRow1.spacing = 6;
var ffJitter   = ffStyleRow1.add("checkbox", undefined, "Jitter"); ffJitter.value = false;
var ffFade     = ffStyleRow1.add("checkbox", undefined, "Fade");   ffFade.value = true;
var ffTeleport = ffStyleRow1.add("checkbox", undefined, "Teleport"); ffTeleport.value = false;

var ffStyleRow2 = pFF.add("group");
ffStyleRow2.orientation = "row"; ffStyleRow2.alignChildren = ["left","center"]; ffStyleRow2.spacing = 6;
var ffGhost    = ffStyleRow2.add("checkbox", undefined, "Ghost");   ffGhost.value = false;
var ffScale    = ffStyleRow2.add("checkbox", undefined, "Scale");   ffScale.value = false;
var ffShrink   = ffStyleRow2.add("checkbox", undefined, "Shrink");  ffShrink.value = false;

    // =====================================================
    // UI: Aura Circle
    // =====================================================
    var pAU = genStack.add("group");
    pAU.orientation = "column";
    pAU.alignChildren = ["fill", "top"];
    pAU.spacing = 4;
    addSectionHeader(pAU, "AURA CIRCLE");

    // Gradient type
    var auTypeRow = pAU.add("group");
    auTypeRow.orientation = "row"; auTypeRow.alignChildren = ["left","center"]; auTypeRow.spacing = 6;
    auTypeRow.add("statictext", undefined, "Gradient:");
    var auTypeDD = auTypeRow.add("dropdownlist", undefined, ["Radial", "Linear"]);
    auTypeDD.selection = 0;
    var auInvertChk = auTypeRow.add("checkbox", undefined, "Invert");
    auInvertChk.value = true;

    // Colors + opacity
    var auInnerCol = addColorField(pAU, "Inner color:", "#FFCC66");
    var auInnerOp  = addSlider(pAU, "Inner opacity:", 0, 100, 90, 0, "%");
    var auOuterCol = addColorField(pAU, "Outer color:", "#FF6600");
    var auOuterOp  = addSlider(pAU, "Outer opacity:", 0, 100, 0, 0, "%");

    // Size / padding
    var auRadius   = addSlider(pAU, "Radius:", 20, 400, 100, 0, "px");
    var auPadRow = pAU.add("group");
    auPadRow.orientation = "row"; auPadRow.alignChildren = ["fill","center"]; auPadRow.spacing = 4;
    var auPad      = addSlider(auPadRow, "Padding:", 0, 80, 10, 0, "px");
    var auPadInChk = auPadRow.add("checkbox", undefined, "In");

    // Stroke
    var auStrRow = pAU.add("group");
    auStrRow.orientation = "row"; auStrRow.alignChildren = ["left","center"]; auStrRow.spacing = 6;
    auStrRow.add("statictext", undefined, "Stroke:");
    var auStrokeStyleDD = auStrRow.add("dropdownlist", undefined, ["None","Solid","Dashed","Dotted","March"]);
    auStrokeStyleDD.selection = 1;
    var auStroke  = addSlider(pAU, "Stroke width:", 0.5, 8, 2, 1, "px");
    var auStrokeCol = addColorField(pAU, "Stroke color:", "#FFFFFF");
    var auDashLen = addSlider(pAU, "Dash length:", 2, 30, 8, 0, "px");
    var auDashGap = addSlider(pAU, "Dash gap:",    2, 30, 6, 0, "px");

    // Animation
    var auAnimRow = pAU.add("group");
    auAnimRow.orientation = "row"; auAnimRow.alignChildren = ["left","center"]; auAnimRow.spacing = 6;
    auAnimRow.add("statictext", undefined, "Animation:");
    var auAnimDD = auAnimRow.add("dropdownlist", undefined, ["None","Sweep","Breathing","Shimmer","Hue shift","Rotate gradient"]);
    auAnimDD.selection = 2;
    var auSpeed  = addSlider(pAU, "Speed:", 0.3, 5.0, 2.0, 2, "s");

    // Pulse checkboxes
    var auPulseRow = pAU.add("group");
    auPulseRow.orientation = "row"; auPulseRow.alignChildren = ["left","center"]; auPulseRow.spacing = 10;
    auPulseRow.add("statictext", undefined, "Pulse:");
    var auPulseStrokeChk = auPulseRow.add("checkbox", undefined, "Stroke");
    auPulseStrokeChk.value = false;
    var auPulseGradChk = auPulseRow.add("checkbox", undefined, "Gradient");
    auPulseGradChk.value = false;


 
        // =====================================================
    // UI: Drag Inertia
    // =====================================================
    var pDI = genStack.add("group");
    pDI.orientation = "column";
    pDI.alignChildren = ["fill", "top"];
    pDI.spacing = 4;
    addSectionHeader(pDI, "DRAG INERTIA");

    var diCreateBtn = pDI.add("button", undefined, "Create markers for selected layer");
    diCreateBtn.onClick = function(){
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Open a composition first."); return; }
        var sel = comp.selectedLayers;
        if (sel.length !== 1) { alert("Select exactly ONE target layer, then click Create."); return; }
        var target = sel[0];

        // Find unique suffix
        var baseStart = "DI_Start_" + target.name;
        var baseEnd   = "DI_End_"   + target.name;
        var suffix = "";
        var n = 1;
        var nameTaken = function(nm){
            for (var i = 1; i <= comp.numLayers; i++){
                if (comp.layer(i).name === nm) return true;
            }
            return false;
        };
        while (nameTaken(baseStart + suffix) || nameTaken(baseEnd + suffix)){
            n++;
            suffix = "_" + n;
        }

        app.beginUndoGroup("Drag Inertia: Create markers");
        try {
            // Read target position
            var tPos;
            try { tPos = target.transform.position.value; }
            catch(e){ tPos = [comp.width/2, comp.height/2]; }
            if (tPos.length < 2) tPos = [comp.width/2, comp.height/2];

            var nStart = comp.layers.addNull();
            nStart.name = baseStart + suffix;
            nStart.transform.position.setValue([tPos[0], tPos[1]]);
            try { nStart.label = 10; } catch(e){} // green
           

            var nEnd = comp.layers.addNull();
            nEnd.name = baseEnd + suffix;
            nEnd.transform.position.setValue([tPos[0] + 300, tPos[1]]);
            try { nEnd.label = 1; } catch(e){} // red
            
        } catch(err){
            alert("Create markers error: " + err.toString());
        }
        app.endUndoGroup();
    };

    var diDur   = addSlider(pDI, "Duration:", 0.5, 3.0, 1.2, 2, "s");
    var diLag   = addSlider(pDI, "Lag:",      0.05, 0.4, 0.15, 2, "s");
    var diWobA  = addSlider(pDI, "Wobble amt:", 0, 30, 10, 1, "°");
    var diWobD  = addSlider(pDI, "Wobble decay:", 1, 5, 2, 0, "");
    var diOptRow = pDI.add("group");
    diOptRow.orientation = "row"; diOptRow.alignChildren = ["left","center"]; diOptRow.spacing = 8;
    var diStretchChk = diOptRow.add("checkbox", undefined, "Stretch");
    var diLoopChk    = diOptRow.add("checkbox", undefined, "Loop");

function refreshGen(){
var idx = genPresetDD.selection.index;
var groups = [pCM, pSW, pRP, pIB, pLS, pCA, pOD, pRR, pFF, pAU, pDI];
for (var g=0; g<groups.length; g++){
groups[g].visible = (g===idx);
}
tabGen.layout.layout(true);
win.layout.layout(true);
}
genPresetDD.onChange = refreshGen;
refreshGen();


var genApplyBtn = tabGen.add("button", undefined, "Apply to selected");
genApplyBtn.preferredSize.height = 26;
genApplyBtn.alignment = ["fill","bottom"];
genApplyBtn.onClick = function(){
   var comp = getComp(); if (!comp) return;
   var sel  = getSelectedLayers(comp); if (!sel) return;
   var params = {
       startTime: getStartTime(comp),
                    gen_looped: chkLooped.value,
       gen_fromContour: chkFromCtr.value,
       gen_matchShape: chkMatchSh.value,
       // Corner Markers
       cm_padding: cmPad.value(), cm_size: cmSize.value(),
       cm_startShape: cmStart.selection.text,
       cm_midShape1: cmM1.selection.text, cm_midShape2: cmM2.selection.text,
       cm_midShape3: cmM3.selection.text, cm_midShape4: cmM4.selection.text,
       cm_duration: cmDur.value(), cm_color: cmCol.text,
       cm_hideEnd: cmHideEndChk.value,
       cm_loopGap: cmGap.value(),

       // Shockwave
       sw_count: swCnt.value(), sw_duration: swDur.value(),
       sw_maxRadius: swRad.value(), sw_stroke: swStr.value(),
       sw_color: swCol.text,
       // Reverse Pulse
       rp_count: rpCnt.value(), rp_period: rpPer.value(),
       rp_startScale: rpSS.value(), rp_stroke: rpStr.value(),
       rp_color: rpCol.text,
       // Impact Burst
       ib_duration: ibDur.value(), ib_rays: ibRays.value(),
       ib_rayLength: ibRL.value(), ib_flashSize: ibFS.value(),
       ib_color: ibCol.text,
       // Light Sweep
       ls_duration: lsDur.value(), ls_width: lsW.value(),
       ls_color: lsCol.text,
       // Concentric Arcs
ca_count: caCnt.value(), ca_duration: caDur.value(),
ca_stagger: caStag.value(), ca_maxRadius: caRad.value(),
ca_stroke: caStr.value(), ca_segAngle: caSegAng.value(),
ca_color: caCol.text,
ca_segment: caSegChk.value,
ca_reverse: caRevChk.value,
ca_corners: [caTL.value, caTR.value, caBR.value, caBL.value],
ca_segLen: caSegLen.value(),


       // Orbiting Dots
od_count: odCnt.value(), od_period: odPer.value(),
od_dotSize: odSize.value(), od_color: odCol.text,
od_padding: odPad.value(),
od_padInward: odPadInChk.value,
od_reverse: odRevChk.value, od_elliptical: odEllChk.value,
od_follow: odFollowChk.value,
       // Rounded Stroke
rr_duration: rrDur.value(), rr_stroke: rrStr.value(),
rr_roundness: rrRound.value(), rr_padding: rrPad.value(),
rr_color: rrCol.text,
rr_auto: rrAutoChk.value,
rr_corners: [rrTL.value, rrTR.value, rrBR.value, rrBL.value],
rr_segLen: rrSegLen.value(),
       // Focus Frame
       ff_duration: ffDur.value(), ff_cornerLen: ffLen.value(),
       ff_padding: ffPad.value(), ff_padInward: ffPadInChk.value,
       ff_stroke: ffStr.value(), ff_jitterRate: ffJitR.value(),
       ff_flashPeriod: ffFlashP.value(),
       ff_colFrame: ffColF.text, ff_colCorner: ffColC.text,
       ff_introFlash: ffIntroChk.value, ff_repeatFlash: ffRepeatChk.value,
       ff_jitter: ffJitter.value, ff_fade: ffFade.value,
       ff_teleport: ffTeleport.value, ff_ghost: ffGhost.value,
       ff_scale: ffScale.value, ff_shrink: ffShrink.value,
        // Aura Circle
        au_type: auTypeDD.selection.index,            // 0 radial, 1 linear
        au_invert: auInvertChk.value,
        au_innerColor: auInnerCol.text,
        au_innerOp: auInnerOp.value(),
        au_outerColor: auOuterCol.text,
        au_outerOp: auOuterOp.value(),
        au_radius: auRadius.value(),
        au_padding: auPad.value(),
        au_padInward: auPadInChk.value,
        au_strokeStyle: auStrokeStyleDD.selection.index, // 0 none,1 solid,2 dashed,3 dotted,4 march
        au_stroke: auStroke.value(),
        au_strokeColor: auStrokeCol.text,
        au_pulseStroke: auPulseStrokeChk.value,
au_pulseGrad: auPulseGradChk.value,
        au_dashLen: auDashLen.value(),
        au_dashGap: auDashGap.value(),
        au_anim: auAnimDD.selection.index,             // 0 none,1 sweep,2 breathing,3 shimmer,4 hue,5 rotate
        au_speed: auSpeed.value(),

        // Drag Inertia
        di_duration: diDur.value(),
        di_lag: diLag.value(),
        di_wobbleAmt: diWobA.value(),
        di_wobbleDecay: diWobD.value(),
        di_stretch: diStretchChk.value,
        di_loop: diLoopChk.value



   };
   app.beginUndoGroup(SCRIPT_NAME + " Generator");
   try {
       var idx = genPresetDD.selection.index;
       for (var i=0; i<sel.length; i++){
           if      (idx===0) applyCornerMarkers(sel[i], comp, params);
           else if (idx===1) applyShockwave(sel[i], comp, params);
           else if (idx===2) applyReversePulse(sel[i], comp, params);
           else if (idx===3) applyImpactBurst(sel[i], comp, params);
           else if (idx===4) applyLightSweep(sel[i], comp, params);
           else if (idx===5) applyConcentricArcs(sel[i], comp, params);
           else if (idx===6) applyOrbitingDots(sel[i], comp, params);
           else if (idx===7) applyRoundedRectStroke(sel[i], comp, params);
               else if (idx===8) applyFocusFrame(sel[i], comp, params);
        else if (idx === 9)  applyAuraCircle(sel[i], comp, params);
        else if (idx === 10) { applyDragInertia(comp, params); break; } // once per Apply


       }
   } catch(e){ alert("Ошибка: " + e.toString()); }
   app.endUndoGroup();
};


       win.layout.layout(true);
win.layout.resize();
if (win instanceof Window){
   win.preferredSize = [340, 480];
   win.minimumSize = [340, 480];
   win.center();
   win.show();
}
return win;

}



    buildUI(thisObj);

})(this);
