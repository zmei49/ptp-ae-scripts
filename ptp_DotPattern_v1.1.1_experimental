

// ptp_DotPattern.jsx v1.1.1
// Around Shape + Along Path. Two independent Coverage systems: Strip + Arc.
// Install: Adobe After Effects/Support Files/Scripts/ScriptUI Panels/
// Open via: Window → ptp_DotPattern.jsx

(function (thisObj) {
    var SCRIPT_NAME = "ptp_DotPattern";
    var SCRIPT_VERSION = "v1.1.1";
    var MAX_DOTS = 2000;

    // Theme
    var COL_BG       = [0.16, 0.16, 0.18, 1];
    var COL_TEXT     = [0.88, 0.88, 0.88, 1];
    var COL_ACCENT   = [1.00, 0.60, 0.10, 1];
    var COL_DIVIDER  = [0.30, 0.30, 0.32, 1];

    // Last opts (for Re-generate Last)
    var lastOpts = null;
    var lastTargetLayerIndex = null;

    // ==================== HELPERS ====================

    function getComp() {
        var c = app.project.activeItem;
        if (!c || !(c instanceof CompItem)) {
            alert("Откройте композицию.");
            return null;
        }
        return c;
    }

    function getSelLayer(comp) {
        if (!comp.selectedLayers || comp.selectedLayers.length === 0) return null;
        return comp.selectedLayers[0];
    }

    function rgbToHex(rgb) {
        function h(x) { var s = Math.round(x * 255).toString(16); return s.length < 2 ? "0" + s : s; }
        return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
    }

    function falloff(t, type) {
        if (t < 0) t = 0; if (t > 1) t = 1;
        if (type === "linear") return t;
        if (type === "ease")   return t * t * (3 - 2 * t);
        if (type === "step")   return t < 0.5 ? 0 : 1;
        return t;
    }

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // ==================== SOURCE INFO ====================

    function getShapeColor(layer) {
        try {
            var contents = layer.property("Contents");
            if (!contents) return null;
            for (var i = 1; i <= contents.numProperties; i++) {
                var grp = contents.property(i);
                if (grp && grp.property("Contents")) {
                    var inner = grp.property("Contents");
                    for (var j = 1; j <= inner.numProperties; j++) {
                        var p = inner.property(j);
                        if (!p) continue;
                        var n = p.matchName;
                        if (n === "ADBE Vector Graphic - Fill") {
                            try { return p.property("Color").value; } catch (e1) {}
                        }
                        if (n === "ADBE Vector Graphic - Stroke") {
                            try { return p.property("Color").value; } catch (e2) {}
                        }
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function getSourceInfo(layer) {
        var comp = layer.containingComp;
        var rect = layer.sourceRectAtTime(comp.time, false);
        var pos;
        try { pos = layer.property("Transform").property("Position").value; }
        catch (e) { pos = [comp.width / 2, comp.height / 2]; }

        var cx = pos[0] + (rect.left + rect.width / 2);
        var cy = pos[1] + (rect.top + rect.height / 2);

        // shape kind detection
        var kind = "rect";
        try {
            var c = layer.property("Contents");
            if (c) {
                for (var i = 1; i <= c.numProperties; i++) {
                    var g = c.property(i);
                    if (g && g.property("Contents")) {
                        var inner = g.property("Contents");
                        for (var j = 1; j <= inner.numProperties; j++) {
                            var mn = inner.property(j).matchName;
                            if (mn === "ADBE Vector Shape - Ellipse") kind = "ellipse";
                            else if (mn === "ADBE Vector Shape - Star") kind = "polygon";
                            else if (mn === "ADBE Vector Shape - Rect") kind = "rect";
                        }
                    }
                }
            }
        } catch (e) {}

        return {
            cx: cx, cy: cy,
            w: rect.width, h: rect.height,
            kind: kind,
            color: getShapeColor(layer)
        };
    }

    // ==================== PATH SAMPLING ====================

    function findPathInLayer(layer) {
        // 1) Mask
        try {
            if (layer.mask && layer.mask.numProperties > 0) {
                var m = layer.mask(1);
                if (m) {
                    var mp = m.property("Mask Path");
                    if (mp) return { prop: mp, type: "mask" };
                }
            }
        } catch (e) {}
        // 2) Shape path
        try {
            var contents = layer.property("Contents");
            if (contents) {
                for (var i = 1; i <= contents.numProperties; i++) {
                    var grp = contents.property(i);
                    if (grp && grp.property("Contents")) {
                        var inner = grp.property("Contents");
                        for (var j = 1; j <= inner.numProperties; j++) {
                            var p = inner.property(j);
                            if (p && p.matchName === "ADBE Vector Shape - Group") {
                                var pathProp = p.property("Path");
                                if (pathProp) return { prop: pathProp, type: "shape" };
                            }
                        }
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function bezierPoint(p0, p1, p2, p3, t) {
        var u = 1 - t;
        var b0 = u * u * u;
        var b1 = 3 * u * u * t;
        var b2 = 3 * u * t * t;
        var b3 = t * t * t;
        return [
            b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
            b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]
        ];
    }

    function bezierTangent(p0, p1, p2, p3, t) {
        var u = 1 - t;
        var tx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
        var ty = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
        var len = Math.sqrt(tx * tx + ty * ty);
        if (len < 0.0001) return [1, 0];
        return [tx / len, ty / len];
    }

    function samplePath(pathInfo, layer, comp) {
        var pathProp = pathInfo.prop;
        var path = pathProp.value;
        var verts = path.vertices;
        var inT = path.inTangents;
        var outT = path.outTangents;
        var closed = path.closed;

        // layer transform
        var lpos;
        try { lpos = layer.property("Transform").property("Position").value; }
        catch (e) { lpos = [0, 0]; }

        var SAMPLES_PER_SEG = 80;
        var segments = closed ? verts.length : (verts.length - 1);
        if (segments < 1) return [];

        var samples = [];
        var cumLen = 0;
        var prevPt = null;

        for (var s = 0; s < segments; s++) {
            var i0 = s;
            var i1 = (s + 1) % verts.length;
            var p0 = [verts[i0][0] + lpos[0], verts[i0][1] + lpos[1]];
            var p3 = [verts[i1][0] + lpos[0], verts[i1][1] + lpos[1]];
            var p1 = [p0[0] + outT[i0][0], p0[1] + outT[i0][1]];
            var p2 = [p3[0] + inT[i1][0],  p3[1] + inT[i1][1]];

            for (var k = 0; k <= SAMPLES_PER_SEG; k++) {
                if (s > 0 && k === 0) continue; // не дублируем стык
                var t = k / SAMPLES_PER_SEG;
                var pt = bezierPoint(p0, p1, p2, p3, t);
                var tan = bezierTangent(p0, p1, p2, p3, t);
                var norm = [-tan[1], tan[0]];

                if (prevPt) {
                    var dx = pt[0] - prevPt[0], dy = pt[1] - prevPt[1];
                    cumLen += Math.sqrt(dx * dx + dy * dy);
                }
                prevPt = pt;

                samples.push({ pos: pt, tangent: tan, normal: norm, cumLen: cumLen });
            }
        }
        return samples;
    }

    // ==================== COVERAGE FILTERS ====================

    function passesCoverageStrip(pt, info, cov, opts) {
        if (!cov.strip) return false;
        var s = cov.strip;
        if (!s.top && !s.bottom && !s.left && !s.right && !s.center) return false;

        var cx = info.cx, cy = info.cy;
        var hW = info.w / 2, hH = info.h / 2;
        var pad = opts.padding, spread = opts.spread;
        var buf = opts.microSpacing * 2;
        var x = pt[0], y = pt[1];

        // Center buffer ring around object border
        if (s.center) {
            var inOuterFrame = (x >= cx - hW - pad - buf) && (x <= cx + hW + pad + buf) &&
                               (y >= cy - hH - pad - buf) && (y <= cy + hH + pad + buf);
            var inInnerHole  = (x > cx - hW - pad + buf) && (x < cx + hW + pad - buf) &&
                               (y > cy - hH - pad + buf) && (y < cy + hH + pad - buf);
            if (inOuterFrame && !inInnerHole) return true;
        }

        // Top strip
        if (s.top) {
            if (y < cy - hH - pad && y >= cy - hH - pad - spread &&
                x >= cx - hW && x <= cx + hW) return true;
        }
        if (s.bottom) {
            if (y > cy + hH + pad && y <= cy + hH + pad + spread &&
                x >= cx - hW && x <= cx + hW) return true;
        }
        if (s.left) {
            if (x < cx - hW - pad && x >= cx - hW - pad - spread &&
                y >= cy - hH && y <= cy + hH) return true;
        }
        if (s.right) {
            if (x > cx + hW + pad && x <= cx + hW + pad + spread &&
                y >= cy - hH && y <= cy + hH) return true;
        }
        return false;
    }

    function passesCoverageArc(pt, info, cov, opts) {
        if (!cov.arc) return false;
        var a = cov.arc;
        if (!a.top && !a.bottom && !a.left && !a.right && !a.center) return false;

        var cx = info.cx, cy = info.cy;
        var dx = pt[0] - cx, dy = pt[1] - cy;
        var ang = Math.atan2(dy, dx) * 180 / Math.PI;
        if (ang < 0) ang += 360;

        var arcAngle = opts.arcAngle || 90;
        var half = arcAngle / 2;
        var centerBoost = a.center ? 15 : 0;

        function inSector(centerDeg, hh) {
            var d = Math.abs(ang - centerDeg);
            if (d > 180) d = 360 - d;
            return d <= (hh + centerBoost);
        }

        if (a.top    && inSector(270, half)) return true;
        if (a.right  && inSector(0,   half)) return true;
        if (a.bottom && inSector(90,  half)) return true;
        if (a.left   && inSector(180, half)) return true;
        // ◆ alone — small ring around object
        if (a.center && !a.top && !a.bottom && !a.left && !a.right) {
            var dist = Math.sqrt(dx * dx + dy * dy);
            var rApprox = Math.max(info.w, info.h) / 2 + opts.padding;
            if (dist >= rApprox && dist <= rApprox + opts.microSpacing * 3) return true;
        }
        return false;
    }

    function passesCoverageAround(pt, info, cov, opts) {
        if (passesCoverageStrip(pt, info, cov, opts)) return true;
        if (passesCoverageArc(pt, info, cov, opts)) return true;
        return false;
    }

    // ==================== GENERATION: AROUND ====================

    function generateAroundPattern(info, opts) {
        var cx = info.cx, cy = info.cy;
        var hW = info.w / 2, hH = info.h / 2;
        var pad = opts.padding, spread = opts.spread;
        var spacing = opts.microSpacing;

        var x0 = cx - hW - pad - spread;
        var x1 = cx + hW + pad + spread;
        var y0 = cy - hH - pad - spread;
        var y1 = cy + hH + pad + spread;

        var allPoints = [];

        for (var y = y0; y <= y1; y += spacing) {
            for (var x = x0; x <= x1; x += spacing) {
                // skip inside object + padding
                if (x > cx - hW - pad && x < cx + hW + pad &&
                    y > cy - hH - pad && y < cy + hH + pad) continue;

                var pt = [x, y];
                if (!passesCoverageAround(pt, info, opts.coverage, opts)) continue;
                if (Math.random() > opts.density) continue;

                var distX = Math.max(0, Math.abs(x - cx) - hW);
                var distY = Math.max(0, Math.abs(y - cy) - hH);
                var dist = Math.sqrt(distX * distX + distY * distY);
                var distFromPad = Math.max(0, dist - pad);
                var t = clamp(distFromPad / spread, 0, 1);
                var op = opts.noFade ? 1 : (1 - falloff(t, opts.falloffType));

                allPoints.push({ pos: pt, opacity: op, distRank: t });
            }
        }

        // Split accent / micro
        return splitAccent(allPoints, opts);
    }

    function splitAccent(allPoints, opts) {
        var targets = [];
        if (opts.accentInner)  targets.push(0.0);
        if (opts.accentMiddle) targets.push(0.5);
        if (opts.accentOuter)  targets.push(1.0);

        var ringTol = 0.12;
        var micro = [], accent = [];
        var counter = 0;

        for (var i = 0; i < allPoints.length; i++) {
            var p = allPoints[i];
            var isAccent = false;
            if (targets.length > 0) {
                for (var k = 0; k < targets.length; k++) {
                    if (Math.abs(p.distRank - targets[k]) < ringTol) {
                        counter++;
                        if (counter % opts.accentEveryN === 0) isAccent = true;
                        break;
                    }
                }
            }
            if (isAccent) { p.opacity = 1; accent.push(p); }
            else micro.push(p);
        }
        return { micro: micro, accent: accent };
    }

    // ==================== GENERATION: ALONG ====================

    function generateAlongPattern(samples, opts) {
        var spread = opts.spread, spacing = opts.microSpacing, pad = opts.padding;
        var steps = Math.ceil(spread / spacing);
        if (steps < 1) steps = 1;

        var cov = opts.coverage;
        var allowPos =
            (cov.strip && (cov.strip.top || cov.strip.center)) ||
            (cov.arc   && (cov.arc.top   || cov.arc.center));
        var allowNeg =
            (cov.strip && (cov.strip.bottom || cov.strip.center)) ||
            (cov.arc   && (cov.arc.bottom   || cov.arc.center));
        if (!allowPos && !allowNeg) { allowPos = true; allowNeg = true; }

        var accentSpacing = 60;
        var lastAccentLen = -accentSpacing;
        var allMicro = [];
        var accent = [];
        var accentCounter = 0;

        for (var i = 0; i < samples.length; i++) {
            var s = samples[i];
            var nx = s.normal[0], ny = s.normal[1];

            // accent along path
            if ((s.cumLen - lastAccentLen) >= accentSpacing) {
                lastAccentLen = s.cumLen;
                accentCounter++;
                // simulate "Every N-th" by treating path-accents as ring with N filter
                if (opts.accentEveryN <= 1 || (accentCounter % opts.accentEveryN === 0)) {
                    if (opts.accentInner || opts.accentMiddle || opts.accentOuter) {
                        accent.push({ pos: s.pos, opacity: 1, distRank: 0 });
                    }
                }
            }

            for (var d = 1; d <= steps; d++) {
                var offset = pad + d * spacing;
                if (offset > pad + spread) break;
                var t = clamp((d * spacing) / spread, 0, 1);
                var op = opts.noFade ? 1 : (1 - falloff(t, opts.falloffType));

                if (allowPos && Math.random() <= opts.density) {
                    allMicro.push({
                        pos: [s.pos[0] + nx * offset, s.pos[1] + ny * offset],
                        opacity: op, distRank: t
                    });
                }
                if (allowNeg && Math.random() <= opts.density) {
                    allMicro.push({
                        pos: [s.pos[0] - nx * offset, s.pos[1] - ny * offset],
                        opacity: op, distRank: t
                    });
                }
            }
        }

        return { micro: allMicro, accent: accent };
    }

    // ==================== LAYER CREATION ====================

    function createDotLayer(comp, name, dots, size, color) {
        if (dots.length === 0) return null;

        // Compute bbox center for anchor
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < dots.length; i++) {
            var p = dots[i].pos;
            if (p[0] < minX) minX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] > maxY) maxY = p[1];
        }
        var bbCx = (minX + maxX) / 2;
        var bbCy = (minY + maxY) / 2;
        var bbW = Math.max(10, maxX - minX);
        var bbH = Math.max(10, maxY - minY);

        var layer = comp.layers.addShape();
        layer.name = name;

        // Group by opacity rounded to 0.05 to reduce shape count
        var buckets = {};
        for (var j = 0; j < dots.length; j++) {
            var d = dots[j];
            var key = Math.round(d.opacity * 20) / 20;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(d.pos);
        }

        var contents = layer.property("Contents");

        for (var op in buckets) {
            if (!buckets.hasOwnProperty(op)) continue;
            var pts = buckets[op];
            var group = contents.addProperty("ADBE Vector Group");
            group.name = "Op_" + op;
            var inner = group.property("Contents");

            for (var m = 0; m < pts.length; m++) {
                var x = pts[m][0] - bbCx;
                var y = pts[m][1] - bbCy;
                addCircle(inner, x, y, size);
            }
            var fill = inner.addProperty("ADBE Vector Graphic - Fill");
            fill.property("Color").setValue(color);
            fill.property("Opacity").setValue(parseFloat(op) * 100);
        }

        // Position layer at bbox center, anchor [0,0]
        try {
            layer.property("Transform").property("Position").setValue([bbCx, bbCy]);
            layer.property("Transform").property("Anchor Point").setValue([0, 0]);
        } catch (e) {}

        return layer;
    }

    function addCircle(inner, x, y, size) {
        var g = inner.addProperty("ADBE Vector Group");
        g.name = "Dot";
        var ginner = g.property("Contents");
        var ell = ginner.addProperty("ADBE Vector Shape - Ellipse");
        ell.property("Size").setValue([size, size]);
        ell.property("Position").setValue([0, 0]);
        try {
            g.property("Transform").property("Position").setValue([x, y]);
        } catch (e) {}
    }

    // ==================== MODE DETECTION ====================

    function detectMode(layer) {
        // Returns "around" or "along"
        var path = findPathInLayer(layer);
        if (!path) return "around";
        // если есть маска — однозначно along
        if (path.type === "mask") return "along";
        // shape: проверяем число вершин — если 4 (rect) или ellipse — around, иначе along
        try {
            var v = path.prop.value.vertices;
            if (v.length <= 4) return "around";
        } catch (e) {}
        return "along";
    }

    // ==================== MAIN GENERATE ====================

    function generatePattern(targetLayer, opts) {
        var comp = targetLayer.containingComp;
        var mode = opts.mode;
        if (mode === "auto") mode = detectMode(targetLayer);

        var result = null;
        var info = null;

        if (mode === "along") {
            var pathInfo = findPathInLayer(targetLayer);
            if (!pathInfo) {
                alert("Выделите Mask Path или Shape Path для режима Along Path.\nИли выделите слой с одной маской — путь возьмётся автоматически.");
                return;
            }
            var samples = samplePath(pathInfo, targetLayer, comp);
            if (!samples || samples.length === 0) {
                alert("Не удалось получить точки на пути.");
                return;
            }
            result = generateAlongPattern(samples, opts);
            // info нужен для цвета объекта
            info = { color: getShapeColor(targetLayer) };
        } else {
            info = getSourceInfo(targetLayer);
            result = generateAroundPattern(info, opts);
        }

        var total = result.micro.length + result.accent.length;
        if (total === 0) {
            alert("Нет точек для генерации.\nПроверьте Coverage (включите хотя бы одно направление).");
            return;
        }
        if (total > MAX_DOTS) {
            var go = confirm("Будет создано " + total + " точек (лимит " + MAX_DOTS + ").\nПродолжить?");
            if (!go) return;
        }

        var microColor = (opts.useObjColorMicro && info && info.color) ? info.color : opts.microColor;
        var accentColor = (opts.useObjColorAccent && info && info.color) ? info.color : opts.accentColor;

        app.beginUndoGroup(SCRIPT_NAME + " — Generate");
        var microLayer = null, accentLayer = null;
        if (result.micro.length > 0)
            microLayer = createDotLayer(comp, "DotPattern_Micro", result.micro, opts.microSize, microColor);
        if (result.accent.length > 0)
            accentLayer = createDotLayer(comp, "DotPattern_Accent", result.accent, opts.accentSize, accentColor);

        // Pre-comp
        if (opts.preComp) {
            var idxs = [];
            if (accentLayer) idxs.push(accentLayer.index);
            if (microLayer) idxs.push(microLayer.index);
            if (idxs.length > 0) {
                try { comp.layers.precompose(idxs, "DotPattern_PreComp", true); } catch (e) {}
            }
        } else if (opts.parentToSource) {
            try {
                if (microLayer) microLayer.parent = targetLayer;
                if (accentLayer) accentLayer.parent = targetLayer;
            } catch (e) {}
        }

        app.endUndoGroup();

        lastOpts = cloneOpts(opts);
        lastTargetLayerIndex = targetLayer.index;
    }

    function cloneOpts(o) {
        var n = {};
        for (var k in o) {
            if (o.hasOwnProperty(k)) {
                if (k === "coverage") {
                    n.coverage = {
                        strip: {
                            top: o.coverage.strip.top, bottom: o.coverage.strip.bottom,
                            left: o.coverage.strip.left, right: o.coverage.strip.right,
                            center: o.coverage.strip.center
                        },
                        arc: {
                            top: o.coverage.arc.top, bottom: o.coverage.arc.bottom,
                            left: o.coverage.arc.left, right: o.coverage.arc.right,
                            center: o.coverage.arc.center
                        }
                    };
                } else if (o[k] && o[k].length === 4) {
                    n[k] = [o[k][0], o[k][1], o[k][2], o[k][3]];
                } else {
                    n[k] = o[k];
                }
            }
        }
        return n;
    }

    // ==================== UI HELPERS ====================

    function addDivider(parent) {
        var g = parent.add("group");
        g.alignment = ["fill", "top"];
        g.minimumSize.height = 1;
        g.maximumSize.height = 1;
        g.graphics.backgroundColor = g.graphics.newBrush(g.graphics.BrushType.SOLID_COLOR, COL_DIVIDER);
    }

    function addSectionLabel(parent, text) {
        var st = parent.add("statictext", undefined, text);
        st.graphics.foregroundColor = st.graphics.newPen(st.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);
        return st;
    }

    function styleSwatch(btn, rgb) {
        try {
            btn.fillBrush = btn.graphics.newBrush(btn.graphics.BrushType.SOLID_COLOR, rgb);
            btn.onDraw = function () {
                btn.graphics.drawOSControl();
                btn.graphics.rectPath(2, 2, btn.size.width - 4, btn.size.height - 4);
                btn.graphics.fillPath(btn.fillBrush);
            };
        } catch (e) {}
    }

    function pickColor(currentRgb) {
        var hex = rgbToHex(currentRgb);
        var dec = parseInt(hex.substring(1), 16);
        var res = $.colorPicker(dec);
        if (res === -1) return null;
        var r = ((res >> 16) & 0xFF) / 255;
        var g = ((res >> 8) & 0xFF) / 255;
        var b = (res & 0xFF) / 255;
        return [r, g, b, 1];
    }

    // ==================== UI ====================

    function buildUI(parent) {
        var w = (parent instanceof Panel) ? parent
              : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, { resizeable: true });
        w.orientation = "column";
        w.alignChildren = ["fill", "top"];
        w.spacing = 6;
        w.margins = 10;

        try { w.graphics.backgroundColor = w.graphics.newBrush(w.graphics.BrushType.SOLID_COLOR, COL_BG); } catch (e) {}

        // Title
        var title = w.add("statictext", undefined, SCRIPT_NAME + "  " + SCRIPT_VERSION);
        title.graphics.foregroundColor = title.graphics.newPen(title.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);

        // MODE row
        var modeRow = w.add("group");
        modeRow.orientation = "row";
        modeRow.alignChildren = ["left", "center"];
        var modeLbl = modeRow.add("statictext", undefined, "MODE:");
        modeLbl.graphics.foregroundColor = modeLbl.graphics.newPen(modeLbl.graphics.PenType.SOLID_COLOR, COL_ACCENT, 1);
        var modeDD = modeRow.add("dropdownlist", undefined, ["Auto-detect", "Around Shape", "Along Path"]);
        modeDD.selection = 0;

        addDivider(w);

        // COVERAGE
        addSectionLabel(w, "COVERAGE");

        var covRow = w.add("group");
        covRow.orientation = "row";
        covRow.alignChildren = ["fill", "top"];
        covRow.spacing = 12;

        function buildCross(parent, title) {
            var box = parent.add("panel", undefined, title);
            box.orientation = "column";
            box.alignChildren = ["center", "center"];
            box.margins = 6;
            box.spacing = 2;

            var topRow = box.add("group"); topRow.alignment = "center";
            var cbT = topRow.add("checkbox", undefined, "▲");

            var midRow = box.add("group"); midRow.alignment = "center"; midRow.spacing = 4;
            var cbL = midRow.add("checkbox", undefined, "◀");
            var cbC = midRow.add("checkbox", undefined, "◆");
            var cbR = midRow.add("checkbox", undefined, "▶");

            var botRow = box.add("group"); botRow.alignment = "center";
            var cbB = botRow.add("checkbox", undefined, "▼");

            return { top: cbT, left: cbL, center: cbC, right: cbR, bottom: cbB };
        }

        var stripCross = buildCross(covRow, "Strip");
        var arcCross   = buildCross(covRow, "Arc");

        // defaults
        stripCross.top.value = true;
        stripCross.center.value = true;

        // Arc Angle slider
        var arcAngleRow = w.add("group");
        arcAngleRow.orientation = "row";
        arcAngleRow.add("statictext", undefined, "Arc Angle:");
        var arcAngleSlider = arcAngleRow.add("slider", undefined, 90, 60, 180);
        arcAngleSlider.preferredSize.width = 120;
        var arcAngleVal = arcAngleRow.add("statictext", undefined, "90°");
        arcAngleVal.preferredSize.width = 40;
        arcAngleSlider.onChanging = function () {
            arcAngleVal.text = Math.round(arcAngleSlider.value) + "°";
        };

        function updateCoverageState() {
            var idx = modeDD.selection ? modeDD.selection.index : 0;
            var isAlong = (idx === 2);
            var stripL = [stripCross.left, stripCross.right];
            var arcL   = [arcCross.left,   arcCross.right];
            if (isAlong) {
                stripL[0].enabled = false; stripL[1].enabled = false;
                arcL[0].enabled = false;   arcL[1].enabled = false;
            } else {
                stripL[0].enabled = true; stripL[1].enabled = true;
                arcL[0].enabled = true;   arcL[1].enabled = true;
            }
            var anyArc = arcCross.top.value || arcCross.bottom.value ||
                         arcCross.left.value || arcCross.right.value || arcCross.center.value;
            arcAngleSlider.enabled = anyArc;
            arcAngleVal.enabled = anyArc;
        }
        modeDD.onChange = updateCoverageState;
        arcCross.top.onClick = updateCoverageState;
        arcCross.bottom.onClick = updateCoverageState;
        arcCross.left.onClick = updateCoverageState;
        arcCross.right.onClick = updateCoverageState;
        arcCross.center.onClick = updateCoverageState;
        updateCoverageState();

        addDivider(w);

        // MICRO GRID
        addSectionLabel(w, "MICRO GRID");

        var microState = { color: [0.788, 0.761, 0.4, 1] };

        var microSizeG = w.add("group");
        microSizeG.add("statictext", undefined, "Size:");
        var microSizeSl = microSizeG.add("slider", undefined, 2, 1, 10);
        microSizeSl.preferredSize.width = 100;
        var microSizeVal = microSizeG.add("statictext", undefined, "2 px");
        microSizeVal.preferredSize.width = 40;
        microSizeSl.onChanging = function () { microSizeVal.text = Math.round(microSizeSl.value) + " px"; };

        var microColorG = w.add("group");
        microColorG.add("statictext", undefined, "Color:");
        var microColorBtn = microColorG.add("button", undefined, " ");
        microColorBtn.preferredSize = [40, 20];
        styleSwatch(microColorBtn, microState.color);
        microColorBtn.onClick = function () {
            var c = pickColor(microState.color);
            if (c) { microState.color = c; styleSwatch(microColorBtn, c); }
        };
        var microUseObjCB = microColorG.add("checkbox", undefined, "Use object color");

        var microSpacingG = w.add("group");
        microSpacingG.add("statictext", undefined, "Spacing:");
        var microSpacingSl = microSpacingG.add("slider", undefined, 8, 3, 30);
        microSpacingSl.preferredSize.width = 100;
        var microSpacingVal = microSpacingG.add("statictext", undefined, "8 px");
        microSpacingVal.preferredSize.width = 40;
        microSpacingSl.onChanging = function () { microSpacingVal.text = Math.round(microSpacingSl.value) + " px"; };

        var padG = w.add("group");
        padG.add("statictext", undefined, "Padding:");
        var padSl = padG.add("slider", undefined, 20, 0, 200);
        padSl.preferredSize.width = 100;
        var padVal = padG.add("statictext", undefined, "20 px");
        padVal.preferredSize.width = 40;
        padSl.onChanging = function () { padVal.text = Math.round(padSl.value) + " px"; };

        var spreadG = w.add("group");
        spreadG.add("statictext", undefined, "Spread:");
        var spreadSl = spreadG.add("slider", undefined, 120, 20, 400);
        spreadSl.preferredSize.width = 100;
        var spreadVal = spreadG.add("statictext", undefined, "120 px");
        spreadVal.preferredSize.width = 40;
        spreadSl.onChanging = function () { spreadVal.text = Math.round(spreadSl.value) + " px"; };

        var densG = w.add("group");
        densG.add("statictext", undefined, "Density:");
        var densSl = densG.add("slider", undefined, 0.7, 0.3, 1);
        densSl.preferredSize.width = 100;
        var densVal = densG.add("statictext", undefined, "0.70");
        densVal.preferredSize.width = 40;
        densSl.onChanging = function () { densVal.text = densSl.value.toFixed(2); };

        var falloffG = w.add("group");
        falloffG.add("statictext", undefined, "Falloff:");
        var falloffDD = falloffG.add("dropdownlist", undefined, ["linear", "ease", "step"]);
        falloffDD.selection = 0;
        var noFadeCB = falloffG.add("checkbox", undefined, "No fade");

        addDivider(w);

        // ACCENT DOTS
        addSectionLabel(w, "ACCENT DOTS");

        var accentState = { color: [1, 0.961, 0.4, 1] };

        var accSizeG = w.add("group");
        accSizeG.add("statictext", undefined, "Size:");
        var accSizeSl = accSizeG.add("slider", undefined, 6, 2, 20);
        accSizeSl.preferredSize.width = 100;
        var accSizeVal = accSizeG.add("statictext", undefined, "6 px");
        accSizeVal.preferredSize.width = 40;
        accSizeSl.onChanging = function () { accSizeVal.text = Math.round(accSizeSl.value) + " px"; };

        var accColorG = w.add("group");
        accColorG.add("statictext", undefined, "Color:");
        var accColorBtn = accColorG.add("button", undefined, " ");
        accColorBtn.preferredSize = [40, 20];
        styleSwatch(accColorBtn, accentState.color);
        accColorBtn.onClick = function () {
            var c = pickColor(accentState.color);
            if (c) { accentState.color = c; styleSwatch(accColorBtn, c); }
        };
        var accUseObjCB = accColorG.add("checkbox", undefined, "Use object color");

        var accNthG = w.add("group");
        accNthG.add("statictext", undefined, "Every N-th:");
        var accNthSl = accNthG.add("slider", undefined, 6, 2, 20);
        accNthSl.preferredSize.width = 100;
        var accNthVal = accNthG.add("statictext", undefined, "6");
        accNthVal.preferredSize.width = 40;
        accNthSl.onChanging = function () { accNthVal.text = String(Math.round(accNthSl.value)); };

        var ringG = w.add("group");
        ringG.add("statictext", undefined, "Rings:");
        var accInnerCB  = ringG.add("checkbox", undefined, "Inner");
        var accMiddleCB = ringG.add("checkbox", undefined, "Middle");
        var accOuterCB  = ringG.add("checkbox", undefined, "Outer");
        accMiddleCB.value = true;

        addDivider(w);

        // OUTPUT
        addSectionLabel(w, "OUTPUT");
        var outG = w.add("group");
        var preCompCB = outG.add("checkbox", undefined, "Pre-comp result");
        var parentCB = outG.add("checkbox", undefined, "Parent to source");

        addDivider(w);

        // BUTTONS
        var btnRow = w.add("group");
        btnRow.alignment = ["fill", "top"];
        var genBtn = btnRow.add("button", undefined, "Create Pattern");
        var regenBtn = btnRow.add("button", undefined, "Re-generate Last");
        var helpBtn = btnRow.add("button", undefined, "?");
        helpBtn.preferredSize.width = 30;

        function readState() {
            return {
                mode: ["auto", "around", "along"][modeDD.selection.index],
                coverage: {
                    strip: {
                        top: stripCross.top.value, bottom: stripCross.bottom.value,
                        left: stripCross.left.value && stripCross.left.enabled,
                        right: stripCross.right.value && stripCross.right.enabled,
                        center: stripCross.center.value
                    },
                    arc: {
                        top: arcCross.top.value, bottom: arcCross.bottom.value,
                        left: arcCross.left.value && arcCross.left.enabled,
                        right: arcCross.right.value && arcCross.right.enabled,
                        center: arcCross.center.value
                    }
                },
                arcAngle: arcAngleSlider.value,
                microSize: Math.round(microSizeSl.value),
                microColor: microState.color,
                useObjColorMicro: microUseObjCB.value,
                microSpacing: Math.round(microSpacingSl.value),
                padding: Math.round(padSl.value),
                spread: Math.round(spreadSl.value),
                density: densSl.value,
                falloffType: falloffDD.selection.text,
                noFade: noFadeCB.value,
                accentSize: Math.round(accSizeSl.value),
                accentColor: accentState.color,
                useObjColorAccent: accUseObjCB.value,
                accentEveryN: Math.round(accNthSl.value),
                accentInner: accInnerCB.value,
                accentMiddle: accMiddleCB.value,
                accentOuter: accOuterCB.value,
                preComp: preCompCB.value,
                parentToSource: parentCB.value
            };
        }

        genBtn.onClick = function () {
            var comp = getComp(); if (!comp) return;
            var layer = getSelLayer(comp);
            if (!layer) { alert("Выделите слой-источник."); return; }
            var opts = readState();
            generatePattern(layer, opts);
        };

        regenBtn.onClick = function () {
            var comp = getComp(); if (!comp) return;
            if (!lastOpts) { alert("Сначала создайте паттерн кнопкой Create Pattern."); return; }
            var layer = getSelLayer(comp);
            if (!layer) {
                if (lastTargetLayerIndex && comp.layer(lastTargetLayerIndex)) {
                    layer = comp.layer(lastTargetLayerIndex);
                } else {
                    alert("Выделите слой-источник."); return;
                }
            }
            generatePattern(layer, lastOpts);
        };

        helpBtn.onClick = function () { alert(getHelpText()); };

        if (w instanceof Window) { w.center(); w.show(); }
        else { w.layout.layout(true); w.layout.resize(); }

        return w;
    }

    function getHelpText() {
        return SCRIPT_NAME + " " + SCRIPT_VERSION + "\n\n" +
            "MODE\n" +
            "  Auto-detect — определяет режим по выделенному слою.\n" +
            "  Around Shape — паттерн вокруг фигуры (rect/ellipse).\n" +
            "  Along Path — паттерн вдоль маски или Shape Path.\n\n" +
            "COVERAGE — два независимых креста:\n" +
            "  Strip — прямоугольные полосы строго над/под/слева/справа от объекта.\n" +
            "  Arc — угловые сектора (дуги). Ширина сектора — Arc Angle (60-180°).\n" +
            "  ◆ Center — в Strip заполняет узкое кольцо вплотную к границе;\n" +
            "             в Arc расширяет сектор на ±15°.\n" +
            "  Точка проходит если её принимает Strip ИЛИ Arc.\n\n" +
            "В Along Path активны только Top/Bottom/Center (стороны нормали к пути).\n" +
            "Left/Right серые и игнорируются.\n\n" +
            "ACCENT RINGS\n" +
            "  Inner — кольцо у границы объекта.\n" +
            "  Middle — кольцо в середине spread.\n" +
            "  Outer — кольцо на внешнем краю.\n" +
            "  Every N-th — какая часть точек кольца становится акцентом.\n\n" +
            "LIMITS: максимум " + MAX_DOTS + " точек (с подтверждением).\n";
    }

    buildUI(thisObj);
})(this);


Патч UI — точечные правки

Открой ptp_DotPattern.jsx, найди функцию buildCross внутри buildUI() и замени её целиком на эту версию:

function buildCross(parent, title) {
    var box = parent.add("panel", undefined, title);
    box.orientation = "column";
    box.alignChildren = ["center", "center"];
    box.margins = 8;
    box.spacing = 4;
    box.preferredSize.width = 110;

    var CB_W = 28; // фиксированная ширина чекбокса

    var topRow = box.add("group"); topRow.alignment = "center"; topRow.spacing = 4;
    var cbT = topRow.add("checkbox", undefined, "▲");
    cbT.preferredSize = [CB_W, 22];

    var midRow = box.add("group"); midRow.alignment = "center"; midRow.spacing = 4;
    var cbL = midRow.add("checkbox", undefined, "◀");
    cbL.preferredSize = [CB_W, 22];
    var cbC = midRow.add("checkbox", undefined, "◆");
    cbC.preferredSize = [CB_W, 22];
    var cbR = midRow.add("checkbox", undefined, "▶");
    cbR.preferredSize = [CB_W, 22];

    var botRow = box.add("group"); botRow.alignment = "center"; botRow.spacing = 4;
    var cbB = botRow.add("checkbox", undefined, "▼");
    cbB.preferredSize = [CB_W, 22];

    return { top: cbT, left: cbL, center: cbC, right: cbR, bottom: cbB };
}

И сразу после строки

var title = w.add("statictext", undefined, SCRIPT_NAME + "  " + SCRIPT_VERSION);

добавь:

title.preferredSize.width = 200;

Чтобы заголовок целиком влезал.

Также найди строку с covRow:

covRow.spacing = 12;

и замени на:

covRow.spacing = 8;
covRow.alignment = "center";
