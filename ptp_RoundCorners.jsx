// ptp_RoundCorners.jsx
// v2.3 — Round Corners для Shape Layers с пресетами и выбором scope
// Установка: ScriptUI Panels → Window → ptp_RoundCorners.jsx

(function ptp_RoundCorners(thisObj) {

    var RC_Data = {
        scriptName:    "ptp_RoundCorners",
        scriptVersion: "v2.3",
        scriptTitle:   "",
        defaultRadius: 20,
        presets:       [0, 5, 10, 20, 30, 40],
        strHelpBtn1Url: "http://aescripts.com/pt_shiftlayers/",
        strHelpBtn2Url: "http://aescripts.com/category/scripts/paul-tuersley/"
    };
    RC_Data.scriptTitle = RC_Data.scriptName + " " + RC_Data.scriptVersion;

    if (parseFloat(app.version) < 8.0) {
        alert("This script requires After Effects CS3 or later.", RC_Data.scriptTitle);
        return;
    }

    var win = buildUI(thisObj);
    if (win != null) {
        if (win instanceof Window) {
            win.center();
            win.show();
        } else {
            win.layout.layout(true);
            win.layout.resize();
        }
    }

    // ============================================================
    // UI
    // ============================================================
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", RC_Data.scriptTitle, undefined, {resizeable: true});

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 10;
        pal.margins = 12;
        pal.preferredSize.width = 320;   // минимальная ширина панели

        // --- Заголовок ---
        var titleGroup = pal.add("group");
        titleGroup.orientation = "row";
        titleGroup.alignment = ["fill", "top"];
        titleGroup.alignChildren = ["left", "center"];
        var titleText = titleGroup.add("statictext", undefined, "Round Corners");
        titleText.alignment = ["left", "center"];
        var helpBtn = titleGroup.add("button", undefined, "?");
        helpBtn.preferredSize = [28, 26];
        helpBtn.alignment = ["right", "center"];

        // --- Quick Presets ---
        var presetsPanel = pal.add("panel", undefined, "Quick presets");
        presetsPanel.orientation = "row";
        presetsPanel.alignChildren = ["fill", "center"];
        presetsPanel.alignment = ["fill", "top"];
        presetsPanel.margins = 10;
        presetsPanel.spacing = 6;

        var presetButtons = [];
        for (var i = 0; i < RC_Data.presets.length; i++) {
            var val = RC_Data.presets[i];
            var b = presetsPanel.add("button", undefined, String(val));
            b.preferredSize = [-1, 28];
            b.minimumSize  = [36, 28];
            b.alignment = ["fill", "center"];
            b._radiusValue = val;
            presetButtons.push(b);
        }

        // --- Scope ---
        var scopePanel = pal.add("panel", undefined, "Scope");
        scopePanel.orientation = "row";
        scopePanel.alignChildren = ["left", "center"];
        scopePanel.alignment = ["fill", "top"];
        scopePanel.margins = 10;
        scopePanel.spacing = 12;
        var rbAll = scopePanel.add("radiobutton", undefined, "All groups");
        var rbSel = scopePanel.add("radiobutton", undefined, "Selected only (1)");
        rbAll.value = true;

        // --- Custom Radius ---
        var customGroup = pal.add("group");
        customGroup.orientation = "row";
        customGroup.alignChildren = ["left", "center"];
        customGroup.alignment = ["fill", "top"];
        customGroup.spacing = 8;
        customGroup.add("statictext", undefined, "Radius:");
        var radiusInput = customGroup.add("edittext", undefined, String(RC_Data.defaultRadius));
        radiusInput.characters = 6;
        radiusInput.preferredSize.height = 26;
        var applyBtn = customGroup.add("button", undefined, "Apply");
        applyBtn.preferredSize = [80, 28];

        // --- Remove ---
        var removeBtn = pal.add("button", undefined, "Remove Round Corners");
        removeBtn.preferredSize = [-1, 30];
        removeBtn.alignment = ["fill", "top"];

        // ---------- Обработчики ----------
        helpBtn.onClick = function () { showHelp(); };

        for (var j = 0; j < presetButtons.length; j++) {
            (function (btn) {
                btn.onClick = function () {
                    radiusInput.text = String(btn._radiusValue);
                    runApply(btn._radiusValue, rbSel.value);
                };
            })(presetButtons[j]);
        }

        applyBtn.onClick = function () {
            var v = parseFloat(radiusInput.text);
            if (isNaN(v) || v < 0) {
                alert("Please enter a valid non-negative number.", RC_Data.scriptTitle);
                return;
            }
            runApply(v, rbSel.value);
        };

        removeBtn.onClick = function () {
            runRemove(rbSel.value);
        };

        // Принудительный пересчёт layout
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };

        return pal;
    }

    // ============================================================
    // Применение
    // ============================================================
    function runApply(radiusValue, scopeSelected) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Please open a composition first.", RC_Data.scriptTitle);
            return;
        }

        var selectedLayers = comp.selectedLayers;
        if (selectedLayers.length === 0) {
            alert("Please select at least one Shape Layer.", RC_Data.scriptTitle);
            return;
        }

        app.beginUndoGroup(RC_Data.scriptName + ": Apply " + radiusValue);

        var shapeLayerCount = 0;
        for (var i = 0; i < selectedLayers.length; i++) {
            var layer = selectedLayers[i];
            if (!(layer instanceof ShapeLayer)) continue;
            shapeLayerCount++;

            var contents = layer.property("ADBE Root Vectors Group");
            if (contents == null) continue;

            processGroup(contents, radiusValue, scopeSelected);
        }

        app.endUndoGroup();

        if (shapeLayerCount === 0) {
            alert("No Shape Layers found in selection.", RC_Data.scriptTitle);
        }
    }

    // ============================================================
    // Удаление
    // ============================================================
    function runRemove(scopeSelected) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Please open a composition first.", RC_Data.scriptTitle);
            return;
        }

        var selectedLayers = comp.selectedLayers;
        if (selectedLayers.length === 0) {
            alert("Please select at least one Shape Layer.", RC_Data.scriptTitle);
            return;
        }

        app.beginUndoGroup(RC_Data.scriptName + ": Remove");

        for (var i = 0; i < selectedLayers.length; i++) {
            var layer = selectedLayers[i];
            if (!(layer instanceof ShapeLayer)) continue;

            var contents = layer.property("ADBE Root Vectors Group");
            if (contents == null) continue;

            removeRoundCorners(contents, scopeSelected);
        }

        app.endUndoGroup();
    }

    // ============================================================
    // Обход групп
    // ============================================================
    function processGroup(group, radiusValue, scopeSelected) {
        if (group == null) return;

        var numProps = group.numProperties;
        for (var i = 1; i <= numProps; i++) {
            var prop = group.property(i);
            if (prop == null) continue;

            if (prop.matchName === "ADBE Vector Group") {
                if (scopeSelected && !prop.selected) {
                    var inner = prop.property("ADBE Vectors Group");
                    if (inner != null) processGroup(inner, radiusValue, scopeSelected);
                    continue;
                }

                var contents = prop.property("ADBE Vectors Group");
                if (contents != null) {
                    addOrUpdateRoundCorners(contents, radiusValue);
                }
            }
        }
    }

    function addOrUpdateRoundCorners(contents, radiusValue) {
        if (contents == null) return;

        var existing = null;
        for (var i = 1; i <= contents.numProperties; i++) {
            var p = contents.property(i);
            if (p != null && p.matchName === "ADBE Vector Filter - RC") {
                existing = p;
                break;
            }
        }

        var rcProp;
        if (existing != null) {
            rcProp = existing;
        } else {
            try {
                rcProp = contents.addProperty("ADBE Vector Filter - RC");
            } catch (e) {
                return;
            }
        }
        if (rcProp == null) return;

        var radiusParam = rcProp.property("ADBE Vector RoundCorner Radius");
        if (radiusParam != null) {
            try { radiusParam.setValue(radiusValue); } catch (e2) {}
        }
    }

    function removeRoundCorners(group, scopeSelected) {
        if (group == null) return;

        var numProps = group.numProperties;
        for (var i = 1; i <= numProps; i++) {
            var prop = group.property(i);
            if (prop == null) continue;

            if (prop.matchName === "ADBE Vector Group") {
                if (scopeSelected && !prop.selected) {
                    var innerSub = prop.property("ADBE Vectors Group");
                    if (innerSub != null) removeRoundCorners(innerSub, scopeSelected);
                    continue;
                }

                var contents = prop.property("ADBE Vectors Group");
                if (contents != null) {
                    for (var k = contents.numProperties; k >= 1; k--) {
                        var sub = contents.property(k);
                        if (sub != null && sub.matchName === "ADBE Vector Filter - RC") {
                            try { sub.remove(); } catch (eRem) {}
                        }
                    }
                }
            }
        }
    }

    // ============================================================
    // Help
    // ============================================================
    function showHelp() {
        var helpWindow = new Window("dialog", RC_Data.scriptTitle + " — Help");
        helpWindow.orientation = "column";
        helpWindow.alignChildren = ["fill", "top"];
        helpWindow.margins = 12;
        helpWindow.spacing = 8;

        var txt = helpWindow.add("statictext", undefined,
            "ptp_RoundCorners " + RC_Data.scriptVersion + "\n\n" +
            "• Quick presets — 0 / 5 / 10 / 20 / 30 / 40 — apply instantly.\n" +
            "• 0 — resets radius to zero (keeps the property).\n" +
            "• Custom — enter a value and press Apply.\n" +
            "• Scope:\n" +
            "    - All groups: applies to every vector group in the layer.\n" +
            "    - Selected only: applies only to groups you selected in Contents.\n" +
            "• Remove Round Corners — strips the property within the chosen scope.\n\n" +
            "Tip: bind presets to hotkeys via KBar / Tool Launcher / FT-Toolbar.",
            {multiline: true});
        txt.preferredSize.width = 380;
        txt.preferredSize.height = 220;

        var btnGroup = helpWindow.add("group");
        btnGroup.alignment = ["fill", "bottom"];
        btnGroup.alignChildren = ["fill", "center"];

        var siteBtn = btnGroup.add("button", undefined, "Script page");
        var allBtn  = btnGroup.add("button", undefined, "All scripts");
        var okBtn   = btnGroup.add("button", undefined, "OK", {name: "ok"});

        siteBtn.onClick = function () { openURL(RC_Data.strHelpBtn1Url); };
        allBtn.onClick  = function () { openURL(RC_Data.strHelpBtn2Url); };
        okBtn.onClick   = function () { helpWindow.close(); };

        helpWindow.center();
        helpWindow.show();
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
// ptp_RoundCorners.jsx
// v2.3 — Round Corners для Shape Layers с пресетами и выбором scope
// Установка: ScriptUI Panels → Window → ptp_RoundCorners.jsx

(function ptp_RoundCorners(thisObj) {

    var RC_Data = {
        scriptName:    "ptp_RoundCorners",
        scriptVersion: "v2.3",
        scriptTitle:   "",
        defaultRadius: 20,
        presets:       [0, 5, 10, 20, 30, 40],
        strHelpBtn1Url: "http://aescripts.com/pt_shiftlayers/",
        strHelpBtn2Url: "http://aescripts.com/category/scripts/paul-tuersley/"
    };
    RC_Data.scriptTitle = RC_Data.scriptName + " " + RC_Data.scriptVersion;

    if (parseFloat(app.version) < 8.0) {
        alert("This script requires After Effects CS3 or later.", RC_Data.scriptTitle);
        return;
    }

    var win = buildUI(thisObj);
    if (win != null) {
        if (win instanceof Window) {
            win.center();
            win.show();
        } else {
            win.layout.layout(true);
            win.layout.resize();
        }
    }

    // ============================================================
    // UI
    // ============================================================
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", RC_Data.scriptTitle, undefined, {resizeable: true});

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 10;
        pal.margins = 12;
        pal.preferredSize.width = 320;   // минимальная ширина панели

        // --- Заголовок ---
        var titleGroup = pal.add("group");
        titleGroup.orientation = "row";
        titleGroup.alignment = ["fill", "top"];
        titleGroup.alignChildren = ["left", "center"];
        var titleText = titleGroup.add("statictext", undefined, "Round Corners");
        titleText.alignment = ["left", "center"];
        var helpBtn = titleGroup.add("button", undefined, "?");
        helpBtn.preferredSize = [28, 26];
        helpBtn.alignment = ["right", "center"];

        // --- Quick Presets ---
        var presetsPanel = pal.add("panel", undefined, "Quick presets");
        presetsPanel.orientation = "row";
        presetsPanel.alignChildren = ["fill", "center"];
        presetsPanel.alignment = ["fill", "top"];
        presetsPanel.margins = 10;
        presetsPanel.spacing = 6;

        var presetButtons = [];
        for (var i = 0; i < RC_Data.presets.length; i++) {
            var val = RC_Data.presets[i];
            var b = presetsPanel.add("button", undefined, String(val));
            b.preferredSize = [-1, 28];
            b.minimumSize  = [36, 28];
            b.alignment = ["fill", "center"];
            b._radiusValue = val;
            presetButtons.push(b);
        }

        // --- Scope ---
        var scopePanel = pal.add("panel", undefined, "Scope");
        scopePanel.orientation = "row";
        scopePanel.alignChildren = ["left", "center"];
        scopePanel.alignment = ["fill", "top"];
        scopePanel.margins = 10;
        scopePanel.spacing = 12;
        var rbAll = scopePanel.add("radiobutton", undefined, "All groups");
        var rbSel = scopePanel.add("radiobutton", undefined, "Selected only (1)");
        rbAll.value = true;

        // --- Custom Radius ---
        var customGroup = pal.add("group");
        customGroup.orientation = "row";
        customGroup.alignChildren = ["left", "center"];
        customGroup.alignment = ["fill", "top"];
        customGroup.spacing = 8;
        customGroup.add("statictext", undefined, "Radius:");
        var radiusInput = customGroup.add("edittext", undefined, String(RC_Data.defaultRadius));
        radiusInput.characters = 6;
        radiusInput.preferredSize.height = 26;
        var applyBtn = customGroup.add("button", undefined, "Apply");
        applyBtn.preferredSize = [80, 28];

        // --- Remove ---
        var removeBtn = pal.add("button", undefined, "Remove Round Corners");
        removeBtn.preferredSize = [-1, 30];
        removeBtn.alignment = ["fill", "top"];

        // ---------- Обработчики ----------
        helpBtn.onClick = function () { showHelp(); };

        for (var j = 0; j < presetButtons.length; j++) {
            (function (btn) {
                btn.onClick = function () {
                    radiusInput.text = String(btn._radiusValue);
                    runApply(btn._radiusValue, rbSel.value);
                };
            })(presetButtons[j]);
        }

        applyBtn.onClick = function () {
            var v = parseFloat(radiusInput.text);
            if (isNaN(v) || v < 0) {
                alert("Please enter a valid non-negative number.", RC_Data.scriptTitle);
                return;
            }
            runApply(v, rbSel.value);
        };

        removeBtn.onClick = function () {
            runRemove(rbSel.value);
        };

        // Принудительный пересчёт layout
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };

        return pal;
    }

    // ============================================================
    // Применение
    // ============================================================
    function runApply(radiusValue, scopeSelected) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Please open a composition first.", RC_Data.scriptTitle);
            return;
        }

        var selectedLayers = comp.selectedLayers;
        if (selectedLayers.length === 0) {
            alert("Please select at least one Shape Layer.", RC_Data.scriptTitle);
            return;
        }

        app.beginUndoGroup(RC_Data.scriptName + ": Apply " + radiusValue);

        var shapeLayerCount = 0;
        for (var i = 0; i < selectedLayers.length; i++) {
            var layer = selectedLayers[i];
            if (!(layer instanceof ShapeLayer)) continue;
            shapeLayerCount++;

            var contents = layer.property("ADBE Root Vectors Group");
            if (contents == null) continue;

            processGroup(contents, radiusValue, scopeSelected);
        }

        app.endUndoGroup();

        if (shapeLayerCount === 0) {
            alert("No Shape Layers found in selection.", RC_Data.scriptTitle);
        }
    }

    // ============================================================
    // Удаление
    // ============================================================
    function runRemove(scopeSelected) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Please open a composition first.", RC_Data.scriptTitle);
            return;
        }

        var selectedLayers = comp.selectedLayers;
        if (selectedLayers.length === 0) {
            alert("Please select at least one Shape Layer.", RC_Data.scriptTitle);
            return;
        }

        app.beginUndoGroup(RC_Data.scriptName + ": Remove");

        for (var i = 0; i < selectedLayers.length; i++) {
            var layer = selectedLayers[i];
            if (!(layer instanceof ShapeLayer)) continue;

            var contents = layer.property("ADBE Root Vectors Group");
            if (contents == null) continue;

            removeRoundCorners(contents, scopeSelected);
        }

        app.endUndoGroup();
    }

    // ============================================================
    // Обход групп
    // ============================================================
    function processGroup(group, radiusValue, scopeSelected) {
        if (group == null) return;

        var numProps = group.numProperties;
        for (var i = 1; i <= numProps; i++) {
            var prop = group.property(i);
            if (prop == null) continue;

            if (prop.matchName === "ADBE Vector Group") {
                if (scopeSelected && !prop.selected) {
                    var inner = prop.property("ADBE Vectors Group");
                    if (inner != null) processGroup(inner, radiusValue, scopeSelected);
                    continue;
                }

                var contents = prop.property("ADBE Vectors Group");
                if (contents != null) {
                    addOrUpdateRoundCorners(contents, radiusValue);
                }
            }
        }
    }

    function addOrUpdateRoundCorners(contents, radiusValue) {
        if (contents == null) return;

        var existing = null;
        for (var i = 1; i <= contents.numProperties; i++) {
            var p = contents.property(i);
            if (p != null && p.matchName === "ADBE Vector Filter - RC") {
                existing = p;
                break;
            }
        }

        var rcProp;
        if (existing != null) {
            rcProp = existing;
        } else {
            try {
                rcProp = contents.addProperty("ADBE Vector Filter - RC");
            } catch (e) {
                return;
            }
        }
        if (rcProp == null) return;

        var radiusParam = rcProp.property("ADBE Vector RoundCorner Radius");
        if (radiusParam != null) {
            try { radiusParam.setValue(radiusValue); } catch (e2) {}
        }
    }

    function removeRoundCorners(group, scopeSelected) {
        if (group == null) return;

        var numProps = group.numProperties;
        for (var i = 1; i <= numProps; i++) {
            var prop = group.property(i);
            if (prop == null) continue;

            if (prop.matchName === "ADBE Vector Group") {
                if (scopeSelected && !prop.selected) {
                    var innerSub = prop.property("ADBE Vectors Group");
                    if (innerSub != null) removeRoundCorners(innerSub, scopeSelected);
                    continue;
                }

                var contents = prop.property("ADBE Vectors Group");
                if (contents != null) {
                    for (var k = contents.numProperties; k >= 1; k--) {
                        var sub = contents.property(k);
                        if (sub != null && sub.matchName === "ADBE Vector Filter - RC") {
                            try { sub.remove(); } catch (eRem) {}
                        }
                    }
                }
            }
        }
    }

    // ============================================================
    // Help
    // ============================================================
    function showHelp() {
        var helpWindow = new Window("dialog", RC_Data.scriptTitle + " — Help");
        helpWindow.orientation = "column";
        helpWindow.alignChildren = ["fill", "top"];
        helpWindow.margins = 12;
        helpWindow.spacing = 8;

        var txt = helpWindow.add("statictext", undefined,
            "ptp_RoundCorners " + RC_Data.scriptVersion + "\n\n" +
            "• Quick presets — 0 / 5 / 10 / 20 / 30 / 40 — apply instantly.\n" +
            "• 0 — resets radius to zero (keeps the property).\n" +
            "• Custom — enter a value and press Apply.\n" +
            "• Scope:\n" +
            "    - All groups: applies to every vector group in the layer.\n" +
            "    - Selected only: applies only to groups you selected in Contents.\n" +
            "• Remove Round Corners — strips the property within the chosen scope.\n\n" +
            "Tip: bind presets to hotkeys via KBar / Tool Launcher / FT-Toolbar.",
            {multiline: true});
        txt.preferredSize.width = 380;
        txt.preferredSize.height = 220;

        var btnGroup = helpWindow.add("group");
        btnGroup.alignment = ["fill", "bottom"];
        btnGroup.alignChildren = ["fill", "center"];

        var siteBtn = btnGroup.add("button", undefined, "Script page");
        var allBtn  = btnGroup.add("button", undefined, "All scripts");
        var okBtn   = btnGroup.add("button", undefined, "OK", {name: "ok"});

        siteBtn.onClick = function () { openURL(RC_Data.strHelpBtn1Url); };
        allBtn.onClick  = function () { openURL(RC_Data.strHelpBtn2Url); };
        okBtn.onClick   = function () { helpWindow.close(); };

        helpWindow.center();
        helpWindow.show();
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
