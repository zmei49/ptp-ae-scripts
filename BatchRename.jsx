(function ptp_BatchRename(thisObj) {
    var SCRIPT_NAME = "ptp_BatchRename";
    var SCRIPT_VERSION = "v1.1";
    // v1.1 changelog:
    //   • Fix: $name/$idx/$comp/$type заменяются ДО ###, чтобы токены
    //          в старых именах не конфликтовали с нумерацией
    //   • Fix: валидация пустого pattern
    //   • Fix: поддержка нескольких групп # независимо (###_v## работает)
    //   • Feature: Preview первых 5 итоговых имён (live-update)
    //   • Feature: новые токены $comp (имя композиции), $type (тип слоя)
    //   • Help переведён на русский

    function layerTypeStr(L) {
        try {
            if (L instanceof TextLayer)   return "text";
            if (L instanceof ShapeLayer)  return "shape";
            if (L instanceof CameraLayer) return "camera";
            if (L instanceof LightLayer)  return "light";
            if (L.nullLayer)              return "null";
            if (L.adjustmentLayer)        return "adj";
            if (L.source && L.source instanceof CompItem)   return "comp";
            if (L.source && L.source instanceof FootageItem) return "footage";
        } catch(e) {}
        return "layer";
    }

    function padNum(n, width) {
        var s = String(n);
        while (s.length < width) s = "0" + s;
        return s;
    }

    // Заменяет ВСЕ группы # в pattern независимой нумерацией,
    // каждая группа получает своё значение из массива nums (по порядку появления).
    // Если nums короче — оставшиеся группы получают nums[последний].
    function applyHashGroups(pattern, num) {
        return pattern.replace(/#+/g, function(match){
            return padNum(num, match.length);
        });
    }

    function buildName(pattern, layer, num, comp) {
        // Порядок замен важен: сначала $-токены (из старого имени),
        // потом ### (чтобы # в старых именах не попали в нумерацию).
        var oldName = layer.name;
        var s = pattern
            .replace(/\$name/g, oldName)
            .replace(/\$idx/g,  String(layer.index))
            .replace(/\$comp/g, comp.name)
            .replace(/\$type/g, layerTypeStr(layer));
        s = applyHashGroups(s, num);
        return s;
    }

    function collectTargets(comp, scope) {
        var arr = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            if (scope === 0 && !L.enabled)  continue; // visible
            if (scope === 1 && !L.selected) continue; // selected
            arr.push(L);
        }
        return arr;
    }

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel) ? thisObj
                : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, {resizeable:true});
        win.orientation = "column";
        win.alignChildren = ["fill","top"];
        win.spacing = 6;
        win.margins = 8;
        win.preferredSize.width = 320;
        win.preferredSize.height = 460;
        win.minimumSize.width = 300;
        win.minimumSize.height = 460;

        // ==== Scope ====
        var sPanel = win.add("panel", undefined, "Область");
        sPanel.orientation = "column"; sPanel.alignChildren = ["fill","top"]; sPanel.margins = 8;
        var scopeDD = sPanel.add("dropdownlist", undefined, [
            "Только видимые (глаз ON)",
            "Только выделенные",
            "Все слои"
        ]);
        scopeDD.selection = 0;
        scopeDD.alignment = ["fill","center"];
        scopeDD.minimumSize.width = 200;

        // ==== Pattern ====
        var pPanel = win.add("panel", undefined, "Шаблон");
        pPanel.orientation = "column"; pPanel.alignChildren = ["fill","top"]; pPanel.margins = 8;
        var patRow = pPanel.add("group"); patRow.orientation = "row"; patRow.alignChildren = ["fill","center"];
        var patLbl = patRow.add("statictext", undefined, "Имя:");
        patLbl.preferredSize.width = 55;
        var patET = patRow.add("edittext", undefined, "Layer_###");
        patET.alignment = ["fill","center"];
        patET.minimumSize.width = 150;
        var hintST = pPanel.add("statictext", undefined,
            "Токены: ### $name $idx $comp $type", {multiline:true});
        hintST.alignment = ["fill","top"];
        hintST.preferredSize.height = 16;

        // ==== Numbering ====
        var nPanel = win.add("panel", undefined, "Нумерация");
        nPanel.orientation = "column"; nPanel.alignChildren = ["fill","top"]; nPanel.margins = 8;

        var startRow = nPanel.add("group"); startRow.orientation = "row"; startRow.alignChildren = ["left","center"];
        var startLbl = startRow.add("statictext", undefined, "Start:");
        startLbl.preferredSize.width = 55;
        var startET = startRow.add("edittext", undefined, "1");
        startET.preferredSize.width = 60;

        var stepRow = nPanel.add("group"); stepRow.orientation = "row"; stepRow.alignChildren = ["left","center"];
        var stepLbl = stepRow.add("statictext", undefined, "Step:");
        stepLbl.preferredSize.width = 55;
        var stepET = stepRow.add("edittext", undefined, "1");
        stepET.preferredSize.width = 60;

        var orderRow = nPanel.add("group"); orderRow.orientation = "row"; orderRow.alignChildren = ["fill","center"];
        var orderLbl = orderRow.add("statictext", undefined, "Порядок:");
        orderLbl.preferredSize.width = 55;
        var orderDD = orderRow.add("dropdownlist", undefined, ["Сверху → Вниз", "Снизу → Вверх"]);
        orderDD.selection = 0;
        orderDD.alignment = ["fill","center"];
        orderDD.minimumSize.width = 150;

        // ==== Preview ====
        var prevPanel = win.add("panel", undefined, "Preview (первые 5)");
        prevPanel.orientation = "column"; prevPanel.alignChildren = ["fill","top"]; prevPanel.margins = 8;
        var prevST = prevPanel.add("statictext", undefined, "", {multiline:true});
        prevST.alignment = ["fill","top"];
        prevST.preferredSize.height = 78;

        function updatePreview(){
            try {
                var comp = app.project.activeItem;
                if (!comp || !(comp instanceof CompItem)) { prevST.text = "(нет активной композиции)"; return; }
                var pattern = patET.text;
                if (!pattern || pattern.length === 0) { prevST.text = "(пустой шаблон)"; return; }
                var start = parseInt(startET.text, 10); if (isNaN(start)) start = 1;
                var step  = parseInt(stepET.text,  10); if (isNaN(step) || step === 0) step = 1;
                var scope = scopeDD.selection.index;
                var reverse = (orderDD.selection.index === 1);

                var targets = collectTargets(comp, scope);
                if (targets.length === 0) { prevST.text = "(нет подходящих слоёв)"; return; }
                if (reverse) targets.reverse();

                var lines = [];
                var num = start;
                var lim = Math.min(5, targets.length);
                for (var j = 0; j < lim; j++) {
                    lines.push("  " + buildName(pattern, targets[j], num, comp));
                    num += step;
                }
                if (targets.length > 5) lines.push("  … всего " + targets.length + " слоёв");
                prevST.text = lines.join("\n");
            } catch(e){
                prevST.text = "(ошибка preview: " + e.toString() + ")";
            }
        }

        patET.onChanging = updatePreview;
        startET.onChanging = updatePreview;
        stepET.onChanging  = updatePreview;
        scopeDD.onChange = updatePreview;
        orderDD.onChange = updatePreview;

        // ==== Actions ====
        var btnRow = win.add("group"); btnRow.orientation = "row"; btnRow.alignChildren = ["fill","center"];
        btnRow.alignment = ["fill","bottom"];
        var refreshBtn = btnRow.add("button", undefined, "↻");
        refreshBtn.preferredSize.width = 28;
        refreshBtn.preferredSize.height = 28;
        refreshBtn.helpTip = "Обновить preview";
        var doBtn = btnRow.add("button", undefined, "Rename");
        doBtn.alignment = ["fill","center"];
        doBtn.preferredSize.height = 28;
        var helpBtn = btnRow.add("button", undefined, "?");
        helpBtn.preferredSize.width = 30;
        helpBtn.preferredSize.height = 28;

        refreshBtn.onClick = updatePreview;

        doBtn.onClick = function(){
            var comp = app.project.activeItem;
            if (!comp || !(comp instanceof CompItem)) { alert("Активная композиция не найдена."); return; }

            var pattern = patET.text;
            if (!pattern || pattern.length === 0) { alert("Шаблон пустой."); return; }

            var start = parseInt(startET.text, 10); if (isNaN(start)) start = 1;
            var step  = parseInt(stepET.text,  10); if (isNaN(step) || step === 0) step = 1;
            var scope = scopeDD.selection.index;
            var reverse = (orderDD.selection.index === 1);

            var targets = collectTargets(comp, scope);
            if (targets.length === 0) { alert("Нет подходящих слоёв."); return; }
            if (reverse) targets.reverse();

            app.beginUndoGroup(SCRIPT_NAME + " Rename");
            try {
                var num = start;
                for (var j = 0; j < targets.length; j++) {
                    targets[j].name = buildName(pattern, targets[j], num, comp);
                    num += step;
                }
            } catch(e){
                alert("Ошибка: " + e.toString());
            }
            app.endUndoGroup();
            updatePreview();
        };

        helpBtn.onClick = function(){
            alert(SCRIPT_NAME + " " + SCRIPT_VERSION + "\n\n"
                + "Массовое переименование слоёв в активной композиции.\n\n"
                + "═══ ОБЛАСТЬ ═══\n"
                + "• Только видимые — слои с включённым «глазом».\n"
                + "• Только выделенные — выделенные слои.\n"
                + "• Все слои — все слои композиции.\n\n"
                + "═══ ТОКЕНЫ ШАБЛОНА ═══\n"
                + "• ###   — номер с ведущими нулями (### = 001, #### = 0001).\n"
                + "         Можно использовать несколько групп независимо:\n"
                + "         'v##_take_###' → 'v01_take_001'.\n"
                + "• $name — исходное имя слоя.\n"
                + "• $idx  — индекс слоя в композиции.\n"
                + "• $comp — имя активной композиции.\n"
                + "• $type — тип слоя (text/shape/camera/light/null/adj/comp/footage/layer).\n\n"
                + "═══ ПРИМЕРЫ ═══\n"
                + "• Car_###           → Car_001, Car_002, …\n"
                + "• $name_v##         → OldName_v01, …\n"
                + "• $comp_$type_###   → MainComp_shape_001, …\n"
                + "• Item_$idx         → Item_3, Item_5, …\n\n"
                + "СОВЕТ: Preview показывает первые 5 имён и обновляется\n"
                + "автоматически при изменении шаблона. Кнопка ↻ — вручную.");
        };

        if (win instanceof Window) {
            win.center();
            win.show();
        } else {
            win.layout.layout(true);
            win.layout.resize();
        }

        // Initial preview
        updatePreview();
    }

    buildUI(thisObj);
})(this);
