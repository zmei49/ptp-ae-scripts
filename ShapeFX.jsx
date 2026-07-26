// ============================================================
// ptp_ShapeFX.jsx
// v1.1 — Outline-centric architecture + Color Pulse + D35 Combo
// Author: ptp toolkit
// Install: Save into "Support Files/Scripts/ScriptUI Panels/"
// Run via: Window -> ptp_ShapeFX.jsx
// ============================================================

(function ptp_ShapeFX(thisObj) {

    var SCRIPT_NAME = "ptp_ShapeFX";
    var SCRIPT_VERSION = "v1.1";

    // ---------- COLORS ----------
    var COL = {
        bg:        [0.16, 0.16, 0.17, 1],
        accentTxt: [1.00, 0.65, 0.10, 1],
        text:      [0.92, 0.92, 0.92, 1]
    };
    var D35_ACCENT = [1.00, 0.53, 0.00];
    var D35_WHITE  = [1.00, 1.00, 1.00];

    // ============================================================
    // HELPERS
    // ============================================================
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Откройте композицию."); return null; }
        return c;
    }

    function getSelLayer() {
        var c = getComp(); if (!c) return null;
        var s = c.selectedLayers;
        if (s.length === 0) return null;
        return s[0];
    }

    function rgbToHex(rgb) {
        function p(n){ var h=Math.round(n*255).toString(16); return h.length<2?"0"+h:h; }
        return "#" + p(rgb[0]) + p(rgb[1]) + p(rgb[2]);
    }

       function setEaseOut(prop) {
        try {
            for (var k = 1; k <= prop.numKeys; k++) {
                try {
                    var ei = new KeyframeEase(0, 33);
                    var eo = new KeyframeEase(0, 80);
                    // пробуем угадать размерность по типу значения
                    var dim = 1;
                    try {
                        var sample = prop.valueAtTime(0, false);
                        if (sample && sample.length) dim = sample.length;
                    } catch(e) {}
                    var inArr = [], outArr = [];
                    for (var i = 0; i < dim; i++) { inArr.push(ei); outArr.push(eo); }
                    prop.setTemporalEaseAtKey(k, inArr, outArr);
                } catch(eInner) {}
            }
        } catch(e) {}
    }


    function getSourceRect(layer) {
        try {
            return layer.sourceRectAtTime(layer.containingComp.time, false);
        } catch(e) {
            return {left:0, top:0, width:200, height:200};
        }
    }

    function detectShapeKind(layer) {
        // returns {kind:"rect"|"ellipse"|"polygon"|"unknown", radius:Number}
        var result = {kind:"unknown", radius:0, w:0, h:0};
        if (!(layer instanceof ShapeLayer)) {
            var r = getSourceRect(layer);
            result.kind = "rect"; result.w = r.width; result.h = r.height;
            return result;
        }
        try {
            var contents = layer.property("ADBE Root Vectors Group");
            for (var i=1; i<=contents.numProperties; i++) {
                var grp = contents.property(i);
                var inner = grp.property("ADBE Vectors Group");
                if (!inner) continue;
                for (var j=1; j<=inner.numProperties; j++) {
                    var p = inner.property(j);
                    if (p.matchName === "ADBE Vector Shape - Rect") {
                        result.kind = "rect";
                        var sz = p.property("Size").value;
                        result.w = sz[0]; result.h = sz[1];
                        try { result.radius = p.property("Roundness").value; } catch(e){}
                        return result;
                    }
                    if (p.matchName === "ADBE Vector Shape - Ellipse") {
                        result.kind = "ellipse";
                        var sz2 = p.property("Size").value;
                        result.w = sz2[0]; result.h = sz2[1];
                        return result;
                    }
                    if (p.matchName === "ADBE Vector Shape - Star") {
                        result.kind = "polygon";
                        try { result.radius = p.property("Outer Roundness").value; } catch(e){}
                        try { var or = p.property("Outer Radius").value; result.w = or*2; result.h = or*2; } catch(e){}
                        return result;
                    }
                }
            }
        } catch(e){}
        var r2 = getSourceRect(layer);
        result.kind = "rect"; result.w = r2.width; result.h = r2.height;
        return result;
    }

    // ============================================================
    // CREATE BASE SHAPE (stroke only, no fill)
    // ============================================================
    function createBaseShape(comp, opts) {
        var layer = comp.layers.addShape();
        layer.name = "ShapeFX_" + opts.shape;

        var contents = layer.property("ADBE Root Vectors Group");
        var grp = contents.addProperty("ADBE Vector Group");
        grp.name = "Shape";
        var inner = grp.property("ADBE Vectors Group");

        var path;
        if (opts.shape === "ellipse") {
            path = inner.addProperty("ADBE Vector Shape - Ellipse");
            path.property("Size").setValue([opts.size, opts.size]);
        } else if (opts.shape === "polygon") {
            path = inner.addProperty("ADBE Vector Shape - Star");
            try {
                path.property("Type").setValue(2); // polygon
                path.property("Points").setValue(6);
                path.property("Outer Radius").setValue(opts.size/2);
                path.property("Outer Roundness").setValue(opts.cornerRadius);
            } catch(e){}
        } else {
            path = inner.addProperty("ADBE Vector Shape - Rect");
            path.property("Size").setValue([opts.size, opts.size]);
            try { path.property("Roundness").setValue(opts.cornerRadius); } catch(e){}
        }

        // только обводка, без заливки
        var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("Color").setValue(opts.strokeColor);
        stroke.property("Stroke Width").setValue(opts.strokeWidth);

        layer.property("Transform").property("Position").setValue([comp.width/2, comp.height/2]);
        return layer;
    }

    // ============================================================
    // FILL UTILITIES
    // ============================================================
    function findFirstShapeGroup(layer) {
        try {
            var contents = layer.property("ADBE Root Vectors Group");
            for (var i=1; i<=contents.numProperties; i++) {
                var grp = contents.property(i);
                if (grp.property("ADBE Vectors Group")) return grp.property("ADBE Vectors Group");
            }
        } catch(e){}
        return null;
    }

    function findFill(inner) {
        if (!inner) return null;
        for (var i=1; i<=inner.numProperties; i++) {
            var p = inner.property(i);
            if (p.matchName === "ADBE Vector Graphic - Fill") return p;
        }
        return null;
    }

    function findStroke(inner) {
        if (!inner) return null;
        for (var i=1; i<=inner.numProperties; i++) {
            var p = inner.property(i);
            if (p.matchName === "ADBE Vector Graphic - Stroke") return p;
        }
        return null;
    }

        function toggleFill(layer) {
        if (!(layer instanceof ShapeLayer)) { alert("Toggle Fill работает только с Shape слоями."); return; }
        var inner = findFirstShapeGroup(layer);
        if (!inner) { alert("Не найден контур в слое."); return; }
        var fill = findFill(inner);
        if (fill) {
            fill.remove();
        } else {
            var stroke = findStroke(inner);
            var newFill = inner.addProperty("ADBE Vector Graphic - Fill");
            var color = [1, 1, 1];
            if (stroke) {
                try { color = stroke.property("Color").value; } catch(e){}
            }
            newFill.property("Color").setValue(color);
            // Fill должен быть МЕЖДУ path и stroke (визуально под обводкой)
            // в shape contents позиция 1 = path, 2 = fill, 3 = stroke
            // addProperty добавляет в конец, поэтому если stroke есть — двигаем fill перед stroke
            if (stroke) {
                try {
                    var strokeIdx = stroke.propertyIndex;
                    newFill.moveTo(strokeIdx);
                } catch(e){}
            }
        }
    }


    function toggleStroke(layer) {
        if (!(layer instanceof ShapeLayer)) { alert("Toggle Stroke работает только с Shape слоями."); return; }
        var inner = findFirstShapeGroup(layer);
        if (!inner) { alert("Не найден контур в слое."); return; }
        var stroke = findStroke(inner);
        if (stroke) {
            stroke.remove();
        } else {
            var newStroke = inner.addProperty("ADBE Vector Graphic - Stroke");
            var fill = findFill(inner);
            var color = [1,1,1];
            if (fill) { try { color = fill.property("Color").value; } catch(e){} }
            newStroke.property("Color").setValue(color);
            newStroke.property("Stroke Width").setValue(6);
        }
    }

    function swapFillStroke(layer) {
        if (!(layer instanceof ShapeLayer)) { alert("Swap работает только с Shape слоями."); return; }
        var inner = findFirstShapeGroup(layer);
        if (!inner) { alert("Не найден контур в слое."); return; }
        var fill = findFill(inner);
        var stroke = findStroke(inner);
        if (!fill || !stroke) { alert("Нужны и Fill и Stroke в слое для Swap."); return; }
        try {
            var fc = fill.property("Color").value;
            var sc = stroke.property("Color").value;
            fill.property("Color").setValue(sc);
            stroke.property("Color").setValue(fc);
        } catch(e) { alert("Ошибка swap: " + e.toString()); }
    }

    // ============================================================
    // OUTLINE — рамка вокруг выделенного слоя с offset
    // ============================================================
    function createOutline(target, opts) {
        var comp = target.containingComp;
        var info = detectShapeKind(target);

        // итоговые размеры с учётом offset
        var w = info.w + opts.offset*2;
        var h = info.h + opts.offset*2;

        // итоговый corner radius
        var radius = opts.useAutoCorner ? (info.radius + opts.offset) : opts.cornerRadius;

        var outline = comp.layers.addShape();
        outline.name = target.name + "_Outline";

        var contents = outline.property("ADBE Root Vectors Group");
        var grp = contents.addProperty("ADBE Vector Group");
        grp.name = "OutlineGroup";
        var inner = grp.property("ADBE Vectors Group");

        var path;
        if (info.kind === "ellipse") {
            path = inner.addProperty("ADBE Vector Shape - Ellipse");
            path.property("Size").setValue([w, h]);
        } else if (info.kind === "polygon") {
            path = inner.addProperty("ADBE Vector Shape - Star");
            try {
                path.property("Type").setValue(2);
                path.property("Points").setValue(6);
                path.property("Outer Radius").setValue(Math.max(w,h)/2);
                path.property("Outer Roundness").setValue(radius);
            } catch(e){}
        } else {
            path = inner.addProperty("ADBE Vector Shape - Rect");
            path.property("Size").setValue([w, h]);
            try { path.property("Roundness").setValue(radius); } catch(e){}
        }

        var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("Color").setValue(opts.color);
        stroke.property("Stroke Width").setValue(opts.width);

        // позиция = позиция target
            try {
        outline.parent = target;
        outline.property("Transform").property("Position").setValue([0, 0]);
    } catch(e) {
        // если parent не удался — ставим в мировых координатах
        var tpos = target.property("Transform").property("Position").value;
        outline.property("Transform").property("Position").setValue([tpos[0], tpos[1]]);
    }


        // положить под target
        try { outline.moveAfter(target); } catch(e){}

        return outline;
    }

    // ============================================================
    // RING PULSE — расширяющийся контур-кольцо
    // ============================================================
       function createRing(target, opts) {
        var comp = target.containingComp;
        var info = detectShapeKind(target);

        // защита от undefined
        if (!info.w || info.w <= 0) info.w = 200;
        if (!info.h || info.h <= 0) info.h = 200;
        if (typeof info.radius !== "number") info.radius = 0;

        var radius = opts.useAutoCorner ? info.radius : (opts.cornerRadius || 0);

        var ring = comp.layers.addShape();
        ring.name = target.name + "_Ring";

        var contents = ring.property("ADBE Root Vectors Group");
        var grp = contents.addProperty("ADBE Vector Group");
        grp.name = "RingGroup";
        var inner = grp.property("ADBE Vectors Group");

        var path;
        if (info.kind === "ellipse") {
            path = inner.addProperty("ADBE Vector Shape - Ellipse");
            path.property("Size").setValue([info.w, info.h]);
        } else if (info.kind === "polygon") {
            path = inner.addProperty("ADBE Vector Shape - Star");
            try {
                path.property("Type").setValue(2);
                path.property("Points").setValue(6);
                path.property("Outer Radius").setValue(Math.max(info.w, info.h) / 2);
                path.property("Outer Roundness").setValue(radius);
            } catch(e){}
        } else {
            path = inner.addProperty("ADBE Vector Shape - Rect");
            path.property("Size").setValue([info.w, info.h]);
            try { path.property("Roundness").setValue(radius); } catch(e){}
        }

        var stroke = inner.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("Color").setValue(opts.color);
        stroke.property("Stroke Width").setValue(3);

        // позиция: если у target есть parent, берём абсолютную позицию через source point
        try {
    ring.parent = target;
    ring.property("Transform").property("Position").setValue([0, 0]);
} catch(e){
    var tposVal = [comp.width / 2, comp.height / 2];
    try {
        var tpos = target.property("Transform").property("Position").value;
        if (tpos && tpos.length >= 2) tposVal = [tpos[0], tpos[1]];
    } catch(e2) {}
    ring.property("Transform").property("Position").setValue(tposVal);
}


        try { ring.motionBlur = true; } catch(e){}

        // анимация
        var t0 = comp.time;
        var dur = opts.duration || 1.2;
        var cycle = dur + (opts.pause || 0);
        var reps = Math.max(1, opts.repeats || 1);
        var scaleMax = opts.scaleMax || 150;

        var scale = ring.property("Transform").property("Scale");
        var op = ring.property("Transform").property("Opacity");
        var sw = stroke.property("Stroke Width");

        for (var r = 0; r < reps; r++) {
            var t = t0 + r * cycle;
            try {
                scale.setValueAtTime(t, [100, 100]);
                scale.setValueAtTime(t + dur, [scaleMax, scaleMax]);
                op.setValueAtTime(t, 100);
                op.setValueAtTime(t + dur * 0.85, 0);
                op.setValueAtTime(t + dur, 0);
                sw.setValueAtTime(t, 3);
                sw.setValueAtTime(t + dur, 1);
            } catch(e) {}
        }

        setEaseOut(scale);
        setEaseOut(op);

        if (opts.loopForever) {
            try { scale.expression = 'loopOut("cycle")'; } catch(e){}
            try { op.expression = 'loopOut("cycle")'; } catch(e){}
            try { sw.expression = 'loopOut("cycle")'; } catch(e){}
        }

        try { ring.moveAfter(target); } catch(e){}
        return ring;
    }


    // ============================================================
    // POP BOUNCE
    // ============================================================
           function applyPopBounce(layer, opts) {
        var comp = layer.containingComp;
        var t0 = comp.time;
        var dur = opts.duration;
        var cycle = dur + opts.pause;
        var reps = Math.max(1, opts.repeats);

        var scale = layer.property("Transform").property("Scale");

        var base = [100, 100];
        try {
            var v = scale.value;
            if (v && v.length >= 2 && typeof v[0] === "number" && typeof v[1] === "number") {
                base = [v[0], v[1]];
            }
        } catch(e) {}

        try {
            if (scale.expression && scale.expression.length > 0) scale.expression = "";
        } catch(e) {}

        var amp = opts.amplitude || 107;

        for (var r = 0; r < reps; r++) {
            var t = t0 + r * cycle;
            try {
                scale.setValueAtTime(t, [base[0], base[1]]);
                scale.setValueAtTime(t + dur * 0.3, [base[0] * amp / 100, base[1] * amp / 100]);
                scale.setValueAtTime(t + dur, [base[0], base[1]]);
            } catch(e) {}
        }

        setEaseOut(scale);

        if (opts.loopForever) {
            try { scale.expression = 'loopOut("cycle")'; } catch(e){}
        }
    }



    // ============================================================
    // COLOR PULSE — анимация Stroke Color + Glow на обводке
    // ============================================================
    function applyColorPulse(layer, opts) {
        var inner = findFirstShapeGroup(layer);
        if (!inner) { alert("Color Pulse: не найден контур в слое."); return; }
        var stroke = findStroke(inner);
        if (!stroke) { alert("Color Pulse: в слое нет обводки. Добавь Stroke (Toggle Stroke) или используй Outline."); return; }

        var comp = layer.containingComp;
        var t0 = comp.time;
        var dur = opts.duration;
        var cycle = dur + opts.pause;
        var reps = Math.max(1, opts.repeats);

        // анимация цвета
        var colorProp = stroke.property("Color");
        for (var r=0; r<reps; r++) {
            var t = t0 + r*cycle;
            colorProp.setValueAtTime(t, opts.mainColor);
            colorProp.setValueAtTime(t + dur*0.2, opts.accentColor);
            colorProp.setValueAtTime(t + dur, opts.mainColor);
        }
        setEaseOut(colorProp);
        if (opts.loopForever) {
            try { colorProp.expression = 'loopOut("cycle")'; } catch(e){}
        }

        // опционально пульсация толщины
        if (opts.pulseWidth) {
            var sw = stroke.property("Stroke Width");
            var baseW = sw.value;
            for (var r2=0; r2<reps; r2++) {
                var t2 = t0 + r2*cycle;
                sw.setValueAtTime(t2, baseW);
                sw.setValueAtTime(t2 + dur*0.2, baseW + 2);
                sw.setValueAtTime(t2 + dur, baseW);
            }
            setEaseOut(sw);
            if (opts.loopForever) {
                try { sw.expression = 'loopOut("cycle")'; } catch(e){}
            }
        }

        // Glow на слой
        var fx = null;
        try { fx = layer.property("ADBE Effect Parade").addProperty("ADBE Glo2"); } catch(e1) {
            try { fx = layer.property("ADBE Effect Parade").addProperty("ADBE Glow"); } catch(e2){}
        }
        if (fx) {
            try {
                var cc = fx.property("Glow Colors");
                if (cc) cc.setValue(2);
                var ca = fx.property("Color A"); if (ca) ca.setValue(opts.accentColor);
                var cb = fx.property("Color B"); if (cb) cb.setValue(opts.accentColor);
            } catch(e){}
            var intensity = null;
            try { intensity = fx.property("Glow Intensity"); } catch(e){}
            if (intensity) {
                for (var r3=0; r3<reps; r3++) {
                    var t3 = t0 + r3*cycle;
                    intensity.setValueAtTime(t3, 0);
                    intensity.setValueAtTime(t3 + dur*0.2, opts.glowIntensity);
                    intensity.setValueAtTime(t3 + dur, 0);
                }
                setEaseOut(intensity);
                if (opts.loopForever) {
                    try { intensity.expression = 'loopOut("cycle")'; } catch(e){}
                }
            }
        }
    }

    // ============================================================
    // DROP SHADOW
    // ============================================================
    function applyDropShadow(layer) {
    try {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
        try { fx.property("ADBE Drop Shadow-0002").setValue(76); } catch(e){} // Opacity
        try { fx.property("ADBE Drop Shadow-0003").setValue(90); } catch(e){} // Direction
        try { fx.property("ADBE Drop Shadow-0004").setValue(4); }  catch(e){} // Distance
        try { fx.property("ADBE Drop Shadow-0005").setValue(20); } catch(e){} // Softness
    } catch(e){ alert("Не удалось добавить Drop Shadow."); }
}


    // ============================================================
    // D35 COMBO
    // ============================================================
    function applyD35Combo(layer, p) {
        app.beginUndoGroup("ShapeFX: D35 Combo");
        try {
            // 1. Outline вокруг
            var outline = createOutline(layer, {
                offset: p.outlineOffset,
                color: p.outlineColor,
                width: p.outlineWidth,
                useAutoCorner: true,
                cornerRadius: 0
            });

            // 2. Color Pulse на Outline (главный эффект)
            applyColorPulse(outline, {
                duration: 0.4,
                pause: p.pause + 1.1,
                mainColor: p.outlineColor,
                accentColor: D35_WHITE,
                glowIntensity: 120,
                pulseWidth: false,
                repeats: p.repeats,
                loopForever: p.loopForever
            });

            // 3. Pop Bounce на основной фигуре
            applyPopBounce(layer, {
                duration: 0.3,
                pause: p.pause + 1.2,
                amplitude: p.popAmp,
                repeats: p.repeats,
                loopForever: p.loopForever
            });

            // 4. Ring Pulse расширяющийся (исходя из размера outline)
            createRing(outline, {
                duration: 1.2,
                pause: p.pause + 0.3,
                color: p.outlineColor,
                scaleMax: p.scaleMax,
                useAutoCorner: true,
                cornerRadius: 0,
                repeats: p.repeats,
                loopForever: p.loopForever
            });
        } catch(e) {
            alert("D35 Combo error: " + e.toString());
        }
        app.endUndoGroup();
    }

    // ============================================================
    // ============================ UI ============================
    // ============================================================
    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel) ? thisObj :
                  new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION,
                  undefined, {resizeable:true, closeButton:true});

        win.bg = COL.bg;
        win.margins = 10;
        win.spacing = 5;
        win.orientation = "column";
        win.alignChildren = ["fill","top"];

        // header
        var header = win.add("group");
        header.orientation = "row";
        header.alignChildren = ["fill","center"];
        var titleTxt = header.add("statictext", undefined, SCRIPT_NAME + " " + SCRIPT_VERSION);
        try { titleTxt.graphics.foregroundColor = titleTxt.graphics.newPen(titleTxt.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1); } catch(e){}
        var helpBtn = header.add("button", undefined, "?");
        helpBtn.preferredSize = [26, 22];
        helpBtn.alignment = ["right","center"];
        addDivider(win);

        // STATE
        var state = {
            shapeSize: 300,
            cornerRadius: 20,
            strokeColor: D35_ACCENT.slice(),
            strokeWidth: 6,
            outlineOffset: 20,
            outlineColor: D35_ACCENT.slice(),
            outlineWidth: 4,
            outlineUseAuto: true,
            outlineCorner: 25,
            ringColor: D35_ACCENT.slice(),
            ringScaleMax: 150,
            ringUseAuto: true,
            ringCorner: 25,
            popAmp: 107,
            cpMain: D35_ACCENT.slice(),
            cpAccent: D35_WHITE.slice(),
            cpGlow: 100,
            cpDuration: 0.4,
            cpPulseWidth: false,
            pause: 0.5,
            repeats: 3,
            loopForever: true
        };

        // ===== CREATE SHAPE =====
        addSectionLabel(win, "CREATE SHAPE (stroke only)");
        var sr1 = win.add("group"); sr1.spacing=4; sr1.alignChildren=["fill","center"];
        var bRect = sr1.add("button", undefined, "▭ Rect");
        var bRound = sr1.add("button", undefined, "▢ Rounded");
        var sr2 = win.add("group"); sr2.spacing=4; sr2.alignChildren=["fill","center"];
        var bEllipse = sr2.add("button", undefined, "⬭ Ellipse");
        var bPoly = sr2.add("button", undefined, "⬡ Polygon");

        var sizeRow = win.add("group");
        sizeRow.add("statictext", undefined, "Size:");
        var sizeInput = sizeRow.add("edittext", undefined, "300");
        sizeInput.preferredSize = [50, 22];
        sizeRow.add("statictext", undefined, "px");
        sizeRow.add("statictext", undefined, "  Stroke:");
        var strokeSwatch = sizeRow.add("button", undefined, "");
        strokeSwatch.preferredSize = [24, 22];
        styleSwatch(strokeSwatch, state.strokeColor);
        sizeRow.add("statictext", undefined, "W:");
        var swInput = sizeRow.add("edittext", undefined, "6");
        swInput.preferredSize = [30, 22];

        var crRow = win.add("group");
        crRow.add("statictext", undefined, "Corner radius:");
        var crSlider = crRow.add("slider", undefined, 20, 0, 100);
        crSlider.preferredSize = [110, 20];
        var crVal = crRow.add("statictext", undefined, "20 px");
        crVal.preferredSize = [50,20];

        addDivider(win);

        // ===== FILL UTILS =====
        addSectionLabel(win, "FILL / STROKE UTILS (на выделенный)");
        var fu1 = win.add("group"); fu1.spacing=4; fu1.alignChildren=["fill","center"];
        var bAddFill = fu1.add("button", undefined, "Toggle Fill");
        var bSwap = fu1.add("button", undefined, "🔄 Swap F↔S");
        var fu2 = win.add("group"); fu2.spacing=4; fu2.alignChildren=["fill","center"];
        var bTogStroke = fu2.add("button", undefined, "Toggle Stroke");
        var bShadow = fu2.add("button", undefined, "+ Drop Shadow");

        addDivider(win);

        // ===== OUTLINE =====
        addSectionLabel(win, "OUTLINE (рамка вокруг с зазором)");
        var olR1 = win.add("group");
        olR1.add("statictext", undefined, "Offset:");
        var offSlider = olR1.add("slider", undefined, 20, 0, 100);
        offSlider.preferredSize = [110, 20];
        var offVal = olR1.add("statictext", undefined, "20 px");
        offVal.preferredSize = [50,20];

        var olR2 = win.add("group");
        olR2.add("statictext", undefined, "Color:");
        var olSwatch = olR2.add("button", undefined, "");
        olSwatch.preferredSize = [24, 22];
        styleSwatch(olSwatch, state.outlineColor);
        olR2.add("statictext", undefined, "W:");
        var olwInput = olR2.add("edittext", undefined, "4");
        olwInput.preferredSize = [30, 22];
        olR2.add("statictext", undefined, "  Corner:");
        var olAuto = olR2.add("checkbox", undefined, "auto");
        olAuto.value = true;

        var bOutline = win.add("button", undefined, "Create Outline around Selected");

        addDivider(win);

        // ===== RING PULSE =====
        addSectionLabel(win, "RING PULSE");
        var rpR1 = win.add("group");
        rpR1.add("statictext", undefined, "Color:");
        var ringSwatch = rpR1.add("button", undefined, "");
        ringSwatch.preferredSize = [24, 22];
        styleSwatch(ringSwatch, state.ringColor);
        rpR1.add("statictext", undefined, "  Max scale:");
        var scMaxInput = rpR1.add("edittext", undefined, "150");
        scMaxInput.preferredSize = [40, 22];
        rpR1.add("statictext", undefined, "%");
        var rpR2 = win.add("group");
        rpR2.add("statictext", undefined, "Corner:");
        var ringAuto = rpR2.add("checkbox", undefined, "auto");
        ringAuto.value = true;
        rpR2.add("statictext", undefined, "  Manual:");
        var ringCornerSlider = rpR2.add("slider", undefined, 25, 0, 100);
        ringCornerSlider.preferredSize = [80, 20];
        var ringCornerVal = rpR2.add("statictext", undefined, "25");
        ringCornerVal.preferredSize = [30,20];

        addDivider(win);

        // ===== POP BOUNCE =====
        addSectionLabel(win, "POP BOUNCE");
        var popRow = win.add("group");
        popRow.add("statictext", undefined, "Amplitude:");
        var popSlider = popRow.add("slider", undefined, 107, 102, 130);
        popSlider.preferredSize = [110, 20];
        var popVal = popRow.add("statictext", undefined, "107%");
        popVal.preferredSize = [50,20];

        addDivider(win);

        // ===== COLOR PULSE =====
        addSectionLabel(win, "COLOR PULSE (на обводку)");
        var cpR1 = win.add("group");
        cpR1.add("statictext", undefined, "Main:");
        var cpMainSw = cpR1.add("button", undefined, "");
        cpMainSw.preferredSize = [24, 22];
        styleSwatch(cpMainSw, state.cpMain);
        cpR1.add("statictext", undefined, "  Accent:");
        var cpAccSw = cpR1.add("button", undefined, "");
        cpAccSw.preferredSize = [24, 22];
        styleSwatch(cpAccSw, state.cpAccent);

        var cpR2 = win.add("group");
        cpR2.add("statictext", undefined, "Glow:");
        var glowSlider = cpR2.add("slider", undefined, 100, 0, 200);
        glowSlider.preferredSize = [80, 20];
        var glowVal = cpR2.add("statictext", undefined, "100");
        glowVal.preferredSize = [30,20];
        cpR2.add("statictext", undefined, "Dur:");
        var cpDurInput = cpR2.add("edittext", undefined, "0.4");
        cpDurInput.preferredSize = [40, 22];

        var cpWcheck = win.add("checkbox", undefined, "Pulse stroke width too (+2 px)");
        cpWcheck.value = false;

        addDivider(win);

        // ===== TIMING =====
        addSectionLabel(win, "TIMING");
        var pR = win.add("group");
        pR.add("statictext", undefined, "Pause:");
        var pauseSlider = pR.add("slider", undefined, 0.5, 0.0, 3.0);
        pauseSlider.preferredSize = [120, 20];
        var pauseVal = pR.add("statictext", undefined, "0.50s");
        pauseVal.preferredSize = [50,20];

        var repR = win.add("group");
        repR.add("statictext", undefined, "Repeats:");
        var repInput = repR.add("edittext", undefined, "3");
        repInput.preferredSize = [40, 22];
        var loopCheck = repR.add("checkbox", undefined, "Loop forever");
        loopCheck.value = true;

        addDivider(win);

        // ===== APPLY =====
        addSectionLabel(win, "APPLY (на выделенный)");
        var apR1 = win.add("group"); apR1.spacing=4; apR1.alignChildren=["fill","center"];
        var bRing = apR1.add("button", undefined, "Ring Pulse");
        var bPop = apR1.add("button", undefined, "Pop Bounce");
        var apR2 = win.add("group"); apR2.spacing=4; apR2.alignChildren=["fill","center"];
        var bColorPulse = apR2.add("button", undefined, "Color Pulse");
        var bOutlineAlt = apR2.add("button", undefined, "Outline");

        var bCombo = win.add("button", undefined, "★ Apply D35 Combo");

        // ============================================================
        // HANDLERS
        // ============================================================
        function readState() {
            state.shapeSize = parseInt(sizeInput.text) || 300;
            state.cornerRadius = crSlider.value;
            state.strokeWidth = parseFloat(swInput.text) || 6;
            state.outlineOffset = offSlider.value;
            state.outlineWidth = parseFloat(olwInput.text) || 4;
            state.outlineUseAuto = olAuto.value;
            state.ringScaleMax = parseFloat(scMaxInput.text) || 150;
            state.ringUseAuto = ringAuto.value;
            state.ringCorner = ringCornerSlider.value;
            state.popAmp = popSlider.value;
            state.cpGlow = glowSlider.value;
            state.cpDuration = parseFloat(cpDurInput.text) || 0.4;
            state.cpPulseWidth = cpWcheck.value;
            state.pause = pauseSlider.value;
            state.repeats = parseInt(repInput.text) || 3;
            state.loopForever = loopCheck.value;
        }

        crSlider.onChanging = function(){ crVal.text = Math.round(crSlider.value) + " px"; };
        offSlider.onChanging = function(){ offVal.text = Math.round(offSlider.value) + " px"; };
        popSlider.onChanging = function(){ popVal.text = Math.round(popSlider.value) + "%"; };
        glowSlider.onChanging = function(){ glowVal.text = Math.round(glowSlider.value); };
        pauseSlider.onChanging = function(){ pauseVal.text = pauseSlider.value.toFixed(2) + "s"; };
        ringCornerSlider.onChanging = function(){ ringCornerVal.text = Math.round(ringCornerSlider.value); };

        function pickColor(swatch, key) {
            return function() {
                var hex = rgbToHex(state[key]);
                var picked = $.colorPicker(parseInt(hex.replace("#",""),16));
                if (picked < 0) return;
                var r = (picked >> 16) & 0xFF;
                var g = (picked >> 8) & 0xFF;
                var b = picked & 0xFF;
                state[key] = [r/255, g/255, b/255];
                styleSwatch(swatch, state[key]);
            };
        }
        strokeSwatch.onClick = pickColor(strokeSwatch, "strokeColor");
        olSwatch.onClick     = pickColor(olSwatch, "outlineColor");
        ringSwatch.onClick   = pickColor(ringSwatch, "ringColor");
        cpMainSw.onClick     = pickColor(cpMainSw, "cpMain");
        cpAccSw.onClick      = pickColor(cpAccSw, "cpAccent");

        // create shape
        function createShape(shape) {
            var c = getComp(); if (!c) return;
            readState();
            app.beginUndoGroup("ShapeFX: Create " + shape);
            var L = createBaseShape(c, {
                shape: shape,
                size: state.shapeSize,
                cornerRadius: state.cornerRadius,
                strokeColor: state.strokeColor,
                strokeWidth: state.strokeWidth
            });
            for (var i=1; i<=c.numLayers; i++) c.layer(i).selected = false;
            L.selected = true;
            app.endUndoGroup();
        }
        bRect.onClick = function(){ 
    var savedCR = state.cornerRadius;
    state.cornerRadius = 0;
    createShape("rect");
    state.cornerRadius = savedCR;
};
        bRound.onClick   = function(){ createShape("rounded"); };
        bEllipse.onClick = function(){ createShape("ellipse"); };
        bPoly.onClick    = function(){ createShape("polygon"); };

        // fill utils
        bAddFill.onClick = function() {
            var L = getSelLayer(); if (!L) { alert("Выделите Shape слой."); return; }
            app.beginUndoGroup("ShapeFX: Toggle Fill");
            toggleFill(L);
            app.endUndoGroup();
        };
        bTogStroke.onClick = function() {
            var L = getSelLayer(); if (!L) { alert("Выделите Shape слой."); return; }
            app.beginUndoGroup("ShapeFX: Toggle Stroke");
            toggleStroke(L);
            app.endUndoGroup();
        };
        bSwap.onClick = function() {
            var L = getSelLayer(); if (!L) { alert("Выделите Shape слой."); return; }
            app.beginUndoGroup("ShapeFX: Swap F↔S");
            swapFillStroke(L);
            app.endUndoGroup();
        };
        bShadow.onClick = function() {
            var L = getSelLayer(); if (!L) { alert("Выделите слой."); return; }
            app.beginUndoGroup("ShapeFX: Drop Shadow");
            applyDropShadow(L);
            app.endUndoGroup();
        };

        // outline
        function doOutline() {
            var L = getSelLayer(); if (!L) { alert("Выделите слой."); return; }
            readState();
            app.beginUndoGroup("ShapeFX: Create Outline");
            createOutline(L, {
                offset: state.outlineOffset,
                color: state.outlineColor,
                width: state.outlineWidth,
                useAutoCorner: state.outlineUseAuto,
                cornerRadius: state.ringCorner // используем тот же manual slider
            });
            app.endUndoGroup();
        }
        bOutline.onClick = doOutline;
        bOutlineAlt.onClick = doOutline;

        bRing.onClick = function() {
            var L = getSelLayer(); if (!L) { alert("Выделите слой."); return; }
            readState();
            app.beginUndoGroup("ShapeFX: Ring Pulse");
            createRing(L, {
                duration: 1.2,
                pause: state.pause,
                color: state.ringColor,
                scaleMax: state.ringScaleMax,
                useAutoCorner: state.ringUseAuto,
                cornerRadius: state.ringCorner,
                repeats: state.repeats,
                loopForever: state.loopForever
            });
            app.endUndoGroup();
        };

        bPop.onClick = function() {
            var L = getSelLayer(); if (!L) { alert("Выделите слой."); return; }
            readState();
            app.beginUndoGroup("ShapeFX: Pop Bounce");
            applyPopBounce(L, {
                duration: 0.3,
                pause: state.pause + 0.9,
                amplitude: state.popAmp,
                repeats: state.repeats,
                loopForever: state.loopForever
            });
            app.endUndoGroup();
        };

        bColorPulse.onClick = function() {
            var L = getSelLayer(); if (!L) { alert("Выделите Shape слой с обводкой."); return; }
            readState();
            app.beginUndoGroup("ShapeFX: Color Pulse");
            applyColorPulse(L, {
                duration: state.cpDuration,
                pause: state.pause + (1.2 - state.cpDuration),
                mainColor: state.cpMain,
                accentColor: state.cpAccent,
                glowIntensity: state.cpGlow,
                pulseWidth: state.cpPulseWidth,
                repeats: state.repeats,
                loopForever: state.loopForever
            });
            app.endUndoGroup();
        };

        bCombo.onClick = function() {
            var L = getSelLayer(); if (!L) { alert("Выделите слой."); return; }
            readState();
            applyD35Combo(L, state);
        };

        helpBtn.onClick = showHelp;

        win.layout.layout(true);
        if (win instanceof Window) { win.center(); win.show(); }
        return win;
    }

    function addDivider(parent) {
        var d = parent.add("panel");
        d.preferredSize.height = 1;
        d.alignment = ["fill","top"];
    }
    function addSectionLabel(parent, text) {
        var t = parent.add("statictext", undefined, text);
        try { t.graphics.foregroundColor = t.graphics.newPen(t.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1); } catch(e){}
    }
    function styleSwatch(btn, rgb) {
        try {
            btn.fillBrush = btn.graphics.newBrush(btn.graphics.BrushType.SOLID_COLOR, [rgb[0], rgb[1], rgb[2], 1]);
            btn.onDraw = function() {
                btn.graphics.drawOSControl();
                btn.graphics.rectPath(2,2,btn.size.width-4, btn.size.height-4);
                btn.graphics.fillPath(btn.fillBrush);
            };
        } catch(e){}
    }

    function showHelp() {
        var w = new Window("dialog", "ptp_ShapeFX — Справка", undefined, {resizeable:true});
        w.preferredSize = [580, 640];
        w.margins = 12;
        var txt = w.add("edittext", undefined, getHelpText(), {multiline:true, scrolling:true, readonly:true});
        txt.preferredSize = [560, 560];
        var btn = w.add("button", undefined, "Закрыть");
        btn.onClick = function(){ w.close(); };
        w.center(); w.show();
    }

    function getHelpText() {
        return [
            "ptp_ShapeFX v1.1 — outline-centric архитектура",
            "═════════════════════════════════════════════════",
            "",
            "ИДЕОЛОГИЯ",
            "Главный элемент эффекта — отдельный слой Outline (рамка",
            "вокруг фигуры с зазором). На него навешиваются все цветовые",
            "и пульсирующие эффекты. Основная фигура остаётся стабильной",
            "и получает только Pop Bounce + опосредованное свечение от",
            "Glow обводки.",
            "",
            "═══ CREATE SHAPE ═══",
            "Создаёт фигуру БЕЗ заливки, только с обводкой.",
            "  ▭ Rect / ▢ Rounded / ⬭ Ellipse / ⬡ Polygon",
            "  Size — сторона/диаметр в px",
            "  Corner radius — слайдер 0–100 px (работает для всех форм,",
            "    у Polygon мапится на Outer Roundness)",
            "  Stroke — цвет и толщина обводки",
            "",
            "═══ FILL / STROKE UTILS ═══",
            "  Toggle Fill   — добавить/убрать заливку выделенному слою",
            "  Toggle Stroke — добавить/убрать обводку",
            "  🔄 Swap F↔S   — поменять местами цвета Fill и Stroke",
            "  + Drop Shadow — мягкая тень (offset 0/4, blur 20, op 30%)",
            "",
            "═══ OUTLINE (рамка-вокруг) ═══",
            "Создаёт второй Shape Layer, повторяющий форму выделенного",
            "слоя, увеличенный на Offset с каждой стороны.",
            "  Offset — зазор между фигурой и обводкой (px)",
            "  Color  — цвет обводки",
            "  W      — толщина обводки",
            "  Corner auto — если вкл, скругление = radius_фигуры + offset",
            "                (математически правильно, углы остаются",
            "                концентричными как в Figma)",
            "Outline линкуется через Parent к фигуре — двигается вместе.",
            "",
            "═══ RING PULSE ═══",
            "Создаёт расширяющийся контур (Scale 100→150% + Opacity",
            "100→0). Форма повторяет выделенный слой. Цикл 1.2с.",
            "  Color     — цвет кольца",
            "  Max scale — на сколько % расширяется",
            "  Corner auto — наследовать скругление от выделенного слоя",
            "",
            "═══ POP BOUNCE ═══",
            "Лёгкое подпрыгивание Scale 100→amp→100 с easeOutBack.",
            "  Amplitude — пик (107% = D35, 130% максимум)",
            "",
            "═══ COLOR PULSE (вместо Flash) ═══",
            "Не меняет размер обводки. Анимирует ЦВЕТ stroke:",
            "  Main → Accent → Main за Duration секунд.",
            "Параллельно эффект Glow с пульсацией Intensity 0→max→0.",
            "Свечение от Glow попадает и на фигуру внутри Outline.",
            "  Pulse stroke width too — опц. добавить +2 px пульсацию",
            "",
            "═══ TIMING ═══",
            "  Pause — пауза между циклами повторов (0.0–3.0с)",
            "          0.0  непрерывный нервный ритм",
            "          0.5  спокойное дыхание (D35)",
            "          1.0+ редкое привлечение внимания",
            "  Repeats — сколько повторов keyframes (1–8)",
            "  Loop forever — добавить loopOut(\"cycle\") сверх ключей",
            "",
            "═══ APPLY ═══",
            "  Ring Pulse / Pop Bounce / Color Pulse / Outline —",
            "  применить отдельный эффект к выделенному слою.",
            "",
            "  ★ Apply D35 Combo:",
            "    1. Создаёт Outline вокруг выделенной фигуры",
            "    2. Color Pulse на Outline (Main → White → Main)",
            "    3. Pop Bounce на основную фигуру",
            "    4. Ring Pulse расширяющийся из Outline",
            "    Все эффекты синхронизированы и зациклены.",
            "",
            "═══ WORKFLOW ═══",
            "Вариант A (с нуля):",
            "  1. Жми ▭/▢/⬭/⬡ — создаётся фигура с обводкой",
            "  2. Жми ★ Apply D35 Combo — готово",
            "",
            "Вариант B (на свой слой):",
            "  1. Выдели Shape слой со stroke",
            "  2. Жми ★ Apply D35 Combo или нужный отдельный эффект",
            "",
            "═══ СОВЕТЫ ═══",
            "• Перед применением поставь CTI в начало анимации.",
            "• Если ColorPulse говорит «нет обводки» — нажми Toggle",
            "  Stroke сначала или сделай Swap F↔S.",
            "• Чтобы остановить loopOut — удали expression в timeline.",
            "• Outline линкован Parent — двигай фигуру, рамка едет с ней.",
            "",
            "═══ ОГРАНИЧЕНИЯ v1.1 ═══",
            "• Auto-detect формы работает для shape-слоёв с одним",
            "  rect/ellipse/star контуром. Footage/Solid → rect-fallback.",
            "• Glow matchName может отличаться в разных версиях AE",
            "  ('ADBE Glo2' / 'ADBE Glow') — есть fallback.",
            "",
            "ptp_ShapeFX v1.1 — D35 Ring Pulse Combo"
        ].join("\n");
    }

    buildUI(thisObj);

})(this);
