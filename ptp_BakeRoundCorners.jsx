// ptp_BakeRoundCorners.jsx
// v1.0.1 — Физическое скругление углов пути
// Установка: ScriptUI Panels → Window → ptp_BakeRoundCorners.jsx

{
    var BC_Data = {
        scriptName:    "ptp_BakeRoundCorners",
        scriptVersion: "v1.0.1",
        scriptTitle:   "",
        defaultRadius: 20,
        presets:       [0, 5, 10, 20, 30, 40],
        col: {
            bg:      [0.13, 0.13, 0.13, 1.0],
            panel:   [0.18, 0.18, 0.18, 1.0],
            accent:  [1.00, 0.80, 0.10, 1.0],
            text:    [0.90, 0.90, 0.90, 1.0],
            muted:   [0.60, 0.60, 0.60, 1.0],
            divider: [0.28, 0.28, 0.28, 1.0]
        }
    };
    BC_Data.scriptTitle = BC_Data.scriptName + " " + BC_Data.scriptVersion;

    if (parseFloat(app.version) < 8.0) {
        alert("This script requires After Effects CS3 or later.", BC_Data.scriptTitle);
    } else {
        var thisObj = this;
        var win = buildUI(thisObj);
        if (win !== null && win !== undefined) {
            if (win instanceof Window) {
                win.center();
                win.show();
            } else {
                win.layout.layout(true);
                win.layout.resize();
            }
        }
    }

    function buildUI(thisObj) {
        var pal;
        if (thisObj instanceof Panel) {
            pal = thisObj;
        } else {
            pal = new Window("palette", BC_Data.scriptTitle, undefined, {resizeable: true});
        }

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 8;
        pal.margins = 14;
        pal.preferredSize.width = 340;

        try {
            pal.graphics.backgroundColor = pal.graphics.newBrush(
                pal.graphics.BrushType.SOLID_COLOR, BC_Data.col.bg);
        } catch (eBg) {}

        // ============ Header ============
        var header = pal.add("group");
        header.orientation = "row";
        header.alignment = ["fill", "top"];
        header.alignChildren = ["left", "center"];
        header.spacing = 8;

        var iconLabel = header.add("statictext", undefined, "\u25C6");
        styleText(iconLabel, BC_Data.col.accent, 18, true);

        var titleLabel = header.add("statictext", undefined, "BAKE ROUND CORNERS");
        styleText(titleLabel, BC_Data.col.text, 12, true);

        var spacer = header.add("statictext", undefined, "");
        spacer.alignment = ["fill", "center"];

        var verLabel = header.add("statictext", undefined, BC_Data.scriptVersion);
        styleText(verLabel, BC_Data.col.muted, 10, false);

        var helpBtn = header.add("button", undefined, "?");
        helpBtn.preferredSize = [26, 24];
        helpBtn.alignment = ["right", "center"];

        addDivider(pal);

        // ============ Quick Presets ============
        var presetLabel = pal.add("statictext", undefined, "\u25B8  QUICK PRESETS");
        styleText(presetLabel, BC_Data.col.muted, 10, true);

        var presetGroup = pal.add("group");
        presetGroup.orientation = "row";
        presetGroup.alignment = ["fill", "top"];
        presetGroup.alignChildren = ["fill", "center"];
        presetGroup.spacing = 4;
        presetGroup.margins = [0, 4, 0, 4];

        var presetButtons = [];
        var i;
        for (i = 0; i < BC_Data.presets.length; i++) {
            var val = BC_Data.presets[i];
            var b = presetGroup.add("button", undefined, String(val));
            b.preferredSize = [44, 30];
            b.minimumSize   = [44, 30];
            b._radiusValue  = val;
            presetButtons.push(b);
        }

        addDivider(pal);

        // ============ Scope ============
        var scopeLabel = pal.add("statictext", undefined, "\u25B8  SCOPE");
        styleText(scopeLabel, BC_Data.col.muted, 10, true);

        var scopeGroup = pal.add("group");
        scopeGroup.orientation = "row";
        scopeGroup.alignment = ["fill", "top"];
        scopeGroup.alignChildren = ["left", "center"];
        scopeGroup.margins = [4, 4, 4, 4];
        scopeGroup.spacing = 16;

        var rbAll = scopeGroup.add("radiobutton", undefined, "All groups");
        var rbSel = scopeGroup.add("radiobutton", undefined, "Selected only");
        rbAll.value = true;
        styleText(rbAll, BC_Data.col.text, 11, false);
        styleText(rbSel, BC_Data.col.text, 11, false);

        addDivider(pal);

        // ============ Custom radius ============
        var customLabel = pal.add("statictext", undefined, "\u25B8  CUSTOM RADIUS");
        styleText(customLabel, BC_Data.col.muted, 10, true);

        var customGroup = pal.add("group");
        customGroup.orientation = "row";
        customGroup.alignment = ["fill", "top"];
        customGroup.alignChildren = ["fill", "center"];
        customGroup.margins = [4, 4, 4, 4];
        customGroup.spacing = 8;

        var radiusInput = customGroup.add("edittext", undefined, String(BC_Data.defaultRadius));
        radiusInput.characters = 6;
        radiusInput.preferredSize.height = 28;

        var bakeBtn = customGroup.add("button", undefined, "BAKE");
        bakeBtn.preferredSize = [100, 28];

        addDivider(pal);

        // ============ Mode ============
        var modeLabel = pal.add("statictext", undefined, "\u25B8  MODE");
        styleText(modeLabel, BC_Data.col.muted, 10, true);

        var modeGroup = pal.add("group");
        modeGroup.orientation = "column";
        modeGroup.alignment = ["fill", "top"];
        modeGroup.alignChildren = ["left", "center"];
        modeGroup.margins = [4, 4, 4, 4];
        modeGroup.spacing = 4;

        var modeBakeRb   = modeGroup.add("radiobutton", undefined, "Bake \u2014 physically add points");
        var modeFilterRb = modeGroup.add("radiobutton", undefined, "Filter \u2014 Round Corners modifier");
        modeBakeRb.value = true;
        styleText(modeBakeRb,   BC_Data.col.text, 11, false);
        styleText(modeFilterRb, BC_Data.col.text, 11, false);

        var infoText = pal.add("statictext", undefined,
            "Bake replaces sharp corners with real bezier curves.\nFilter only adds a non-destructive modifier.",
            {multiline: true});
        infoText.preferredSize.height = 28;
        styleText(infoText, BC_Data.col.muted, 10, false);

        helpBtn.onClick = function () {
            showHelp();
        };

        var j;
        for (j = 0; j < presetButtons.length; j++) {
            attachPresetHandler(presetButtons[j], radiusInput, rbSel, modeBakeRb);
        }

        bakeBtn.onClick = function () {
            var v = parseFloat(radiusInput.text);
            if (isNaN(v) || v < 0) {
                alert("Please enter a valid non-negative number.", BC_Data.scriptTitle);
                return;
            }
            runApply(v, rbSel.value, modeBakeRb.value);
        };

        pal.onResizing = function () { this.layout.resize(); };
        pal.onResize   = function () { this.layout.resize(); };

        return pal;
    }

    function attachPresetHandler(btn, radiusInput, rbSel, modeBakeRb) {
        btn.onClick = function () {
            radiusInput.text = String(btn._radiusValue);
            runApply(btn._radiusValue, rbSel.value, modeBakeRb.value);
        };
    }

    function styleText(elem, color, size, bold) {
        try {
            var g = elem.graphics;
            elem.graphics.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, color, 1);
            var fontFamily = "Tahoma";
            var style;
            if (bold) {
                style = ScriptUI.FontStyle.BOLD;
            } else {
                style = ScriptUI.FontStyle.REGULAR;
            }
            elem.graphics.font = ScriptUI.newFont(fontFamily, style, size);
        } catch (e) {}
    }

    function addDivider(parent) {
        var d = parent.add("panel", undefined, "");
        d.alignment = ["fill", "top"];
        d.preferredSize = [-1, 1];
        try {
            d.graphics.backgroundColor = d.graphics.newBrush(
                d.graphics.BrushType.SOLID_COLOR, BC_Data.col.divider);
        } catch (e) {}
    }

    function runApply(radiusValue, scopeSelected, bakeMode) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Please open a composition first.", BC_Data.scriptTitle);
            return;
        }

        var selectedLayers = comp.selectedLayers;
        if (selectedLayers.length === 0) {
            alert("Please select at least one Shape Layer.", BC_Data.scriptTitle);
            return;
        }

        var label;
        if (bakeMode) { label = "Bake "; } else { label = "Filter "; }
        app.beginUndoGroup(BC_Data.scriptName + ": " + label + radiusValue);

        var shapeCount = 0;
        var i;
        for (i = 0; i < selectedLayers.length; i++) {
            var layer = selectedLayers[i];
            if (!(layer instanceof ShapeLayer)) continue;
            shapeCount++;

            var contents = layer.property("ADBE Root Vectors Group");
            if (contents === null || contents === undefined) continue;

            if (bakeMode) {
                bakeGroup(contents, radiusValue, scopeSelected);
            } else {
                applyFilterGroup(contents, radiusValue, scopeSelected);
            }
        }

        app.endUndoGroup();

        if (shapeCount === 0) {
            alert("No Shape Layers in selection.", BC_Data.scriptTitle);
        }
    }

    function bakeGroup(group, radius, scopeSelected) {
        var i;
        for (i = 1; i <= group.numProperties; i++) {
            var prop = group.property(i);
            if (prop === null || prop === undefined) continue;

            if (prop.matchName === "ADBE Vector Group") {
                if (scopeSelected && !prop.selected) {
                    var inner = prop.property("ADBE Vectors Group");
                    if (inner !== null && inner !== undefined) {
                        bakeGroup(inner, radius, scopeSelected);
                    }
                    continue;
                }
                var contents = prop.property("ADBE Vectors Group");
                if (contents !== null && contents !== undefined) {
                    bakePathsInGroup(contents, radius);
                }
            }
        }
    }

    function bakePathsInGroup(contents, radius) {
        var i;
        for (i = 1; i <= contents.numProperties; i++) {
            var p = contents.property(i);
            if (p === null || p === undefined) continue;

            if (p.matchName === "ADBE Vector Shape - Group") {
                var pathProp = p.property("ADBE Vector Shape");
                if (pathProp !== null && pathProp !== undefined) {
                    bakePath(pathProp, radius);
                }
            }
            if (p.matchName === "ADBE Vector Shape") {
                bakePath(p, radius);
            }
        }
    }

    function bakePath(pathProp, radius) {
        var shape;
        try { shape = pathProp.value; } catch (e) { return false; }
        if (shape === null || shape === undefined) return false;

        var V  = shape.vertices;
        var iT = shape.inTangents;
        var oT = shape.outTangents;
        if (V === null || V === undefined || V.length < 3) return false;

        var isClosed = shape.closed;
        var n = V.length;

        var newV   = [];
        var newIn  = [];
        var newOut = [];
        var i;

        for (i = 0; i < n; i++) {
            if (!isClosed && (i === 0 || i === n - 1)) {
                newV.push([V[i][0], V[i][1]]);
                newIn.push([iT[i][0], iT[i][1]]);
                newOut.push([oT[i][0], oT[i][1]]);
                continue;
            }

            var prevIdx = (i - 1 + n) % n;
            var nextIdx = (i + 1) % n;

            var P0 = V[prevIdx];
            var P  = V[i];
            var P1 = V[nextIdx];

            var v1x = P0[0] - P[0];
            var v1y = P0[1] - P[1];
            var v2x = P1[0] - P[0];
            var v2y = P1[1] - P[1];

            var len1 = Math.sqrt(v1x * v1x + v1y * v1y);
            var len2 = Math.sqrt(v2x * v2x + v2y * v2y);

            if (len1 === 0 || len2 === 0) {
                newV.push([P[0], P[1]]);
                newIn.push([0, 0]);
                newOut.push([0, 0]);
                continue;
            }

            var rMax1 = len1 / 2;
            var rMax2 = len2 / 2;
            var r = radius;
            if (r > rMax1) r = rMax1;
            if (r > rMax2) r = rMax2;

            var A = [P[0] + (v1x / len1) * r, P[1] + (v1y / len1) * r];
            var B = [P[0] + (v2x / len2) * r, P[1] + (v2y / len2) * r];

            var kappa = 0.5522847498;
            var handle = r * kappa;

            var outA = [-(v1x / len1) * handle, -(v1y / len1) * handle];
            var inB  = [-(v2x / len2) * handle, -(v2y / len2) * handle];

            newV.push(A);
            newIn.push([0, 0]);
            newOut.push(outA);

            newV.push(B);
            newIn.push(inB);
            newOut.push([0, 0]);
        }

        var newShape = new Shape();
        newShape.vertices    = newV;
        newShape.inTangents  = newIn;
        newShape.outTangents = newOut;
        newShape.closed      = isClosed;

        try {
            pathProp.setValue(newShape);
            return true;
        } catch (eS) {
            return false;
        }
    }

    function applyFilterGroup(group, radius, scopeSelected) {
        var i;
        for (i = 1; i <= group.numProperties; i++) {
            var prop = group.property(i);
            if (prop === null || prop === undefined) continue;
            if (prop.matchName === "ADBE Vector Group") {
                if (scopeSelected && !prop.selected) {
                    var inner = prop.property("ADBE Vectors Group");
                    if (inner !== null && inner !== undefined) {
                        applyFilterGroup(inner, radius, scopeSelected);
                    }
                    continue;
                }
                var contents = prop.property("ADBE Vectors Group");
                if (contents !== null && contents !== undefined) {
                    addOrUpdateRC(contents, radius);
                }
            }
        }
    }

    function addOrUpdateRC(contents, radius) {
        var existing = null;
        var i;
        for (i = 1; i <= contents.numProperties; i++) {
            var p = contents.property(i);
            if (p !== null && p !== undefined && p.matchName === "ADBE Vector Filter - RC") {
                existing = p;
                break;
            }
        }
        var rc = existing;
        if (rc === null) {
            try { rc = contents.addProperty("ADBE Vector Filter - RC"); } catch (e) { return; }
        }
        if (rc === null || rc === undefined) return;
        var rad = rc.property("ADBE Vector RoundCorner Radius");
        if (rad !== null && rad !== undefined) {
            try { rad.setValue(radius); } catch (e2) {}
        }
    }

    function showHelp() {
        var hw = new Window("dialog", BC_Data.scriptTitle + " - Help");
        hw.orientation = "column";
        hw.alignChildren = ["fill", "top"];
        hw.margins = 14;
        hw.spacing = 10;
        try {
            hw.graphics.backgroundColor = hw.graphics.newBrush(
                hw.graphics.BrushType.SOLID_COLOR, BC_Data.col.bg);
        } catch (e) {}

        var helpText =
            "ptp_BakeRoundCorners " + BC_Data.scriptVersion + "\n\n" +
            "TWO MODES:\n\n" +
            "BAKE (default)\n" +
            "  Physically replaces each sharp corner with two new\n" +
            "  bezier points, creating a real curved arc.\n" +
            "  - Vertex count increases (1 corner -> 2 points).\n" +
            "  - Path data is modified.\n" +
            "  - Works for motion paths, Lottie export, editing.\n\n" +
            "FILTER\n" +
            "  Adds 'Round Corners' modifier - visual only.\n" +
            "  - Original vertex count stays the same.\n" +
            "  - Non-destructive.\n\n" +
            "SCOPE:\n" +
            "  - All groups: every shape group in selected layers.\n" +
            "  - Selected only: only groups marked in Contents.\n\n" +
            "NOTE: Bake skips endpoints of open paths.\n" +
            "Radius is auto-clamped to half the shortest segment.";

        var t = hw.add("statictext", undefined, helpText, {multiline: true});
        styleText(t, BC_Data.col.text, 11, false);
        t.preferredSize.width = 440;
        t.preferredSize.height = 320;

        var ok = hw.add("button", undefined, "OK", {name: "ok"});
        ok.preferredSize = [80, 28];
        ok.alignment = ["right", "bottom"];
        ok.onClick = function () { hw.close(); };

        hw.center();
        hw.show();
    }
}
