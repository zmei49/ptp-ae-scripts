// ============================================================
// ptp_PopupCascade.jsx
// v1.0 — Cascading emergency popup windows with GPS data
// Author: ptp toolkit
// Install: Save into "Support Files/Scripts/ScriptUI Panels/"
// Run via: Window -> ptp_PopupCascade.jsx
// ============================================================

(function ptp_PopupCascade(thisObj) {

    var SCRIPT_NAME = "ptp_PopupCascade";
    var SCRIPT_VERSION = "v1.0";

    var COL = {
        bg:        [0.16, 0.16, 0.17, 1],
        accentTxt: [1.00, 0.65, 0.10, 1],
        divider:   [0.30, 0.30, 0.32, 1]
    };

    var DEFAULT_BG     = [0.10, 0.10, 0.10];
    var DEFAULT_STROKE = [1, 1, 1];
    var DEFAULT_BANNER = [1, 0.2, 0.2];
    var DEFAULT_TEXT   = [1, 1, 1];
    var DEFAULT_ICON   = [1, 0.2, 0.2];

    var MONO_FONTS = "Consolas"; // fallback автоматический если нет

    // ============================================================
    // GPS DATA TEMPLATES
    // ============================================================
    var GPS_FIELDS = [
        ["LAT", function(){ return (Math.random()*180-90).toFixed(4) + (Math.random()<0.5?"°N":"°S"); }],
        ["LON", function(){ return (Math.random()*360-180).toFixed(4) + (Math.random()<0.5?"°E":"°W"); }],
        ["SPD", function(){ return (Math.random()*150).toFixed(1) + " km/h"; }],
        ["HDG", function(){ return Math.floor(Math.random()*360) + "°"; }],
        ["ALT", function(){ return Math.floor(Math.random()*3000) + " m"; }],
        ["TIME", function(){ return pad(Math.floor(Math.random()*24))+":"+pad(Math.floor(Math.random()*60))+":"+pad(Math.floor(Math.random()*60)); }],
        ["DIST", function(){ return (Math.random()*500).toFixed(1) + " km"; }],
        ["ETA", function(){ return pad(Math.floor(Math.random()*24))+":"+pad(Math.floor(Math.random()*60))+":"+pad(Math.floor(Math.random()*60)); }],
        ["SAT", function(){ return Math.floor(Math.random()*15+5)+"/24"; }],
        ["ACC", function(){ return "±" + (Math.random()*5+0.5).toFixed(1) + " m"; }],
        ["ROUTE", function(){ return String.fromCharCode(65+Math.floor(Math.random()*26)) + "-" + Math.floor(Math.random()*900+100); }],
        ["WPT", function(){ return Math.floor(Math.random()*12+1)+"/12"; }],
        ["FUEL", function(){ return Math.floor(Math.random()*100) + "%"; }],
        ["TEMP", function(){ return (Math.random()*40-5).toFixed(1) + "°C"; }],
        ["ODO", function(){ return formatThousands(Math.floor(Math.random()*200000)) + " km"; }],
        ["AVG", function(){ return Math.floor(Math.random()*100+30) + " km/h"; }],
        ["TRK", function(){ var st=["STABLE","SEARCH","LOCK","WEAK","DRIFT"]; return st[Math.floor(Math.random()*st.length)]; }],
        ["SIG", function(){ var st=["GOOD","FAIR","STRONG","WEAK","LOST"]; return st[Math.floor(Math.random()*st.length)]; }],
        ["NEXT", function(){ return (Math.random()*20).toFixed(1) + " km"; }],
        ["DUR", function(){ return pad(Math.floor(Math.random()*12))+":"+pad(Math.floor(Math.random()*60))+":"+pad(Math.floor(Math.random()*60)); }],
        ["BAT", function(){ return Math.floor(Math.random()*100) + "%"; }],
        ["GSM", function(){ return Math.floor(Math.random()*5+1) + "/5"; }],
        ["POS", function(){ return "OK"; }],
        ["MODE", function(){ var m=["AUTO","MANUAL","TRACK","STDBY"]; return m[Math.floor(Math.random()*m.length)]; }]
    ];

    function pad(n){ n=String(n); return n.length<2?"0"+n:n; }
    function formatThousands(n){
        var s = String(n), r = "";
        while (s.length > 3) { r = "," + s.slice(-3) + r; s = s.slice(0,-3); }
        return s + r;
    }

    function randomGpsLine() {
        // строка = две пары "ключ: значение"
        var i1 = Math.floor(Math.random() * GPS_FIELDS.length);
        var i2;
        do { i2 = Math.floor(Math.random() * GPS_FIELDS.length); } while (i2 === i1);
        var f1 = GPS_FIELDS[i1], f2 = GPS_FIELDS[i2];
        // выравниваем пробелами
        var left  = f1[0] + ": " + f1[1]();
        var right = f2[0] + ": " + f2[1]();
        while (left.length < 18) left += " ";
        return left + " " + right;
    }

    function randomTitleId(themeMode) {
        var prefix;
        if (themeMode === "system") {
            var arr = ["SYS","CORE","UNIT","NODE","HUB","CTL"];
            prefix = arr[Math.floor(Math.random()*arr.length)];
        } else if (themeMode === "gps") {
            var arr2 = ["GPS_TRACKER","ROUTE_LOG","NAV_DATA","GEO_FIX","WAYPOINT","TELEMETRY"];
            return arr2[Math.floor(Math.random()*arr2.length)] + "_" + Math.floor(Math.random()*99);
        } else {
            prefix = "SYS";
        }
        return prefix + "_" + Math.floor(Math.random()*900+100) + "_E" + Math.floor(Math.random()*9000+1000);
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) { alert("Откройте композицию."); return null; }
        return c;
    }
    function rgbToHex(rgb) {
        function p(n){ var h=Math.round(n*255).toString(16); return h.length<2?"0"+h:h; }
        return "#" + p(rgb[0]) + p(rgb[1]) + p(rgb[2]);
    }
    function pickColor(currentRgb) {
        var hex = rgbToHex(currentRgb);
        var dec = parseInt(hex.substring(1), 16);
        var res = $.colorPicker(dec);
        if (res === -1) return null;
        return [((res>>16)&0xFF)/255, ((res>>8)&0xFF)/255, (res&0xFF)/255];
    }

    // ============================================================
    // PRIMITIVE BUILDERS (shape layer contents)
    // ============================================================
    function addRect(inner, w, h, roundness) {
        var r = inner.addProperty("ADBE Vector Shape - Rect");
        r.property("Size").setValue([w, h]);
        r.property("Position").setValue([0, 0]);
        try { r.property("Roundness").setValue(roundness || 0); } catch(e){}
        return r;
    }
    function addEllipse(inner, w, h) {
        var e = inner.addProperty("ADBE Vector Shape - Ellipse");
        e.property("Size").setValue([w, h]);
        e.property("Position").setValue([0, 0]);
        return e;
    }
    function addFill(inner, color, opacity) {
        var f = inner.addProperty("ADBE Vector Graphic - Fill");
        f.property("Color").setValue(color);
        f.property("Opacity").setValue(opacity != null ? opacity : 100);
        return f;
    }
    function addStroke(inner, color, width, opacity) {
        var s = inner.addProperty("ADBE Vector Graphic - Stroke");
        s.property("Color").setValue(color);
        s.property("Stroke Width").setValue(width);
        s.property("Opacity").setValue(opacity != null ? opacity : 100);
        return s;
    }
    function addLinePath(inner, x1, y1, x2, y2) {
        var sp = inner.addProperty("ADBE Vector Shape - Group");
        var pathVal = new Shape();
        pathVal.vertices = [[x1, y1], [x2, y2]];
        pathVal.inTangents = [[0,0],[0,0]];
        pathVal.outTangents = [[0,0],[0,0]];
        pathVal.closed = false;
        sp.property("Path").setValue(pathVal);
        return sp;
    }

    // ============================================================
    // BUILD ONE WINDOW (creates pre-comp)
    // ============================================================
    function buildWindow(parentComp, opts, idx) {
        var W = opts.winWidth;
        // авто-высота на основе содержимого
        var titleH = 22;
        var bannerH = opts.showBanner ? 26 : 0;
        var iconH = opts.showIcon ? 24 : 0;
        var lineH = opts.lineHeight;
        var contentH = opts.linesCount * lineH;
        var padding = 12;
        var H = titleH + (iconH > 0 ? iconH + 4 : 0) + bannerH + 8 + contentH + padding * 2;

        // создаём пре-комп
        var precomp = app.project.items.addComp(
            "Popup_" + idx,
            W,
            H,
            1, // pixelAspect
            parentComp.duration,
            parentComp.frameRate
        );

        // ===== Background rect =====
        var bgLayer = precomp.layers.addShape();
        bgLayer.name = "BG";
        var bgContents = bgLayer.property("ADBE Root Vectors Group");
        var bgGroup = bgContents.addProperty("ADBE Vector Group");
        var bgInner = bgGroup.property("ADBE Vectors Group");
        addRect(bgInner, W - 4, H - 4, opts.cornerRadius);
        addFill(bgInner, opts.bgColor, 100);
        addStroke(bgInner, opts.strokeColor, opts.strokeWidth, 100);
        try {
            bgLayer.property("Transform").property("Position").setValue([W/2, H/2]);
            bgLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
        } catch(e){}

        var yCursor = padding;

        // ===== Title bar =====
        var titleText = opts.useCustomTitle && opts.customTitle ? opts.customTitle : randomTitleId(opts.titleTheme);
        var titleLayer = precomp.layers.addText(titleText);
        try {
            var td = titleLayer.property("Source Text").value;
            td.font = opts.fontName;
            td.fontSize = opts.fontSize;
            td.fillColor = opts.strokeColor;
            td.justification = ParagraphJustification.LEFT_JUSTIFY;
            titleLayer.property("Source Text").setValue(td);
        } catch(e) {}
        try {
            titleLayer.property("Transform").property("Position").setValue([padding + 4, yCursor + opts.fontSize]);
        } catch(e){}
        titleLayer.name = "title";
        yCursor += titleH;

        // ===== Icon (! в красном круге, верхний левый край ниже title) =====
        if (opts.showIcon) {
            var iconLayer = precomp.layers.addShape();
            iconLayer.name = "icon";
            var ic = iconLayer.property("ADBE Root Vectors Group");
            // circle
            var circG = ic.addProperty("ADBE Vector Group");
            var circIn = circG.property("ADBE Vectors Group");
            addEllipse(circIn, 18, 18);
            addFill(circIn, opts.iconColor, 100);
            try {
                iconLayer.property("Transform").property("Position").setValue([padding + 14, yCursor + 9]);
                iconLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
            } catch(e){}
            // "!" text как отдельный слой поверх
            var bangLayer = precomp.layers.addText("!");
            try {
                var bd = bangLayer.property("Source Text").value;
                bd.font = opts.fontName;
                bd.fontSize = 14;
                bd.fillColor = [1,1,1];
                bd.justification = ParagraphJustification.CENTER_JUSTIFY;
                bangLayer.property("Source Text").setValue(bd);
                bangLayer.property("Transform").property("Position").setValue([padding + 14, yCursor + 14]);
            } catch(e){}
            bangLayer.name = "bang";
            yCursor += iconH + 2;
        }

        // ===== Emergency banner with warning stripes =====
        if (opts.showBanner) {
            var bannerLayer = precomp.layers.addShape();
            bannerLayer.name = "banner";
            var bc = bannerLayer.property("ADBE Root Vectors Group");
            var bcG = bc.addProperty("ADBE Vector Group");
            var bcIn = bcG.property("ADBE Vectors Group");
            // основной красный прямоугольник
            addRect(bcIn, W - padding*2 - 4, bannerH - 4, 0);
            addFill(bcIn, opts.bannerColor, 100);
            try {
                bannerLayer.property("Transform").property("Position").setValue([W/2, yCursor + bannerH/2]);
                bannerLayer.property("Transform").property("Anchor Point").setValue([0, 0]);
            } catch(e){}

            // warning stripes по краям (диагональные линии)
            var stripesL = precomp.layers.addShape();
            stripesL.name = "stripes_L";
            buildStripes(stripesL, 40, bannerH - 6, opts.strokeColor);
            try {
                stripesL.property("Transform").property("Position").setValue([padding + 4, yCursor + 3]);
            } catch(e){}

            var stripesR = precomp.layers.addShape();
            stripesR.name = "stripes_R";
            buildStripes(stripesR, 40, bannerH - 6, opts.strokeColor);
            try {
                stripesR.property("Transform").property("Position").setValue([W - padding - 44, yCursor + 3]);
            } catch(e){}

            // banner text
            var bannerTextLayer = precomp.layers.addText(opts.bannerText);
            try {
                var btd = bannerTextLayer.property("Source Text").value;
                btd.font = opts.fontName;
                btd.fontSize = opts.fontSize + 2;
                btd.fillColor = [1,1,1];
                btd.justification = ParagraphJustification.CENTER_JUSTIFY;
                bannerTextLayer.property("Source Text").setValue(btd);
                bannerTextLayer.property("Transform").property("Position").setValue([W/2, yCursor + bannerH/2 + opts.fontSize/2]);
            } catch(e){}
            bannerTextLayer.name = "banner_text";

            yCursor += bannerH + 8;
        }

        // ===== GPS data lines =====
        for (var i = 0; i < opts.linesCount; i++) {
            var lineText = randomGpsLine();
            var lineLayer = precomp.layers.addText(lineText);
            try {
                var ld = lineLayer.property("Source Text").value;
                ld.font = opts.fontName;
                ld.fontSize = opts.fontSize;
                ld.fillColor = opts.textColor;
                ld.justification = ParagraphJustification.LEFT_JUSTIFY;
                lineLayer.property("Source Text").setValue(ld);
                lineLayer.property("Transform").property("Position").setValue([padding + 4, yCursor + opts.fontSize]);
            } catch(e){}
            lineLayer.name = "line_" + i;
            yCursor += lineH;
        }

        return precomp;
    }

    function buildStripes(layer, w, h, color) {
        var c = layer.property("ADBE Root Vectors Group");
        var g = c.addProperty("ADBE Vector Group");
        var inner = g.property("ADBE Vectors Group");

        var step = 6;
        var count = Math.floor((w + h) / step);
        for (var i = 0; i < count; i++) {
            var x = i * step;
            var ls = addLinePath(inner, x, 0, x - h, h);
        }
        addStroke(inner, color, 1.5, 100);
        try {
            layer.property("Transform").property("Anchor Point").setValue([0, 0]);
        } catch(e){}
    }

    // ============================================================
    // PLACE COPY OF WINDOW IN MAIN COMP
    // ============================================================
    function placeCopy(comp, precomp, idx, total, opts, spawnTime, cycleTotal) {
        var layer = comp.layers.add(precomp);
        layer.name = "Popup_copy_" + idx;

        // позиция со смещением
        var basePos = opts.cascadeOrigin;
        var px = basePos[0] + opts.offsetX * idx;
        var py = basePos[1] + opts.offsetY * idx;
        layer.property("Transform").property("Position").setValue([px, py]);

        // целевая opacity для этой копии
        var targetOpacity;
        if (total > 1) {
            targetOpacity = opts.firstOpacity - (opts.firstOpacity - opts.lastOpacity) * (idx / (total - 1));
        } else {
            targetOpacity = opts.firstOpacity;
        }

        // === Animations ===
        var op = layer.property("Transform").property("Opacity");
        var sc = layer.property("Transform").property("Scale");
        var t0 = spawnTime;

        // Scale pop: 0 -> 110 -> 100
        sc.setValueAtTime(t0, [0, 0]);
        sc.setValueAtTime(t0 + opts.popDuration * 0.5, [110, 110]);
        sc.setValueAtTime(t0 + opts.popDuration, [100, 100]);
        try { setEaseOut(sc); } catch(e){}

        // Opacity: 0 -> target за popDuration
        op.setValueAtTime(t0, 0);
        op.setValueAtTime(t0 + opts.popDuration, targetOpacity);

        // Hold до начала fade-out-all
        var fadeOutStart = opts.spawnDuration + opts.holdDuration;
        op.setValueAtTime(fadeOutStart, targetOpacity);

        // Fade out all together
        var fadeEnd = fadeOutStart + opts.fadeOutDuration;
        op.setValueAtTime(fadeEnd, 0);

        // Loop forever
        if (opts.loopForever) {
            try { op.expression = 'loopOut("cycle")'; } catch(e){}
            try { sc.expression = 'loopOut("cycle")'; } catch(e){}
        }

        // Time remap не нужен; pre-comp проигрывается с 0
        return layer;
    }

    function setEaseOut(prop) {
        try {
            var ease = new KeyframeEase(0, 75);
            for (var k = 1; k <= prop.numKeys; k++) {
                var nd = prop.propertyValueType === PropertyValueType.TwoD ? [ease, ease] : [ease, ease, ease];
                prop.setTemporalEaseAtKey(k, nd, nd);
            }
        } catch(e) {}
    }

    // ============================================================
    // MAIN GENERATE
    // ============================================================
    function generateCascade(opts) {
        var comp = getComp(); if (!comp) return;

        var cycleTotal = opts.spawnDuration + opts.holdDuration + opts.fadeOutDuration + opts.pauseDuration;
        opts.cycleTotal = cycleTotal;

        // Origin = центр композиции (юзер потом двигает Null)
        opts.cascadeOrigin = [comp.width / 2, comp.height / 2];

        app.beginUndoGroup(SCRIPT_NAME + " — Cascade");

        // 1. Создаём один шаблонный pre-comp (его потом дублируем)
        var basePrecomp = buildWindow(comp, opts, 1);

        // 2. Создаём родительский Null для удобного перетаскивания каскада
        var nullLayer = comp.layers.addNull();
        nullLayer.name = "PopupCascade_CTRL_" + Math.floor(Math.random()*900+100);
        try {
            nullLayer.property("Transform").property("Position").setValue([comp.width/2, comp.height/2]);
        } catch(e){}

        // 3. Размещаем N копий, привязываем к Null
        var stagger = opts.spawnDuration / Math.max(1, opts.copiesCount);
        var placed = [];

        // первая копия — оригинальный precomp, остальные — тоже добавляются по тому же precomp (это создаёт несколько слоёв одного источника)
        for (var i = 0; i < opts.copiesCount; i++) {
            var spawnTime = i * stagger;
            var layer = placeCopy(comp, basePrecomp, i, opts.copiesCount, opts, spawnTime, cycleTotal);
            try { layer.parent = nullLayer; } catch(e){}
            placed.push(layer);
        }

        // Reverse order: первая (idx 0) должна быть СВЕРХУ, последняя (с минимальной opacity) — снизу
        // В AE верх timeline = передний план. addComp добавляет наверх, поэтому idx 0 окажется внизу списка.
        // Сортируем: первая копия должна быть на самом верху таймлайна
        // (мы добавляли последовательно — последняя копия сейчас наверху. Нужно перевернуть.)
        for (var j = 0; j < placed.length; j++) {
            placed[j].moveToBeginning();
        }
        // Теперь placed[0] окажется в самом верху (потому что moveToBeginning последнего перевернёт всё в обратном порядке).
        // Это даёт правильный z-order: первая копия (самая яркая) сверху.

        // Null поверх всех
        try { nullLayer.moveToBeginning(); } catch(e){}

        app.endUndoGroup();
    }

    // ============================================================
    // UI HELPERS
    // ============================================================
    function addDivider(parent) {
        var g = parent.add("group");
        g.alignment = ["fill", "top"];
        g.minimumSize.height = 1;
        g.maximumSize.height = 1;
        g.graphics.backgroundColor = g.graphics.newBrush(g.graphics.BrushType.SOLID_COLOR, COL.divider);
    }
    function addSectionLabel(parent, text) {
        var st = parent.add("statictext", undefined, text);
        st.graphics.foregroundColor = st.graphics.newPen(st.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1);
        return st;
    }
    function styleSwatch(btn, rgb) {
        try {
            btn.fillBrush = btn.graphics.newBrush(btn.graphics.BrushType.SOLID_COLOR, [rgb[0],rgb[1],rgb[2],1]);
            btn.onDraw = function () {
                btn.graphics.drawOSControl();
                btn.graphics.rectPath(2, 2, btn.size.width - 4, btn.size.height - 4);
                btn.graphics.fillPath(btn.fillBrush);
            };
        } catch (e) {}
    }
    function mkSlider(parent, label, init, lo, hi, suffix, isFloat) {
        var g = parent.add("group");
        var l = g.add("statictext", undefined, label);
        l.preferredSize.width = 100;
        var s = g.add("slider", undefined, init, lo, hi);
        s.preferredSize.width = 110;
        var v = g.add("statictext", undefined, (isFloat ? init.toFixed(2) : Math.round(init)) + (suffix||""));
        v.preferredSize.width = 60;
        s.onChanging = function(){
            v.text = (isFloat ? s.value.toFixed(2) : Math.round(s.value)) + (suffix||"");
        };
        return s;
    }

    // ============================================================
    // UI
    // ============================================================
    function buildUI(thisObj) {
        var w = (thisObj instanceof Panel) ? thisObj
              : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, {resizeable:true});
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.spacing = 6;
        w.margins = 10;
        try { w.graphics.backgroundColor = w.graphics.newBrush(w.graphics.BrushType.SOLID_COLOR, COL.bg); } catch(e) {}

        var title = w.add("statictext", undefined, SCRIPT_NAME + "  " + SCRIPT_VERSION);
        title.preferredSize.width = 280;
        title.graphics.foregroundColor = title.graphics.newPen(title.graphics.PenType.SOLID_COLOR, COL.accentTxt, 1);

        // ============ WINDOW ============
        addSectionLabel(w, "WINDOW");
        var winWidthSl = mkSlider(w, "Width:", 400, 200, 800, " px");
        var linesCountSl = mkSlider(w, "Data lines:", 6, 2, 12, "");
        var lineHeightSl = mkSlider(w, "Line height:", 18, 12, 30, " px");
        var cornerSl = mkSlider(w, "Corner radius:", 8, 0, 20, " px");
        var strokeWSl = mkSlider(w, "Stroke W:", 2, 1, 4, " px");

        // Colors
        var state = {
            bg: DEFAULT_BG.slice(),
            stroke: DEFAULT_STROKE.slice(),
            banner: DEFAULT_BANNER.slice(),
            text: DEFAULT_TEXT.slice(),
            icon: DEFAULT_ICON.slice()
        };

        function colorRow(parent, label, key) {
            var g = parent.add("group");
            var l = g.add("statictext", undefined, label);
            l.preferredSize.width = 100;
            var btn = g.add("button", undefined, " ");
            btn.preferredSize = [40, 20];
            styleSwatch(btn, state[key]);
            btn.onClick = function(){
                var c = pickColor(state[key]);
                if (c) { state[key] = c; styleSwatch(btn, c); }
            };
            return btn;
        }
        colorRow(w, "BG color:", "bg");
        colorRow(w, "Stroke color:", "stroke");
        colorRow(w, "Banner color:", "banner");
        colorRow(w, "Text color:", "text");
        colorRow(w, "Icon color:", "icon");

        addDivider(w);

        // ============ CONTENT ============
        addSectionLabel(w, "CONTENT");

        var titleG = w.add("group");
        var tL = titleG.add("statictext", undefined, "Title mode:");
        tL.preferredSize.width = 100;
        var titleDD = titleG.add("dropdownlist", undefined, ["Custom", "Random SYS_##", "GPS theme"]);
        titleDD.selection = 2;

        var customTitleG = w.add("group");
        var ctL = customTitleG.add("statictext", undefined, "Custom title:");
        ctL.preferredSize.width = 100;
        var customTitleET = customTitleG.add("edittext", undefined, "SYS_LP359_E5868");
        customTitleET.preferredSize.width = 200;

        var bannerG = w.add("group");
        var bL = bannerG.add("statictext", undefined, "Banner text:");
        bL.preferredSize.width = 100;
        var bannerET = bannerG.add("edittext", undefined, "EMERGENCY");
        bannerET.preferredSize.width = 200;

        var togglesG = w.add("group");
        var showIconCB = togglesG.add("checkbox", undefined, "Show ! icon");
        var showBannerCB = togglesG.add("checkbox", undefined, "Show banner");
        showIconCB.value = true;
        showBannerCB.value = true;

        addDivider(w);

        // ============ CASCADE ============
        addSectionLabel(w, "CASCADE");
        var copiesSl = mkSlider(w, "Copies:", 6, 1, 15, "");
        var offsetXSl = mkSlider(w, "Offset X:", -25, -80, 80, " px");
        var offsetYSl = mkSlider(w, "Offset Y:", -20, -80, 80, " px");
        var firstOpSl = mkSlider(w, "First opacity:", 100, 50, 100, "%");
        var lastOpSl = mkSlider(w, "Last opacity:", 15, 5, 80, "%");

        addDivider(w);

        // ============ ANIMATION ============
        addSectionLabel(w, "ANIMATION");
        var spawnDurSl = mkSlider(w, "Spawn dur:", 0.3, 0.1, 10, " s", true);
        var holdDurSl = mkSlider(w, "Hold dur:", 1.8, 0.3, 15.0, " s", true);
        var fadeOutDurSl = mkSlider(w, "Fade-out dur:", 0.3, 0.1, 10, " s", true);
        var pauseDurSl = mkSlider(w, "Pause:", 0.4, 0.0, 10.0, " s", true);
        var popDurSl = mkSlider(w, "Pop dur (per win):", 0.1, 0.05, 5.0, " s", true);
        var loopG = w.add("group");
        var loopCB = loopG.add("checkbox", undefined, "Loop forever");
        loopCB.value = true;

        addDivider(w);

        // ============ BUTTONS ============
        var btnRow = w.add("group");
        btnRow.alignment = ["fill","top"];
        var createBtn = btnRow.add("button", undefined, "Create Cascade");
        var helpBtn = btnRow.add("button", undefined, "?");
        helpBtn.preferredSize.width = 30;

        function readState() {
            var titleMode = ["custom","system","gps"][titleDD.selection.index];
            var fontSize = Math.max(10, Math.min(14, Math.round(winWidthSl.value / 30)));
            return {
                winWidth: Math.round(winWidthSl.value),
                linesCount: Math.round(linesCountSl.value),
                lineHeight: Math.round(lineHeightSl.value),
                cornerRadius: Math.round(cornerSl.value),
                strokeWidth: Math.round(strokeWSl.value),
                bgColor: state.bg,
                strokeColor: state.stroke,
                bannerColor: state.banner,
                textColor: state.text,
                iconColor: state.icon,
                fontName: "Consolas",
                fontSize: fontSize,
                titleTheme: titleMode,
                useCustomTitle: (titleMode === "custom"),
                customTitle: customTitleET.text,
                bannerText: bannerET.text,
                showIcon: showIconCB.value,
                showBanner: showBannerCB.value,
                copiesCount: Math.round(copiesSl.value),
                offsetX: Math.round(offsetXSl.value),
                offsetY: Math.round(offsetYSl.value),
                firstOpacity: Math.round(firstOpSl.value),
                lastOpacity: Math.round(lastOpSl.value),
                spawnDuration: spawnDurSl.value,
                holdDuration: holdDurSl.value,
                fadeOutDuration: fadeOutDurSl.value,
                pauseDuration: pauseDurSl.value,
                popDuration: popDurSl.value,
                loopForever: loopCB.value
            };
        }

        createBtn.onClick = function(){
            generateCascade(readState());
        };
        helpBtn.onClick = function(){ alert(getHelpText()); };

        if (w instanceof Window) { w.center(); w.show(); }
        else { w.layout.layout(true); w.layout.resize(); }
    }

    function getHelpText() {
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n" +
            "═══════════════════════════════════════\n\n" +
            "НАЗНАЧЕНИЕ\n" +
            "Создаёт каскад окон emergency-уведомлений с GPS-данными.\n" +
            "Каждое окно — это pre-comp; копии располагаются со смещением\n" +
            "и убывающей прозрачностью, появляются последовательно,\n" +
            "затем все вместе исчезают и цикл повторяется.\n\n" +

            "═══ WINDOW ═══\n" +
            "Width — ширина окна. Высота вычисляется автоматически.\n" +
            "Data lines — количество строк с GPS-данными (2-12).\n" +
            "Line height — высота одной строки.\n" +
            "Corner radius — скругление углов окна.\n" +
            "Stroke W — толщина обводки.\n" +
            "5 цветов — BG, Stroke, Banner, Text, Icon.\n\n" +

            "═══ CONTENT ═══\n" +
            "Title mode:\n" +
            "  Custom — твой текст в заголовке.\n" +
            "  Random SYS_## — авто-генерация ID типа SYS_359_E5868.\n" +
            "  GPS theme — GPS_TRACKER_##, ROUTE_LOG_##, и т.д.\n" +
            "Banner text — текст в красной полосе (по умолчанию EMERGENCY).\n" +
            "Show ! icon — показать красный кружок с восклицанием.\n" +
            "Show banner — показать красную полосу с warning-полосками.\n\n" +

            "═══ CASCADE ═══\n" +
            "Copies — количество копий окон (1-15).\n" +
            "Offset X/Y — смещение между копиями. Отрицательные значения =\n" +
            "    влево/вверх. Любая диагональ настраивается.\n" +
            "First opacity — прозрачность первой (передней) копии.\n" +
            "Last opacity — прозрачность последней (задней) копии.\n\n" +

            "═══ ANIMATION ═══\n" +
            "Spawn dur — сколько длится появление всех окон по очереди.\n" +
            "Hold dur — сколько окна стоят статично.\n" +
            "Fade-out dur — за сколько все окна исчезают одновременно.\n" +
            "Pause — пауза перед следующим циклом.\n" +
            "Pop dur (per win) — длительность scale-pop эффекта для одного окна.\n" +
            "Loop forever — зациклить через loopOut(cycle).\n\n" +

            "═══ ПРОЦЕСС ═══\n" +
            "1. Открой композицию.\n" +
            "2. Настрой параметры.\n" +
            "3. Нажми Create Cascade.\n" +
            "4. Создаются: pre-comp Popup_1, N копий в основной композиции,\n" +
            "   и Null PopupCascade_CTRL_##. Двигай Null чтобы переместить\n" +
            "   весь каскад.\n" +
            "5. При повторном Create — создаётся новый каскад поверх.\n" +
            "   Старый можешь удалить вручную.\n\n" +

            "═══ GPS DATA ═══\n" +
            "Каждая строка содержит две пары ключ:значение.\n" +
            "Поля: LAT, LON, SPD, HDG, ALT, TIME, DIST, ETA, SAT, ACC,\n" +
            "ROUTE, WPT, FUEL, TEMP, ODO, AVG, TRK, SIG, NEXT, DUR,\n" +
            "BAT, GSM, POS, MODE. Значения генерируются случайно при\n" +
            "каждом Create. Все копии используют один pre-comp, поэтому\n" +
            "текст в каждой копии одинаковый.\n\n" +

            "═══ СОВЕТЫ ═══\n" +
            "• Для классического D4 — Copies=7, OffsetX=-25, OffsetY=-20,\n" +
            "  Last opacity=10.\n" +
            "• Для горизонтального ряда — OffsetY=0, OffsetX=30.\n" +
            "• Чтобы изменить GPS-данные — удали Popup_1 pre-comp и\n" +
            "  пересоздай каскад.\n\n" +

            "Версия: " + SCRIPT_VERSION + " | Cascading popup windows";
    }

    buildUI(thisObj);

})(this);

