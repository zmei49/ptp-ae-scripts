// ptp_IsometricCam.jsx
// v1.0.2 — Isometric Cam: Scene Zoom, Layer Pose controls, защита от ошибок

{
    var IC_Data = {
        scriptName: "ptp_IsometricCam",
        scriptVersion: "v1.0.2"
    };

    var COL = {
        bg:        [0.16, 0.16, 0.17, 1],
        bgInput:   [0.12, 0.12, 0.13, 1],
        accent:    [0.98, 0.78, 0.20, 1],
        text:      [0.92, 0.92, 0.93, 1],
        textMuted: [0.60, 0.60, 0.63, 1]
    };

    var PRESETS = {
        "True Iso":    [35.264, 45,  "Классическая изометрия 35.264° / 45°"],
        "Dimetric":    [30,     45,  "Диметрия 2:1, пиксель-арт"],
        "Top 45":      [45,     0,   "Вид сверху под 45°"],
        "Cabinet":     [0,      30,  "Приближение к кабинетной проекции"],
        "Soft 25":     [25,     45,  "Мягкая изометрия 25° / 45°"],
        "Low 15":      [15,     45,  "Низкая камера 15° / 45°"]
    };

    var DEFAULT_ZOOM = 30000;

    // ====================================================================
    // BUILD UI
    // ====================================================================
    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", IC_Data.scriptName + " " + IC_Data.scriptVersion, undefined, {resizeable:true});

        win.orientation = "column";
        win.alignChildren = ["fill","top"];
        win.spacing = 5;
        win.margins = 8;
        win.preferredSize.width = 240;

        try { win.graphics.backgroundColor = win.graphics.newBrush(win.graphics.BrushType.SOLID_COLOR, COL.bg); } catch(e){}

        // ---------- HEADER ----------
        var header = win.add("group");
        header.orientation = "row";
        header.alignChildren = ["fill","center"];
        header.spacing = 6;

        var leftGrp = header.add("group");
        leftGrp.orientation = "row";
        leftGrp.alignment = ["left","center"];
        leftGrp.spacing = 5;
        var iconTxt = leftGrp.add("statictext", undefined, "\u25C6");
        try { iconTxt.graphics.foregroundColor = iconTxt.graphics.newPen(iconTxt.graphics.PenType.SOLID_COLOR, COL.accent, 1); } catch(e){}
        var title = leftGrp.add("statictext", undefined, "ISOMETRIC CAM");
        try { title.graphics.foregroundColor = title.graphics.newPen(title.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(e){}
        try { title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 12); } catch(e){}
        var verTxt = leftGrp.add("statictext", undefined, IC_Data.scriptVersion);
        try { verTxt.graphics.foregroundColor = verTxt.graphics.newPen(verTxt.graphics.PenType.SOLID_COLOR, COL.textMuted, 1); } catch(e){}

        var rightGrp = header.add("group");
        rightGrp.orientation = "row";
        rightGrp.alignment = ["right","center"];
        var btnHelp = rightGrp.add("button", undefined, "?");
        btnHelp.preferredSize = [24, 22];
        styleBtn(btnHelp);

        addDivider(win);

        // ---------- PRESETS ----------
        addSectionLabel(win, "ANGLE PRESETS");
        var grpP1 = win.add("group");
        grpP1.orientation = "row";
        grpP1.alignChildren = ["fill","center"];
        grpP1.spacing = 3;
        var btnTrue   = grpP1.add("button", undefined, "True Iso");
        var btnDim    = grpP1.add("button", undefined, "Dimetric");
        styleBtnNarrow(btnTrue); styleBtnNarrow(btnDim);
        btnTrue.helpTip = PRESETS["True Iso"][2];
        btnDim.helpTip  = PRESETS["Dimetric"][2];

        var grpP2 = win.add("group");
        grpP2.orientation = "row";
        grpP2.alignChildren = ["fill","center"];
        grpP2.spacing = 3;
        var btnTop    = grpP2.add("button", undefined, "Top 45");
        var btnCab    = grpP2.add("button", undefined, "Cabinet");
        styleBtnNarrow(btnTop); styleBtnNarrow(btnCab);
        btnTop.helpTip = PRESETS["Top 45"][2];
        btnCab.helpTip = PRESETS["Cabinet"][2];

        var grpP3 = win.add("group");
        grpP3.orientation = "row";
        grpP3.alignChildren = ["fill","center"];
        grpP3.spacing = 3;
        var btnSoft25 = grpP3.add("button", undefined, "Soft 25");
        var btnLow15  = grpP3.add("button", undefined, "Low 15");
        styleBtnNarrow(btnSoft25); styleBtnNarrow(btnLow15);
        btnSoft25.helpTip = PRESETS["Soft 25"][2];
        btnLow15.helpTip  = PRESETS["Low 15"][2];

        addDivider(win);

        // ---------- CUSTOM ANGLE ----------
        addSectionLabel(win, "CUSTOM ANGLE");
        var grpX = win.add("group");
        grpX.orientation = "row";
        grpX.alignChildren = ["fill","center"];
        grpX.spacing = 4;
        var lblX = grpX.add("statictext", undefined, "X:");
        lblX.preferredSize.width = 18;
        styleLabel(lblX);
        var slX = grpX.add("slider", undefined, 35.264, 0, 90);
        slX.preferredSize.width = 110;
        var etX = grpX.add("edittext", undefined, "35.26");
        etX.characters = 5;
        styleInput(etX);
        var lblXU = grpX.add("statictext", undefined, "\u00B0");
        styleMuted(lblXU);

        var grpY = win.add("group");
        grpY.orientation = "row";
        grpY.alignChildren = ["fill","center"];
        grpY.spacing = 4;
        var lblY = grpY.add("statictext", undefined, "Y:");
        lblY.preferredSize.width = 18;
        styleLabel(lblY);
        var slY = grpY.add("slider", undefined, 45, 0, 360);
        slY.preferredSize.width = 110;
        var etY = grpY.add("edittext", undefined, "45");
        etY.characters = 5;
        styleInput(etY);
        var lblYU = grpY.add("statictext", undefined, "\u00B0");
        styleMuted(lblYU);

        slX.onChanging = function() { etX.text = slX.value.toFixed(2); };
        etX.onChange = function() {
            var v = parseFloat(etX.text);
            if (!isNaN(v) && v >= 0 && v <= 90) slX.value = v;
            else etX.text = slX.value.toFixed(2);
        };
        slY.onChanging = function() { etY.text = slY.value.toFixed(0); };
        etY.onChange = function() {
            var v = parseFloat(etY.text);
            if (!isNaN(v) && v >= 0 && v <= 360) slY.value = v;
            else etY.text = slY.value.toFixed(0);
        };

        var btnApplyCustom = win.add("button", undefined, "Apply Custom Angle");
        styleBtn(btnApplyCustom);

        addDivider(win);

        // ---------- SCENE ZOOM (камера) ----------
        addSectionLabel(win, "SCENE ZOOM");
        var grpZ = win.add("group");
        grpZ.orientation = "row";
        grpZ.alignChildren = ["fill","center"];
        grpZ.spacing = 4;
        var lblZ = grpZ.add("statictext", undefined, "Zoom:");
        lblZ.preferredSize.width = 38;
        styleLabel(lblZ);
        var slZ = grpZ.add("slider", undefined, DEFAULT_ZOOM, 10000, 60000);
        slZ.preferredSize.width = 100;
        var etZ = grpZ.add("edittext", undefined, "30000");
        etZ.characters = 6;
        styleInput(etZ);

        slZ.onChanging = function() {
            etZ.text = Math.round(slZ.value).toString();
            applyZoomLive();
        };
        etZ.onChange = function() {
            var v = parseFloat(etZ.text);
            if (!isNaN(v) && v >= 5000 && v <= 100000) {
                slZ.value = Math.min(60000, v);
                applyZoomLive();
            }
            else etZ.text = Math.round(slZ.value).toString();
        };

        var grpZQ = win.add("group");
        grpZQ.orientation = "row";
        grpZQ.alignChildren = ["fill","center"];
        grpZQ.spacing = 3;
        var btnZWide = grpZQ.add("button", undefined, "Wide");
        var btnZNorm = grpZQ.add("button", undefined, "Normal");
        var btnZTele = grpZQ.add("button", undefined, "Tele");
        styleBtnNarrow(btnZWide); styleBtnNarrow(btnZNorm); styleBtnNarrow(btnZTele);
        btnZWide.helpTip = "Zoom = 15000 (отъезд)";
        btnZNorm.helpTip = "Zoom = 30000 (стандарт)";
        btnZTele.helpTip = "Zoom = 50000 (приближение)";

        function applyZoom(zoomVal) {
            try {
                var comp = app.project.activeItem;
                if (!(comp && comp instanceof CompItem)) return;
                var cam = findLayerByName(comp, "ISO_Camera");
                if (!cam) return;
                safeSetCameraZoom(cam, zoomVal);
            } catch(e) {}
        }
        function applyZoomLive() {
            applyZoom(slZ.value);
        }
        btnZWide.onClick = function(){ slZ.value = 15000; etZ.text = "15000"; applyZoom(15000); };
        btnZNorm.onClick = function(){ slZ.value = 30000; etZ.text = "30000"; applyZoom(30000); };
        btnZTele.onClick = function(){ slZ.value = 50000; etZ.text = "50000"; applyZoom(50000); };

        addDivider(win);

        // ---------- OPTIONS ----------
        addSectionLabel(win, "OPTIONS");
        var cbAll3D = win.add("checkbox", undefined, "3D на всех слоях");
        cbAll3D.value = true;
        styleLabel(cbAll3D);

        var cbLights = win.add("checkbox", undefined, "Освещение (Amb + Par)");
        cbLights.value = false;
        styleLabel(cbLights);

        var cbFloor = win.add("checkbox", undefined, "Пол-сетка (Floor)");
        cbFloor.value = false;
        styleLabel(cbFloor);

        var cbCineRenderer = win.add("checkbox", undefined, "Cinema 4D Renderer");
        cbCineRenderer.value = false;
        styleLabel(cbCineRenderer);

        addDivider(win);

        // ---------- LAYER POSE (управление выделенными слоями) ----------
        addSectionLabel(win, "LAYER POSE (selected)");
        var grpL1 = win.add("group");
        grpL1.orientation = "row";
        grpL1.alignChildren = ["fill","center"];
        grpL1.spacing = 3;
        var btnResetRot = grpL1.add("button", undefined, "Reset Rot");
        var btnLayFlat  = grpL1.add("button", undefined, "Lay Flat");
        styleBtnNarrow(btnResetRot); styleBtnNarrow(btnLayFlat);
        btnResetRot.helpTip = "Сбросить Orientation, X/Y/Z Rotation в 0";
        btnLayFlat.helpTip  = "X Rotation = -90° — слой ляжет на пол";

        var grpL2 = win.add("group");
        grpL2.orientation = "row";
        grpL2.alignChildren = ["fill","center"];
        grpL2.spacing = 3;
        var btnStandUp  = grpL2.add("button", undefined, "Stand Up");
        var btnFaceCam  = grpL2.add("button", undefined, "Face Cam");
        styleBtnNarrow(btnStandUp); styleBtnNarrow(btnFaceCam);
        btnStandUp.helpTip = "Слой стоит вертикально (как билборд)";
        btnFaceCam.helpTip = "Orientation повёрнут к камере (компенсация изометрии)";

        addDivider(win);

        // ---------- TOOLS ----------
        addSectionLabel(win, "TOOLS");
        var grpT1 = win.add("group");
        grpT1.orientation = "row";
        grpT1.alignChildren = ["fill","center"];
        grpT1.spacing = 3;
        var btnSel3D = grpT1.add("button", undefined, "Sel->3D");
        var btnReset = grpT1.add("button", undefined, "Reset 2D");
        styleBtnNarrow(btnSel3D); styleBtnNarrow(btnReset);

        var grpT2 = win.add("group");
        grpT2.orientation = "row";
        grpT2.alignChildren = ["fill","center"];
        grpT2.spacing = 3;
        var btnSpin  = grpT2.add("button", undefined, "Spin");
        var btnFloor = grpT2.add("button", undefined, "Floor");
        styleBtnNarrow(btnSpin); styleBtnNarrow(btnFloor);

        addDivider(win);

        var info = win.add("statictext", undefined,
            "Жми пресет. Zoom = расстояние камеры. Pose = поза выделенного слоя.",
            {multiline:true});
        info.preferredSize.height = 38;
        styleMuted(info);

        // ====================================================================
        // HANDLERS
        // ====================================================================
        function getOptions() {
            return {
                all3D: cbAll3D.value,
                lights: cbLights.value,
                floor: cbFloor.value,
                cineRenderer: cbCineRenderer.value,
                zoom: slZ.value
            };
        }

        btnTrue.onClick   = function(){ setupIsometric(PRESETS["True Iso"][0], PRESETS["True Iso"][1], getOptions()); };
        btnDim.onClick    = function(){ setupIsometric(PRESETS["Dimetric"][0], PRESETS["Dimetric"][1], getOptions()); };
        btnTop.onClick    = function(){ setupIsometric(PRESETS["Top 45"][0],   PRESETS["Top 45"][1],   getOptions()); };
        btnCab.onClick    = function(){ setupIsometric(PRESETS["Cabinet"][0],  PRESETS["Cabinet"][1],  getOptions()); };
        btnSoft25.onClick = function(){ setupIsometric(PRESETS["Soft 25"][0],  PRESETS["Soft 25"][1],  getOptions()); };
        btnLow15.onClick  = function(){ setupIsometric(PRESETS["Low 15"][0],   PRESETS["Low 15"][1],   getOptions()); };

        btnApplyCustom.onClick = function(){
            var x = parseFloat(etX.text);
            var y = parseFloat(etY.text);
            if (isNaN(x) || isNaN(y)) { alert("Введи числа."); return; }
            setupIsometric(x, y, getOptions());
        };

        btnResetRot.onClick = function(){ poseSelected("reset"); };
        btnLayFlat.onClick  = function(){ poseSelected("flat"); };
        btnStandUp.onClick  = function(){ poseSelected("stand"); };
        btnFaceCam.onClick  = function(){ poseSelected("facecam"); };

        btnSel3D.onClick = function(){ convertSelectedTo3D(); };
        btnReset.onClick = function(){ resetTo2D(); };
        btnSpin.onClick  = function(){ addSpinAnimation(); };
        btnFloor.onClick = function(){ addFloorGrid(); };

        btnHelp.onClick = function(){ showHelpWindow(); };

        win.layout.layout(true);
        win.layout.resize();
        return win;
    }

    // ====================================================================
    // HELP WINDOW
    // ====================================================================
    function showHelpWindow() {
        var hw = new Window("dialog", "Isometric Cam — справка", undefined);
        hw.orientation = "column";
        hw.alignChildren = ["fill","top"];
        hw.spacing = 8;
        hw.margins = 14;
        hw.preferredSize = [600, 640];
        try { hw.graphics.backgroundColor = hw.graphics.newBrush(hw.graphics.BrushType.SOLID_COLOR, COL.bg); } catch(e){}

        var hdr = hw.add("group");
        hdr.orientation = "row";
        hdr.alignChildren = ["left","center"];
        var hIcon = hdr.add("statictext", undefined, "\u25C6");
        try { hIcon.graphics.foregroundColor = hIcon.graphics.newPen(hIcon.graphics.PenType.SOLID_COLOR, COL.accent, 1); } catch(e){}
        var hTitle = hdr.add("statictext", undefined, "ISOMETRIC CAM — Памятка");
        try { hTitle.graphics.foregroundColor = hTitle.graphics.newPen(hTitle.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(e){}
        try { hTitle.graphics.font = ScriptUI.newFont("dialog", "BOLD", 14); } catch(e){}

        var div = hw.add("panel"); div.alignment = ["fill","top"]; div.preferredSize.height = 1;

        var helpText =
            "ЧТО ДЕЛАЕТ СКРИПТ\r" +
            "Превращает обычную композицию в 3D-сцену с изометрической камерой за 1 клик. Существующие слои/анимации НЕ изменяются.\r" +
            "\r" +
            "ПОРЯДОК РАБОТЫ\r" +
            "1. Открой композицию.\r" +
            "2. Выбери пресет угла или Custom Angle.\r" +
            "3. Настрой опции и Scene Zoom.\r" +
            "4. Жми пресет — камера, контроллер и (опц.) свет создаются.\r" +
            "\r" +
            "СОЗДАЁТСЯ\r" +
            "  ISO_Camera        — камера с большим Zoom (ортография)\r" +
            "  ISO_Controller    — Null, родитель камеры. Крути его для вращения сцены\r" +
            "  ISO_Ambient       — общий свет (опц.)\r" +
            "  ISO_Parallel      — направленный свет с тенями (опц.)\r" +
            "  ISO_Floor         — пол-сетка (опц.)\r" +
            "\r" +
            "ПРЕСЕТЫ\r" +
            "  True Iso  35.264° / 45°  — видеоигровая изометрия\r" +
            "  Dimetric  30° / 45°       — пиксель-арт 2:1\r" +
            "  Top 45    45° / 0°        — вид сверху\r" +
            "  Cabinet   0° / 30°        — техническая проекция\r" +
            "  Soft 25   25° / 45°       — мягкая изометрия для UI\r" +
            "  Low 15    15° / 45°       — лёгкий наклон\r" +
            "\r" +
            "SCENE ZOOM (главное!)\r" +
            "Управляет тем, как близко камера видит сцену. Меняется в реальном времени.\r" +
            "  Wide   = 15000  — сцена мельче, шире обзор\r" +
            "  Normal = 30000  — стандарт (по умолчанию)\r" +
            "  Tele   = 50000  — сцена крупнее, уже обзор\r" +
            "Безопасный диапазон 15000-60000. Ниже 10000 - изометрия искажается (появляется перспектива).\r" +
            "Слайдер ПРИ ПЕРЕТАСКИВАНИИ меняет камеру вживую. Меняй Zoom, а не Scale контроллера.\r" +
            "\r" +
            "LAYER POSE — поза выделенного слоя\r" +
            "Используй когда слой странно повёрнут в изометрической сцене.\r" +
            "  Reset Rot — сбрасывает Orientation, X/Y/Z Rotation в 0\r" +
            "  Lay Flat  — X Rotation = -90°, слой ложится на пол (как иконка карты, ковёр)\r" +
            "  Stand Up  — все повороты в 0, слой стоит вертикально (как билборд, персонаж)\r" +
            "  Face Cam  — Orientation компенсирует изометрию контроллера, слой смотрит прямо в камеру\r" +
            "              (полезно для текста, иконок UI поверх изометрической сцены)\r" +
            "\r" +
            "ОПЦИИ\r" +
            "  3D на всех слоях    — добавляет 3D switch всем слоям\r" +
            "  Освещение           — Ambient (40) + Parallel (120) с тенями\r" +
            "  Пол-сетка           — Shape Layer с сеткой 20x20\r" +
            "  Cinema 4D Renderer  — настоящие тени, но медленнее\r" +
            "\r" +
            "TOOLS\r" +
            "  Sel->3D    — 3D switch на выделенных\r" +
            "  Reset 2D   — удалить ISO_*, выключить 3D\r" +
            "  Spin       — вращение Y контроллера 0->360° за всё время\r" +
            "  Floor      — добавить только пол\r" +
            "\r" +
            "ЕСЛИ КАРТИНКА СТАЛА БЛИЗКО/КРИВО\r" +
            "1. Сначала пробуй Scene Zoom (Wide/Normal/Tele или слайдер).\r" +
            "2. Если слой странно повёрнут — выдели его и нажми Reset Rot.\r" +
            "3. НЕ меняй Scale контроллера (он не зумит, а раздвигает сцену).\r" +
            "4. НЕ меняй размер композиции — это только меняет рамку, не зум.\r" +
            "\r" +
            "ВАЖНО\r" +
            "- Анимации Position/Scale/Rotation сохраняются, AE добавит Z=0.\r" +
            "- Эффекты, маски, родительские связи без изменений.\r" +
            "- Откат: Ctrl/Cmd+Z или Reset 2D.";

        var et = hw.add("edittext", undefined, helpText, {multiline:true, readonly:true, scrolling:true});
        et.preferredSize = [570, 510];
        try { et.graphics.backgroundColor = et.graphics.newBrush(et.graphics.BrushType.SOLID_COLOR, COL.bgInput); } catch(e){}
        try { et.graphics.foregroundColor = et.graphics.newPen(et.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(e){}

        var btnClose = hw.add("button", undefined, "Закрыть");
        btnClose.preferredSize.height = 28;
        btnClose.onClick = function(){ hw.close(); };

        hw.center();
        hw.show();
    }

    // ====================================================================
    // STYLE HELPERS
    // ====================================================================
    function addDivider(parent) {
        var d = parent.add("panel");
        d.alignment = ["fill","top"];
        d.preferredSize.height = 1;
    }
    function addSectionLabel(parent, text) {
        var s = parent.add("statictext", undefined, text);
        try { s.graphics.foregroundColor = s.graphics.newPen(s.graphics.PenType.SOLID_COLOR, COL.accent, 1); } catch(e){}
        try { s.graphics.font = ScriptUI.newFont("dialog", "BOLD", 10); } catch(e){}
        return s;
    }
    function styleLabel(c) {
        try { c.graphics.foregroundColor = c.graphics.newPen(c.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(e){}
    }
    function styleMuted(c) {
        try { c.graphics.foregroundColor = c.graphics.newPen(c.graphics.PenType.SOLID_COLOR, COL.textMuted, 1); } catch(e){}
    }
    function styleBtn(b) {
        b.preferredSize.height = 26;
        try { b.graphics.foregroundColor = b.graphics.newPen(b.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(e){}
    }
    function styleBtnNarrow(b) {
        b.preferredSize.height = 24;
        try { b.graphics.foregroundColor = b.graphics.newPen(b.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(e){}
    }
    function styleInput(e) {
        try { e.graphics.backgroundColor = e.graphics.newBrush(e.graphics.BrushType.SOLID_COLOR, COL.bgInput); } catch(er){}
        try { e.graphics.foregroundColor = e.graphics.newPen(e.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(er){}
    }

    // ====================================================================
    // SAFE HELPERS
    // ====================================================================
    function safeSetProp(propParent, propPath, value) {
        try {
            var cur = propParent;
            for (var i=0; i<propPath.length; i++) {
                if (!cur) return false;
                cur = cur.property(propPath[i]);
            }
            if (cur) { cur.setValue(value); return true; }
        } catch(e) {}
        return false;
    }

    function safeSetCameraZoom(cam, zoom) {
        var tries = [
            ["ADBE Camera Options Group", "ADBE Camera Zoom"],
            ["Camera Options", "Zoom"]
        ];
        for (var i=0; i<tries.length; i++) {
            if (safeSetProp(cam, tries[i], zoom)) return true;
        }
        return false;
    }

    function safeSetLightIntensity(light, intensity) {
        var tries = [
            ["ADBE Light Options Group", "ADBE Light Intensity"],
            ["Light Options", "Intensity"]
        ];
        for (var i=0; i<tries.length; i++) {
            if (safeSetProp(light, tries[i], intensity)) return true;
        }
        return false;
    }

    function safeSetLightShadow(light, casts, darkness) {
        try {
            var opts = light.property("ADBE Light Options Group");
            if (!opts) opts = light.property("Light Options");
            if (!opts) return;
            try { opts.property("ADBE Casts Shadows").setValue(casts ? 1 : 0); }
            catch(e1) { try { opts.property("Casts Shadows").setValue(casts ? 1 : 0); } catch(e2) {} }
            try { opts.property("ADBE Light Shadow Darkness").setValue(darkness); }
            catch(e3) { try { opts.property("Shadow Darkness").setValue(darkness); } catch(e4) {} }
        } catch(eAll) {}
    }

    function safeSetTransform(layer, propName, value) {
        try {
            var grp = layer.property("ADBE Transform Group");
            if (!grp) grp = layer.property("Transform");
            if (!grp) return false;
            var p = grp.property(propName);
            if (p) { p.setValue(value); return true; }
        } catch(e) {}
        return false;
    }

    // ====================================================================
    // CORE
    // ====================================================================
    function getActiveComp() {
        var c = app.project.activeItem;
        if (!(c && c instanceof CompItem)) { alert("Выдели композицию."); return null; }
        return c;
    }

    function findLayerByName(comp, name) {
        for (var i=1; i<=comp.numLayers; i++) {
            if (comp.layer(i).name === name) return comp.layer(i);
        }
        return null;
    }

    function removeIfExists(comp, name) {
        var L = findLayerByName(comp, name);
        if (L) { try { L.remove(); } catch(e) {} }
    }

    // ---------- ОСНОВНОЙ СЕТАП ----------
    function setupIsometric(angleX, angleY, opts) {
        app.beginUndoGroup("Isometric Camera Setup");
        var step = "init";
        try {
            var comp = getActiveComp(); if (!comp) { app.endUndoGroup(); return; }

            step = "check existing cam";
            var existingCam = null;
            for (var i=1; i<=comp.numLayers; i++) {
                var L = comp.layer(i);
                if (L instanceof CameraLayer && L.name !== "ISO_Camera") {
                    existingCam = L;
                    break;
                }
            }
            if (existingCam) {
                var doReplace = confirm("Уже есть камера \"" + existingCam.name + "\".\r" +
                                        "Yes = удалить, No = выключить");
                if (doReplace) { try { existingCam.remove(); } catch(e) {} }
                else { try { existingCam.enabled = false; } catch(e) {} }
            }

            step = "remove old ISO";
            removeIfExists(comp, "ISO_Camera");
            removeIfExists(comp, "ISO_Controller");
            removeIfExists(comp, "ISO_Ambient");
            removeIfExists(comp, "ISO_Parallel");
            if (opts.floor) removeIfExists(comp, "ISO_Floor");

            step = "renderer";
            if (opts.cineRenderer) {
                var rendererTries = ["ADBE Picasso", "ADBE Ernst", "ADBE Cinema 4D"];
                for (var r=0; r<rendererTries.length; r++) {
                    try { comp.renderer = rendererTries[r]; break; } catch(eR) {}
                }
            }

            var cx = comp.width / 2;
            var cy = comp.height / 2;

            step = "create controller";
            var ctrl = comp.layers.addNull(comp.duration);
            if (!ctrl) throw new Error("addNull вернул null");
            ctrl.name = "ISO_Controller";
            try { ctrl.threeDLayer = true; } catch(e) {}
            try { ctrl.label = 9; } catch(e) {}
            safeSetTransform(ctrl, "ADBE Position", [cx, cy, 0]);

            step = "create camera";
            var cam = comp.layers.addCamera("ISO_Camera", [cx, cy]);
            if (!cam) throw new Error("addCamera вернул null");
            try { cam.label = 11; } catch(e) {}

            step = "camera position";
            safeSetTransform(cam, "ADBE Position", [cx, cy, -3000]);
            safeSetTransform(cam, "ADBE Anchor Point", [cx, cy, 0]);

            step = "camera zoom";
            safeSetCameraZoom(cam, opts.zoom || DEFAULT_ZOOM);

            step = "parent camera";
            try { cam.parent = ctrl; } catch(eParent) {}

            step = "controller rotation";
            safeSetTransform(ctrl, "ADBE Rotate X", angleX);
            safeSetTransform(ctrl, "ADBE Rotate Y", angleY);
            safeSetTransform(ctrl, "ADBE Rotate Z", 0);

            if (opts.all3D) {
                step = "3D on all";
                for (var j=1; j<=comp.numLayers; j++) {
                    var lj = comp.layer(j);
                    if (lj === cam || lj === ctrl) continue;
                    if (lj instanceof CameraLayer || lj instanceof LightLayer) continue;
                    if (lj.nullLayer && lj.name.indexOf("ISO_") === 0) continue;
                    try { lj.threeDLayer = true; } catch(eThree) {}
                }
            }

            if (opts.lights) {
                step = "ambient";
                try {
                    var amb = comp.layers.addLight("ISO_Ambient", [cx, cy]);
                    if (amb) {
                        amb.lightType = LightType.AMBIENT;
                        safeSetLightIntensity(amb, 40);
                        try { amb.label = 14; } catch(e) {}
                    }
                } catch(eAmb) {}

                step = "parallel";
                try {
                    var par = comp.layers.addLight("ISO_Parallel", [cx, cy]);
                    if (par) {
                        par.lightType = LightType.PARALLEL;
                        safeSetTransform(par, "ADBE Position", [cx - 400, cy - 600, -400]);
                        try {
                            var poi = par.property("ADBE Transform Group").property("ADBE Anchor Point");
                            if (poi) poi.setValue([cx, cy, 0]);
                        } catch(ePOI) {}
                        safeSetLightIntensity(par, 120);
                        safeSetLightShadow(par, true, 60);
                        try { par.label = 14; } catch(e) {}
                    }
                } catch(ePar) {}
            }

            if (opts.floor) {
                step = "floor";
                addFloorGridInternal(comp);
            }

        } catch (err) {
            alert("Setup error на шаге [" + step + "]:\r" + err.toString());
        }
        app.endUndoGroup();
    }

    // ---------- LAYER POSE ----------
    function poseSelected(mode) {
        app.beginUndoGroup("Layer Pose - " + mode);
        try {
            var comp = getActiveComp(); if (!comp) return;
            var sel = comp.selectedLayers;
            if (sel.length === 0) { alert("Выдели слой(и)."); return; }

            // Получим текущие углы контроллера для режима facecam
            var ctrlAngleX = 0, ctrlAngleY = 0;
            var ctrl = findLayerByName(comp, "ISO_Controller");
            if (ctrl) {
                try {
                    ctrlAngleX = ctrl.property("ADBE Transform Group").property("ADBE Rotate X").value;
                    ctrlAngleY = ctrl.property("ADBE Transform Group").property("ADBE Rotate Y").value;
                } catch(e) {}
            }

            
            for (var i=0; i<sel.length; i++) {
                var L = sel[i];
                if (L instanceof CameraLayer || L instanceof LightLayer) continue;
                try { L.threeDLayer = true; } catch(e) {}

                // Удалить все ключи поворотов перед установкой нового значения
                clearKeys(L, ["ADBE Orientation","ADBE Rotate X","ADBE Rotate Y","ADBE Rotate Z"]);

                if (mode === "reset") {
                    safeSetTransform(L, "ADBE Orientation", [0,0,0]);
                    safeSetTransform(L, "ADBE Rotate X", 0);
                    safeSetTransform(L, "ADBE Rotate Y", 0);
                    safeSetTransform(L, "ADBE Rotate Z", 0);
                } else if (mode === "flat") {
                    safeSetTransform(L, "ADBE Orientation", [0,0,0]);
                    safeSetTransform(L, "ADBE Rotate X", -90);
                    safeSetTransform(L, "ADBE Rotate Y", 0);
                    safeSetTransform(L, "ADBE Rotate Z", 0);
                } else if (mode === "stand") {
            // Слой стоит вертикально: компенсируем X-наклон контроллера
            safeSetTransform(L, "ADBE Orientation", [-ctrlAngleX, 0, 0]);
            safeSetTransform(L, "ADBE Rotate X", 0);
            safeSetTransform(L, "ADBE Rotate Y", 0);
            safeSetTransform(L, "ADBE Rotate Z", 0);
                } else if (mode === "facecam") {
                    // Компенсируем углы изометрии — слой смотрит прямо в камеру
                    // Orientation в обратном порядке: -Y потом -X
                    safeSetTransform(L, "ADBE Orientation", [-ctrlAngleX, -ctrlAngleY, 0]);
                    safeSetTransform(L, "ADBE Rotate X", 0);
                    safeSetTransform(L, "ADBE Rotate Y", 0);
                    safeSetTransform(L, "ADBE Rotate Z", 0);
                }
            }
        } catch (err) { alert("Pose error: " + err.toString()); }
        app.endUndoGroup();
    }

    function clearKeys(layer, propNames) {
        for (var i=0; i<propNames.length; i++) {
            try {
                var p = layer.property("ADBE Transform Group").property(propNames[i]);
                if (p && p.numKeys > 0) {
                    for (var k = p.numKeys; k >= 1; k--) {
                        try { p.removeKey(k); } catch(eK) {}
                    }
                }
            } catch(e) {}
        }
    }

    // ---------- SELECTED TO 3D ----------
        function convertSelectedTo3D() {
        app.beginUndoGroup("Selected to 3D");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var sel = comp.selectedLayers;
            if (sel.length === 0) { alert("Выдели слои."); return; }
            var count = 0;
            for (var i=0; i<sel.length; i++) {
                var L = sel[i];
                if (L instanceof CameraLayer || L instanceof LightLayer) continue;
                try { L.threeDLayer = true; count++; } catch(e) {}
            }
            if (count === 0) {
                alert("Нечего конвертировать (камеры/свет пропускаются).");
            }
        } catch (err) { alert("Sel→3D error: " + err.toString()); }
        app.endUndoGroup();
    }


    function resetTo2D() {
        app.beginUndoGroup("Reset to 2D");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var ok = confirm("Удалить ISO_*, выключить 3D на всех слоях?");
            if (!ok) return;
            var toRemove = ["ISO_Camera","ISO_Controller","ISO_Ambient","ISO_Parallel","ISO_Floor"];
            for (var i=0; i<toRemove.length; i++) removeIfExists(comp, toRemove[i]);
            for (var j=1; j<=comp.numLayers; j++) {
                var L = comp.layer(j);
                if (L instanceof CameraLayer || L instanceof LightLayer) continue;
                try { L.threeDLayer = false; } catch(e) {}
            }
            try { comp.renderer = "ADBE Standard 3d"; } catch(eR) {}
        } catch (err) { alert("Reset error: " + err.toString()); }
        app.endUndoGroup();
    }

    function addSpinAnimation() {
        app.beginUndoGroup("Spin Animation");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var ctrl = findLayerByName(comp, "ISO_Controller");
            if (!ctrl) { alert("Не найден ISO_Controller."); return; }
            var rotY = ctrl.property("ADBE Transform Group").property("ADBE Rotate Y");
            if (!rotY) { alert("Не найден Rotation Y."); return; }
            if (rotY.numKeys > 0) {
    for (var k = rotY.numKeys; k >= 1; k--) {
        try { rotY.removeKey(k); } catch(eK) {}
    }
}

            var startY = rotY.value;
            rotY.setValueAtTime(0,             startY);
            rotY.setValueAtTime(comp.duration, startY + 360);
            var n = rotY.numKeys;
            for (var k=1; k<=n; k++) {
                try {
                    rotY.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                } catch(eK) {}
            }
        } catch (err) { alert("Spin error: " + err.toString()); }
        app.endUndoGroup();
    }

    function addFloorGrid() {
        app.beginUndoGroup("Add Floor Grid");
        try {
            var comp = getActiveComp(); if (!comp) return;
            removeIfExists(comp, "ISO_Floor");
            addFloorGridInternal(comp);
        } catch (err) { alert("Floor error: " + err.toString()); }
        app.endUndoGroup();
    }

    function addFloorGridInternal(comp) {
        try {
            var cx = comp.width / 2;
            var cy = comp.height / 2;
            var floor = comp.layers.addShape();
            if (!floor) return;
            floor.name = "ISO_Floor";
            try { floor.threeDLayer = true; } catch(e) {}
            try { floor.label = 6; } catch(e) {}
            var contents = floor.property("ADBE Root Vectors Group");
            if (!contents) return;
            var gridSize = Math.max(comp.width, comp.height) * 2;
            var cells = 20;
            var stepSize = gridSize / cells;
            var halfGrid = gridSize / 2;
            var grpGrid = contents.addProperty("ADBE Vector Group");
            grpGrid.name = "Grid Lines";
            var gridContents = grpGrid.property("ADBE Vectors Group");
            for (var i=0; i<=cells; i++) {
                var offset = -halfGrid + i * stepSize;
                var pathH = gridContents.addProperty("ADBE Vector Shape - Group");
                pathH.name = "H" + i;
                var shH = new Shape();
                shH.vertices = [[-halfGrid, offset], [halfGrid, offset]];
                shH.inTangents = [[0,0],[0,0]];
                shH.outTangents = [[0,0],[0,0]];
                shH.closed = false;
                pathH.property("ADBE Vector Shape").setValue(shH);
                var pathV = gridContents.addProperty("ADBE Vector Shape - Group");
                pathV.name = "V" + i;
                var shV = new Shape();
                shV.vertices = [[offset, -halfGrid], [offset, halfGrid]];
                shV.inTangents = [[0,0],[0,0]];
                shV.outTangents = [[0,0],[0,0]];
                shV.closed = false;
                pathV.property("ADBE Vector Shape").setValue(shV);
            }
            var stroke = gridContents.addProperty("ADBE Vector Graphic - Stroke");
            try { stroke.property("ADBE Vector Stroke Color").setValue([0.4, 0.4, 0.45, 1]); } catch(e) {}
            try { stroke.property("ADBE Vector Stroke Width").setValue(2); } catch(e) {}
            try { stroke.property("ADBE Vector Stroke Opacity").setValue(50); } catch(e) {}
            safeSetTransform(floor, "ADBE Position", [cx, cy, 0]);
            safeSetTransform(floor, "ADBE Rotate X", -90);
            try { floor.moveToEnd(); } catch(e) {}
        } catch(eFloor) {
            alert("Floor internal error: " + eFloor.toString());
            
        }
        try {
    var ctrl = findLayerByName(comp, "ISO_Controller");
    if (ctrl && floor) floor.parent = ctrl;
} catch(eP) {}

    }

    // ====================================================================
    // RUN
    // ====================================================================
    if (parseFloat(app.version) < 8.0) {
        alert("Требуется After Effects CS3 или новее.");
    } else {
        var myWin = buildUI(this);
        if (myWin instanceof Window) { myWin.center(); myWin.show(); }
        else { myWin.layout.layout(true); }
    }
}
