// ptp_MotionPulse.jsx
// v1.3 — Motion Pulse: расширенный набор entrance/exit эффектов + справка
// Установка: ScriptUI Panels -> Window -> ptp_MotionPulse.jsx

{
    var MP_Data = {
        scriptName: "ptp_MotionPulse",
        scriptVersion: "v1.3",
        strHelpBtn1Url: "http://aescripts.com/pt_shiftlayers/",
        strHelpBtn2Url: "http://aescripts.com/category/scripts/paul-tuersley/"
    };

    var COL = {
        bg:        [0.16, 0.16, 0.17, 1],
        bgPanel:   [0.20, 0.20, 0.22, 1],
        bgInput:   [0.12, 0.12, 0.13, 1],
        accent:    [0.98, 0.78, 0.20, 1],
        text:      [0.92, 0.92, 0.93, 1],
        textMuted: [0.60, 0.60, 0.63, 1]
    };

    var EASINGS = {
        "Linear":  { "In": [0, 33.33], "Out": [0, 33.33] },
        "Sine":    { "In": [0, 50],    "Out": [0, 50] },
        "Quad":    { "In": [0, 60],    "Out": [0, 60] },
        "Cubic":   { "In": [0, 70],    "Out": [0, 70] },
        "Quart":   { "In": [0, 80],    "Out": [0, 80] },
        "Quint":   { "In": [0, 85],    "Out": [0, 85] },
        "Expo":    { "In": [0, 90],    "Out": [0, 90] },
        "Circ":    { "In": [0, 85],    "Out": [0, 85] },
        "Back":    { "In": [0, 75],    "Out": [0, 75] },
        "Elastic": { "In": [0, 95],    "Out": [0, 95] },
        "Bounce":  { "In": [0, 90],    "Out": [0, 90] }
    };

    var DURATION_PRESETS = {
        "XS":  0.15, "S":  0.25, "M":  0.4,
        "L":   0.6,  "XL": 1.0,  "XXL":1.5
    };

    // ====================================================================
    // BUILD UI
    // ====================================================================
    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", MP_Data.scriptName + " " + MP_Data.scriptVersion, undefined, {resizeable:true});

        win.orientation = "column";
        win.alignChildren = ["fill","top"];
        win.spacing = 6;
        win.margins = 10;
        win.preferredSize.width = 260;

        try { win.graphics.backgroundColor = win.graphics.newBrush(win.graphics.BrushType.SOLID_COLOR, COL.bg); } catch(e){}

        // ---------- HEADER с кнопкой Help ----------
        var header = win.add("group");
        header.orientation = "row";
        header.alignChildren = ["fill","center"];
        header.spacing = 6;

        var leftGrp = header.add("group");
        leftGrp.orientation = "row";
        leftGrp.alignment = ["left","center"];
        leftGrp.spacing = 6;
        var iconTxt = leftGrp.add("statictext", undefined, "\u25C6");
        try { iconTxt.graphics.foregroundColor = iconTxt.graphics.newPen(iconTxt.graphics.PenType.SOLID_COLOR, COL.accent, 1); } catch(e){}
        var title = leftGrp.add("statictext", undefined, "MOTION PULSE");
        try { title.graphics.foregroundColor = title.graphics.newPen(title.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(e){}
        try { title.graphics.font = ScriptUI.newFont("dialog", "BOLD", 13); } catch(e){}
        var verTxt = leftGrp.add("statictext", undefined, MP_Data.scriptVersion);
        try { verTxt.graphics.foregroundColor = verTxt.graphics.newPen(verTxt.graphics.PenType.SOLID_COLOR, COL.textMuted, 1); } catch(e){}

        var rightGrp = header.add("group");
        rightGrp.orientation = "row";
        rightGrp.alignment = ["right","center"];
        var btnHelp = rightGrp.add("button", undefined, "?");
        btnHelp.preferredSize = [26, 22];
        btnHelp.helpTip = "Открыть справку";
        styleBtn(btnHelp);

        addDivider(win);

        // ---------- DURATION ----------
        addSectionLabel(win, "DURATION");

        var grpDurPresets = win.add("group");
        grpDurPresets.orientation = "row";
        grpDurPresets.alignChildren = ["fill","center"];
        grpDurPresets.spacing = 2;
        grpDurPresets.margins = 0;
        var presetKeys = ["XS","S","M","L","XL","XXL"];
        var durBtns = [];
        for (var i=0; i<presetKeys.length; i++) {
            var b = grpDurPresets.add("button", undefined, presetKeys[i]);
            b.preferredSize = [36, 22];
            b.helpTip = presetKeys[i] + " = " + DURATION_PRESETS[presetKeys[i]] + " сек";
            styleBtn(b);
            durBtns.push(b);
        }

        var grpDurSlider = win.add("group");
        grpDurSlider.orientation = "row";
        grpDurSlider.alignChildren = ["fill","center"];
        grpDurSlider.spacing = 4;
        var lblDur = grpDurSlider.add("statictext", undefined, "Time:");
        lblDur.preferredSize.width = 38;
        styleLabel(lblDur);
        var slDur = grpDurSlider.add("slider", undefined, 0.4, 0.05, 3.0);
        slDur.preferredSize.width = 110;
        var etDur = grpDurSlider.add("edittext", undefined, "0.40");
        etDur.characters = 4;
        styleInput(etDur);
        var lblDurUnit = grpDurSlider.add("statictext", undefined, "s");
        lblDurUnit.preferredSize.width = 10;
        styleMuted(lblDurUnit);

        for (var di=0; di<durBtns.length; di++) {
            (function(key, btn){
                btn.onClick = function() {
                    var v = DURATION_PRESETS[key];
                    slDur.value = v;
                    etDur.text = v.toFixed(2);
                };
            })(presetKeys[di], durBtns[di]);
        }
        slDur.onChanging = function() { etDur.text = slDur.value.toFixed(2); };
        etDur.onChange = function() {
            var v = parseFloat(etDur.text);
            if (!isNaN(v) && v >= 0.05 && v <= 3.0) slDur.value = v;
            else etDur.text = slDur.value.toFixed(2);
        };

        addDivider(win);

        // ---------- OVERSHOOT ----------
        addSectionLabel(win, "OVERSHOOT");
        var grpOver = win.add("group");
        grpOver.orientation = "row";
        grpOver.alignChildren = ["fill","center"];
        grpOver.spacing = 4;
        var lblOv = grpOver.add("statictext", undefined, "Scale:");
        lblOv.preferredSize.width = 38;
        styleLabel(lblOv);
        var slOver = grpOver.add("slider", undefined, 120, 100, 200);
        slOver.preferredSize.width = 110;
        var etOver = grpOver.add("edittext", undefined, "120");
        etOver.characters = 4;
        styleInput(etOver);
        var lblOvUnit = grpOver.add("statictext", undefined, "%");
        lblOvUnit.preferredSize.width = 10;
        styleMuted(lblOvUnit);
        slOver.onChanging = function() { etOver.text = Math.round(slOver.value).toString(); };
        etOver.onChange = function() {
            var v = parseFloat(etOver.text);
            if (!isNaN(v) && v >= 100 && v <= 200) slOver.value = v;
            else etOver.text = Math.round(slOver.value).toString();
        };

        // ---------- REPEAT COUNT ----------
        var grpRep = win.add("group");
        grpRep.orientation = "row";
        grpRep.alignChildren = ["fill","center"];
        grpRep.spacing = 4;
        var lblRep = grpRep.add("statictext", undefined, "Repeat:");
        lblRep.preferredSize.width = 38;
        styleLabel(lblRep);
        var slRep = grpRep.add("slider", undefined, 1, 1, 8);
        slRep.preferredSize.width = 110;
        var etRep = grpRep.add("edittext", undefined, "1");
        etRep.characters = 4;
        styleInput(etRep);
        var lblRepUnit = grpRep.add("statictext", undefined, "x");
        lblRepUnit.preferredSize.width = 10;
        styleMuted(lblRepUnit);
        slRep.onChanging = function() {
            slRep.value = Math.round(slRep.value);
            etRep.text = slRep.value.toString();
        };
        etRep.onChange = function() {
            var v = parseInt(etRep.text, 10);
            if (!isNaN(v) && v >= 1 && v <= 8) slRep.value = v;
            else etRep.text = slRep.value.toString();
        };

        addDivider(win);

        // ---------- ENTRANCE (4 эффекта: убраны Spin-in и Orbit) ----------
        addSectionLabel(win, "ENTRANCE (start of path)");
        var grpIn1 = win.add("group");
        grpIn1.orientation = "row";
        grpIn1.alignChildren = ["fill","center"];
        grpIn1.spacing = 3;
        var btnPulseIn  = grpIn1.add("button", undefined, "Pulse");
        var btnFadeIn   = grpIn1.add("button", undefined, "Fade");
        styleBtn(btnPulseIn); styleBtn(btnFadeIn);

        var grpIn2 = win.add("group");
        grpIn2.orientation = "row";
        grpIn2.alignChildren = ["fill","center"];
        grpIn2.spacing = 3;
        var btnZoomIn   = grpIn2.add("button", undefined, "Zoom");
        var btnDropIn   = grpIn2.add("button", undefined, "Drop-in");
        styleBtn(btnZoomIn); styleBtn(btnDropIn);

        var btnBounceIn = win.add("button", undefined, "Bounce In");
        styleBtn(btnBounceIn);

        addDivider(win);

        // ---------- EXIT (5 эффектов: убран Spin-out) ----------
        addSectionLabel(win, "EXIT (end of path)");
        var grpOut1 = win.add("group");
        grpOut1.orientation = "row";
        grpOut1.alignChildren = ["fill","center"];
        grpOut1.spacing = 3;
        var btnPulseOut = grpOut1.add("button", undefined, "Pulse");
        var btnFadeOut  = grpOut1.add("button", undefined, "Fade");
        styleBtn(btnPulseOut); styleBtn(btnFadeOut);

        var grpOut2 = win.add("group");
        grpOut2.orientation = "row";
        grpOut2.alignChildren = ["fill","center"];
        grpOut2.spacing = 3;
        var btnZoomOut  = grpOut2.add("button", undefined, "Zoom");
        var btnShrink   = grpOut2.add("button", undefined, "Shrink");
        styleBtn(btnZoomOut); styleBtn(btnShrink);

        var btnPopIn = win.add("button", undefined, "Pop on Arrival");
        styleBtn(btnPopIn);

        addDivider(win);

        // ---------- ALONG PATH ----------
        addSectionLabel(win, "ALONG PATH");
        var grpAlong = win.add("group");
        grpAlong.orientation = "row";
        grpAlong.alignChildren = ["fill","center"];
        grpAlong.spacing = 3;
        var btnWaypoint = grpAlong.add("button", undefined, "Waypoint");
        var btnWobble   = grpAlong.add("button", undefined, "Wobble");
        styleBtn(btnWaypoint); styleBtn(btnWobble);

        var btnEcho = win.add("button", undefined, "Trail Echo");
        styleBtn(btnEcho);

        var btnReveal = win.add("button", undefined, "Reveal Path (Trim Paths)");
        styleBtn(btnReveal);

        addDivider(win);

        // ---------- EASING ENGINE ----------
        addSectionLabel(win, "EASING (easings.net)");
        var grpCurve = win.add("group");
        grpCurve.orientation = "row";
        grpCurve.alignChildren = ["fill","center"];
        grpCurve.spacing = 4;
        var lblCv = grpCurve.add("statictext", undefined, "Curve:");
        lblCv.preferredSize.width = 38;
        styleLabel(lblCv);
        var ddCurve = grpCurve.add("dropdownlist", undefined,
            ["Linear","Sine","Quad","Cubic","Quart","Quint","Expo","Circ","Back","Elastic","Bounce"]);
        ddCurve.selection = 2;
        ddCurve.preferredSize.width = 120;

        var grpEase = win.add("group");
        grpEase.orientation = "row";
        grpEase.alignChildren = ["fill","center"];
        grpEase.spacing = 3;
        var btnEaseIn    = grpEase.add("button", undefined, "In");
        var btnEaseOut   = grpEase.add("button", undefined, "Out");
        var btnEaseInOut = grpEase.add("button", undefined, "InOut");
        styleBtn(btnEaseIn); styleBtn(btnEaseOut); styleBtn(btnEaseInOut);

        addDivider(win);

        var info = win.add("statictext", undefined,
            "Выдели слой с анимацией Position, выбери длительность и нажми эффект. ? — справка.",
            {multiline:true});
        info.preferredSize.height = 38;
        styleMuted(info);

        // ====================================================================
        // PARAM HELPERS
        // ====================================================================
        function getDur() { return slDur.value; }
        function getOvr() { return slOver.value; }
        function getRep() { return Math.max(1, Math.round(slRep.value)); }

        // ENTRANCE
        btnPulseIn.onClick   = function(){ runPulse(true,  getDur(), getOvr(), getRep()); };
        btnFadeIn.onClick    = function(){ runFade(true,  getDur()); };
        btnZoomIn.onClick    = function(){ runZoom(true,  getDur()); };
        btnDropIn.onClick    = function(){ runDrop(getDur()); };
        btnBounceIn.onClick  = function(){ runBouncyIn(getDur(), getOvr()); };

        // EXIT
        btnPulseOut.onClick  = function(){ runPulse(false, getDur(), getOvr(), getRep()); };
        btnFadeOut.onClick   = function(){ runFade(false, getDur()); };
        btnZoomOut.onClick   = function(){ runZoom(false, getDur()); };
        btnShrink.onClick    = function(){ runShrink(getDur()); };
        btnPopIn.onClick     = function(){ runPopIn(getDur(), getOvr()); };

        // ALONG
        btnWaypoint.onClick  = function(){ runWaypointPulse(getDur(), getOvr()); };
        btnWobble.onClick    = function(){ runWobble(); };
        btnEcho.onClick      = function(){ runEcho(); };
        btnReveal.onClick    = function(){ runRevealPath(); };

        // EASING
        btnEaseIn.onClick    = function(){ runEasing(ddCurve.selection.text, "In"); };
        btnEaseOut.onClick   = function(){ runEasing(ddCurve.selection.text, "Out"); };
        btnEaseInOut.onClick = function(){ runEasing(ddCurve.selection.text, "InOut"); };

        // HELP
        btnHelp.onClick = function() { showHelpWindow(); };

        win.layout.layout(true);
        win.layout.resize();
        return win;
    }

    // ====================================================================
    // HELP WINDOW (русский)
    // ====================================================================
    function showHelpWindow() {
        var hw = new Window("dialog", "Motion Pulse — справка", undefined);
        hw.orientation = "column";
        hw.alignChildren = ["fill","top"];
        hw.spacing = 8;
        hw.margins = 14;
        hw.preferredSize = [560, 600];

        try { hw.graphics.backgroundColor = hw.graphics.newBrush(hw.graphics.BrushType.SOLID_COLOR, COL.bg); } catch(e){}

        var hdr = hw.add("group");
        hdr.orientation = "row";
        hdr.alignChildren = ["left","center"];
        var hIcon = hdr.add("statictext", undefined, "\u25C6");
        try { hIcon.graphics.foregroundColor = hIcon.graphics.newPen(hIcon.graphics.PenType.SOLID_COLOR, COL.accent, 1); } catch(e){}
        var hTitle = hdr.add("statictext", undefined, "MOTION PULSE — Памятка");
        try { hTitle.graphics.foregroundColor = hTitle.graphics.newPen(hTitle.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(e){}
        try { hTitle.graphics.font = ScriptUI.newFont("dialog", "BOLD", 14); } catch(e){}

        var divider = hw.add("panel");
        divider.alignment = ["fill","top"];
        divider.preferredSize.height = 1;

        var helpText =
            "ОБЩИЙ ПРИНЦИП\r" +
            "Скрипт добавляет эффекты появления, исчезания и движения к слою, у которого уже есть анимированный Position (минимум 2 ключевых кадра). Сначала создай движение через ptp_PathToPosition, потом применяй эффекты здесь.\r" +
            "\r" +
            "ПОРЯДОК РАБОТЫ\r" +
            "1. Выдели слой с анимацией Position в таймлайне.\r" +
            "2. Выбери длительность эффекта (DURATION) — кнопки-пресеты или ползунок.\r" +
            "3. При необходимости настрой OVERSHOOT (силу «перелёта» для пульсаций) и REPEAT (количество повторов).\r" +
            "4. Нажми нужную кнопку эффекта.\r" +
            "\r" +
            "DURATION (длительность)\r" +
            "Пресеты по системе Material Design 3:\r" +
            "  XS = 0.15с — микро-движение, акцент\r" +
            "  S  = 0.25с — быстрое появление\r" +
            "  M  = 0.40с — стандартный темп (по умолчанию)\r" +
            "  L  = 0.60с — заметное движение\r" +
            "  XL = 1.00с — кинематографичное\r" +
            "  XXL= 1.50с — медленное драматичное\r" +
            "Ползунок позволяет задать любое значение от 0.05 до 3.0 секунд.\r" +
            "\r" +
            "OVERSHOOT (перелёт, %)\r" +
            "Насколько Scale «вылетает» за 100%% в пиковой точке пульсации.\r" +
            "100%% — без перелёта (плавно), 120%% — классика Material, 150-200%% — сильный отскок.\r" +
            "\r" +
            "REPEAT (количество повторов)\r" +
            "Сколько раз пульсация повторяется внутри Duration. 1 — обычный пульс, 2-3 — биение сердца, 5+ — пульсация маячка.\r" +
            "\r" +
            "ENTRANCE (появление в начале пути)\r" +
            "  Pulse    — Scale 0 -> overshoot -> 100, Opacity 0 -> 100. Классическое «выскакивание».\r" +
            "  Fade     — мягкое появление по Opacity.\r" +
            "  Zoom     — Scale 0 -> 100 без перелёта, плавное увеличение.\r" +
            "  Drop-in  — падение сверху со squash & stretch (как мяч).\r" +
            "  Bounce In — серия отскоков с затуханием (для игривого стиля).\r" +
            "\r" +
            "EXIT (исчезновение в конце пути)\r" +
            "  Pulse        — Scale 100 -> overshoot -> 0, Opacity 100 -> 0.\r" +
            "  Fade         — плавное исчезание.\r" +
            "  Zoom         — уменьшение до 0.\r" +
            "  Shrink       — резкое сжатие в точку с ease-in.\r" +
            "  Pop on Arrival — overshoot 120%% -> 95%% -> 100%% в момент прибытия. Объект НЕ исчезает, а «приземляется» с отскоком.\r" +
            "\r" +
            "ALONG PATH (вдоль пути)\r" +
            "  Waypoint — мини-пульсация на каждой средней точке пути (имитация остановок).\r" +
            "  Wobble   — лёгкое покачивание Rotation +/-5° во время движения.\r" +
            "  Trail Echo — добавляет эффект Echo (хвост из 5 копий за объектом).\r" +
            "  Reveal Path — постепенно прорисовывает путь во время движения (нужно выделить ДВА слоя: исходный Shape Layer с путём + целевой слой с анимацией Position).\r" +
            "\r" +
            "EASING (кривые из easings.net)\r" +
            "Применяет временную интерполяцию к выбранному свойству с ключевыми кадрами (не только Position).\r" +
            "  1. Выдели свойство (например Position или Opacity) в таймлайне.\r" +
            "  2. Выбери кривую из выпадающего списка.\r" +
            "  3. Нажми In / Out / InOut.\r" +
            "Краткое описание кривых:\r" +
            "  Linear  — без ускорения\r" +
            "  Sine    — мягкая синусоида\r" +
            "  Quad/Cubic/Quart/Quint — степенные, от мягкой к резкой\r" +
            "  Expo    — экспоненциальная (очень резкая)\r" +
            "  Circ    — круговая\r" +
            "  Back    — с перелётом назад (overshoot)\r" +
            "  Elastic — упругая (как пружина)\r" +
            "  Bounce  — отскоки как у мяча\r" +
            "\r" +
            "ТИПИЧНЫЕ СЦЕНАРИИ\r" +
            "  Машина по карте:  Bounce In (start) + Waypoint + Pop on Arrival (end)\r" +
            "  Логотип:          Pulse (Repeat=2) + Fade Out\r" +
            "  Иконка-уведомление: Drop-in + Wobble + Shrink\r" +
            "  Маркер маршрута:  Pulse (Repeat=5) для пульсации маячка\r" +
            "\r" +
            "ВАЖНО\r" +
            "- Эффекты добавляют ключевые кадры ДО первой точки пути (для Entrance) или ПОСЛЕ последней (для Exit). Убедись, что в композиции есть запас времени.\r" +
            "- Если эффект применяется на слое без анимации Position — будет ошибка. Сначала создай движение.\r" +
            "- Все действия добавляются в Undo History — отменяй через Ctrl/Cmd+Z.";

        var et = hw.add("edittext", undefined, helpText, {multiline: true, readonly: true, scrolling: true});
        et.preferredSize = [530, 470];
        try { et.graphics.backgroundColor = et.graphics.newBrush(et.graphics.BrushType.SOLID_COLOR, COL.bgInput); } catch(e){}
        try { et.graphics.foregroundColor = et.graphics.newPen(et.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(e){}

        var btnClose = hw.add("button", undefined, "Закрыть");
        btnClose.preferredSize.height = 30;
        btnClose.onClick = function() { hw.close(); };

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
    function styleInput(e) {
        try { e.graphics.backgroundColor = e.graphics.newBrush(e.graphics.BrushType.SOLID_COLOR, COL.bgInput); } catch(er){}
        try { e.graphics.foregroundColor = e.graphics.newPen(e.graphics.PenType.SOLID_COLOR, COL.text, 1); } catch(er){}
    }

    // ====================================================================
    // CORE GETTERS
    // ====================================================================
    function getActiveComp() {
        var c = app.project.activeItem;
        if (!(c && c instanceof CompItem)) { alert("Выдели композицию."); return null; }
        return c;
    }
    function getSelectedLayer(comp) {
        var sel = comp.selectedLayers;
        if (sel.length === 0) { alert("Выдели слой."); return null; }
        return sel[0];
    }
    function getPositionProp(layer) {
        try {
            var p = layer.property("ADBE Transform Group").property("ADBE Position");
            if (!p || p.numKeys < 2) {
                alert("У слоя нет анимации Position (нужно >= 2 ключевых кадров).");
                return null;
            }
            return p;
        } catch (e) { alert("Невозможно получить Position."); return null; }
    }
    function getScale(layer)   { return layer.property("ADBE Transform Group").property("ADBE Scale"); }
    function getOpacity(layer) { return layer.property("ADBE Transform Group").property("ADBE Opacity"); }
    function getRot(layer)     { return layer.property("ADBE Transform Group").property("ADBE Rotate Z"); }

    function svec(layer, pct) {
        var dim = getScale(layer).value.length;
        if (dim === 3) return [pct, pct, pct];
        return [pct, pct];
    }

    // ====================================================================
    // PULSE
    // ====================================================================
    function runPulse(isIn, duration, overshootPct, repeat) {
        app.beginUndoGroup("MP - Pulse " + (isIn ? "In" : "Out"));
        try {
            var comp = getActiveComp(); if (!comp) return;
            var layer = getSelectedLayer(comp); if (!layer) return;
            var pos = getPositionProp(layer); if (!pos) return;
            var scale = getScale(layer), opacity = getOpacity(layer);
            var anchor = isIn ? pos.keyTime(1) : pos.keyTime(pos.numKeys);
            var single = duration / repeat;
            for (var r=0; r<repeat; r++) {
                if (isIn) {
                    var t0 = anchor - duration + r * single;
                    var tMid = t0 + single * 0.5;
                    var t1 = t0 + single;
                    if (r === 0) scale.setValueAtTime(t0, svec(layer, 0));
                    else         scale.setValueAtTime(t0, svec(layer, 100));
                    scale.setValueAtTime(tMid, svec(layer, overshootPct));
                    scale.setValueAtTime(t1, svec(layer, 100));
                    if (r === 0) opacity.setValueAtTime(t0, 0);
                    opacity.setValueAtTime(t1, 100);
                } else {
                    var s0 = anchor + r * single;
                    var sMid = s0 + single * 0.5;
                    var s1 = s0 + single;
                    scale.setValueAtTime(s0, svec(layer, 100));
                    scale.setValueAtTime(sMid, svec(layer, overshootPct));
                    if (r === repeat - 1) {
                        scale.setValueAtTime(s1, svec(layer, 0));
                        opacity.setValueAtTime(s1, 0);
                    } else {
                        scale.setValueAtTime(s1, svec(layer, 100));
                    }
                    if (r === 0) opacity.setValueAtTime(s0, 100);
                }
            }
            applyEaseToAllKeys(scale, "Back", isIn ? "Out" : "In");
            applyEaseToAllKeys(opacity, "Sine", "InOut");
        } catch (e) { alert("Pulse error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runFade(isIn, duration) {
        app.beginUndoGroup("MP - Fade " + (isIn ? "In" : "Out"));
        try {
            var comp = getActiveComp(); if (!comp) return;
            var layer = getSelectedLayer(comp); if (!layer) return;
            var pos = getPositionProp(layer); if (!pos) return;
            var op = getOpacity(layer);
            var t = isIn ? pos.keyTime(1) : pos.keyTime(pos.numKeys);
            if (isIn) { op.setValueAtTime(t - duration, 0); op.setValueAtTime(t, 100); }
            else      { op.setValueAtTime(t, 100); op.setValueAtTime(t + duration, 0); }
            applyEaseToAllKeys(op, "Sine", "InOut");
        } catch (e) { alert("Fade error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runZoom(isIn, duration) {
        app.beginUndoGroup("MP - Zoom " + (isIn ? "In" : "Out"));
        try {
            var comp = getActiveComp(); if (!comp) return;
            var layer = getSelectedLayer(comp); if (!layer) return;
            var pos = getPositionProp(layer); if (!pos) return;
            var sc = getScale(layer), op = getOpacity(layer);
            var t = isIn ? pos.keyTime(1) : pos.keyTime(pos.numKeys);
            if (isIn) {
                sc.setValueAtTime(t - duration, svec(layer, 0));
                sc.setValueAtTime(t,            svec(layer, 100));
                op.setValueAtTime(t - duration, 0);
                op.setValueAtTime(t,            100);
            } else {
                sc.setValueAtTime(t,            svec(layer, 100));
                sc.setValueAtTime(t + duration, svec(layer, 0));
                op.setValueAtTime(t,            100);
                op.setValueAtTime(t + duration, 0);
            }
            applyEaseToAllKeys(sc, "Cubic", isIn ? "Out" : "In");
            applyEaseToAllKeys(op, "Sine", "InOut");
        } catch (e) { alert("Zoom error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runDrop(duration) {
        app.beginUndoGroup("MP - Drop-in");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var layer = getSelectedLayer(comp); if (!layer) return;
            var pos = getPositionProp(layer); if (!pos) return;
            var op = getOpacity(layer), sc = getScale(layer);
            var t = pos.keyTime(1);
            var basePos = pos.keyValue(1);
            var dropOffset = 300;
            var dim = basePos.length;
            var posStart = (dim === 3) ? [basePos[0], basePos[1] - dropOffset, basePos[2]]
                                       : [basePos[0], basePos[1] - dropOffset];
            pos.setValueAtTime(t - duration, posStart);
            sc.setValueAtTime(t - duration,        svec(layer, 100));
            sc.setValueAtTime(t,                   (dim===3) ? [115, 85, 100] : [115, 85]);
            sc.setValueAtTime(t + duration * 0.3,  svec(layer, 100));
            op.setValueAtTime(t - duration, 0);
            op.setValueAtTime(t,            100);
            applyEaseToAllKeys(sc, "Back", "Out");
            applyEaseToAllKeys(op, "Sine", "InOut");
        } catch (e) { alert("Drop error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runBouncyIn(duration, overshootPct) {
        app.beginUndoGroup("MP - Bounce In");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var layer = getSelectedLayer(comp); if (!layer) return;
            var pos = getPositionProp(layer); if (!pos) return;
            var sc = getScale(layer), op = getOpacity(layer);
            var t = pos.keyTime(1);
            sc.setValueAtTime(t - duration,        svec(layer, 0));
            sc.setValueAtTime(t - duration * 0.6,  svec(layer, overshootPct));
            sc.setValueAtTime(t - duration * 0.4,  svec(layer, 85));
            sc.setValueAtTime(t - duration * 0.2,  svec(layer, 105));
            sc.setValueAtTime(t,                   svec(layer, 100));
            op.setValueAtTime(t - duration, 0);
            op.setValueAtTime(t - duration * 0.7, 100);
            applyEaseToAllKeys(sc, "Bounce", "Out");
            applyEaseToAllKeys(op, "Sine", "InOut");
        } catch (e) { alert("Bounce error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runPopIn(duration, overshootPct) {
        app.beginUndoGroup("MP - Pop on Arrival");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var layer = getSelectedLayer(comp); if (!layer) return;
            var pos = getPositionProp(layer); if (!pos) return;
            var sc = getScale(layer);
            var t = pos.keyTime(pos.numKeys);
            sc.setValueAtTime(t,                  svec(layer, 100));
            sc.setValueAtTime(t + duration * 0.4, svec(layer, overshootPct));
            sc.setValueAtTime(t + duration * 0.7, svec(layer, 95));
            sc.setValueAtTime(t + duration,       svec(layer, 100));
            applyEaseToAllKeys(sc, "Back", "Out");
        } catch (e) { alert("Pop error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runShrink(duration) {
        app.beginUndoGroup("MP - Shrink");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var layer = getSelectedLayer(comp); if (!layer) return;
            var pos = getPositionProp(layer); if (!pos) return;
            var sc = getScale(layer);
            var t = pos.keyTime(pos.numKeys);
            sc.setValueAtTime(t,            svec(layer, 100));
            sc.setValueAtTime(t + duration, svec(layer, 0));
            applyEaseToAllKeys(sc, "Cubic", "In");
        } catch (e) { alert("Shrink error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runWaypointPulse(duration, overshootPct) {
        app.beginUndoGroup("MP - Waypoint Pulse");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var layer = getSelectedLayer(comp); if (!layer) return;
            var pos = getPositionProp(layer); if (!pos) return;
            var sc = getScale(layer);
            var half = duration * 0.5;
            for (var k=2; k<pos.numKeys; k++) {
                var t = pos.keyTime(k);
                sc.setValueAtTime(t - half * 0.5, svec(layer, 100));
                sc.setValueAtTime(t,              svec(layer, overshootPct * 0.85));
                sc.setValueAtTime(t + half * 0.5, svec(layer, 100));
            }
            applyEaseToAllKeys(sc, "Sine", "InOut");
        } catch (e) { alert("Waypoint error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runWobble() {
        app.beginUndoGroup("MP - Wobble");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var layer = getSelectedLayer(comp); if (!layer) return;
            var pos = getPositionProp(layer); if (!pos) return;
            var rt = getRot(layer);
            var t0 = pos.keyTime(1);
            var t1 = pos.keyTime(pos.numKeys);
            var step = 0.2;
            var amp = 5;
            var sign = 1;
            for (var t = t0; t <= t1; t += step) {
                rt.setValueAtTime(t, amp * sign);
                sign *= -1;
            }
            rt.setValueAtTime(t1, 0);
            applyEaseToAllKeys(rt, "Sine", "InOut");
        } catch (e) { alert("Wobble error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runEcho() {
        app.beginUndoGroup("MP - Trail Echo");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var layer = getSelectedLayer(comp); if (!layer) return;
            var echo = layer.property("ADBE Effect Parade").addProperty("ADBE Echo");
            echo.property("ADBE Echo-0001").setValue(-0.05);
            echo.property("ADBE Echo-0002").setValue(5);
            echo.property("ADBE Echo-0003").setValue(1);
            echo.property("ADBE Echo-0004").setValue(0.6);
        } catch (e) { alert("Echo error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runRevealPath() {
        app.beginUndoGroup("MP - Reveal Path");
        try {
            var comp = getActiveComp(); if (!comp) return;
            var sel = comp.selectedLayers;
            if (sel.length < 2) {
                alert("Выдели ДВА слоя: Shape Layer с путём + слой с анимацией Position.");
                return;
            }
            var shapeLayer = null, targetLayer = null;
            for (var i=0; i<sel.length; i++) {
                var L = sel[i];
                if (L.matchName === "ADBE Vector Layer" && !shapeLayer) shapeLayer = L;
                else {
                    try {
                        var pp = L.property("ADBE Transform Group").property("ADBE Position");
                        if (pp && pp.numKeys >= 2) targetLayer = L;
                    } catch(e){}
                }
            }
            if (!shapeLayer || !targetLayer) {
                alert("Нужно: один Shape Layer + один слой с анимацией Position.");
                return;
            }
            var tpos = targetLayer.property("ADBE Transform Group").property("ADBE Position");
            var firstT = tpos.keyTime(1);
            var lastT  = tpos.keyTime(tpos.numKeys);
            var contents = shapeLayer.property("ADBE Root Vectors Group");
            if (contents.numProperties === 0) { alert("Shape Layer пустой."); return; }
            var firstGroup = contents.property(1);
            if (firstGroup.matchName !== "ADBE Vector Group") { alert("Первый элемент должен быть Vector Group."); return; }
            var groupContents = firstGroup.property("ADBE Vectors Group");
            var trim = groupContents.addProperty("ADBE Vector Filter - Trim");
            var endProp = trim.property("ADBE Vector Trim End");
            endProp.setValueAtTime(firstT, 0);
            endProp.setValueAtTime(lastT,  100);
            applyEaseToAllKeys(endProp, "Sine", "InOut");
        } catch (e) { alert("Reveal error: " + e.toString()); }
        app.endUndoGroup();
    }

    function runEasing(curveName, side) {
        app.beginUndoGroup("MP - Easing " + curveName + " " + side);
        try {
            var comp = getActiveComp(); if (!comp) return;
            var props = comp.selectedProperties;
            if (!props || props.length === 0) { alert("Выдели свойство с ключевыми кадрами."); return; }
            var applied = 0;
            for (var i=0; i<props.length; i++) {
                var p = props[i];
                if (!p || typeof p.numKeys === "undefined" || p.numKeys < 2) continue;
                applyEaseToAllKeys(p, curveName, side);
                applied++;
            }
            if (applied === 0) alert("Не найдено свойств с ключами.");
        } catch (e) { alert("Easing error: " + e.toString()); }
        app.endUndoGroup();
    }

    function applyEaseToAllKeys(prop, curveName, side) {
        if (!EASINGS[curveName]) curveName = "Sine";
        var e = EASINGS[curveName];
        var inSide  = (side === "In"  || side === "InOut") ? e["In"]  : [0, 33.33];
        var outSide = (side === "Out" || side === "InOut") ? e["Out"] : [0, 33.33];
        var n = prop.numKeys;
        for (var k=1; k<=n; k++) {
            try {
                var dim = 1;
                try { var v = prop.keyValue(k); if (v && v.length) dim = v.length; } catch(eDim){}
                var inArr = [], outArr = [];
                for (var d=0; d<dim; d++) {
                    inArr.push(new KeyframeEase(inSide[0],  inSide[1]));
                    outArr.push(new KeyframeEase(outSide[0], outSide[1]));
                }
                prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                prop.setTemporalEaseAtKey(k, inArr, outArr);
            } catch(eK){}
        }
    }

    // RUN
    if (parseFloat(app.version) < 8.0) {
        alert("Требуется After Effects CS3 или новее.");
    } else {
        var myWin = buildUI(this);
        if (myWin instanceof Window) { myWin.center(); myWin.show(); }
        else { myWin.layout.layout(true); }
    }
}
