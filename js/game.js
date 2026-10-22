// Silniční závod – pseudo-3D závody (princip: silnice po segmentech, kreslení po řádcích od horizontu)
(function () {
    'use strict';

    var W = 256, H = 192, HY = 72, HS = W / 2, VS = 96;
    var SEG = 200;              // délka segmentu
    var ROADW = 1000;           // polovina šířky silnice
    var CAMH = 1000, CAMD = 0.84, PZ = CAMH * CAMD;
    var DRAW = 60;              // kolik segmentů se kreslí
    var DT = 0.02;
    var MAXSP = SEG * 50 * 0.8; // 40 segmentů za sekundu
    var ACC = MAXSP / 4.5, BRK = MAXSP / 1.4, DEC = MAXSP / 6, OFFDEC = MAXSP / 1.6, OFFLIM = MAXSP * 0.25;
    var PAD = DRAW + 60;
    var STAGE_LEN = 1100;
    var PLAYER_HW = 0.14;

    // rychlý obdélník přímo do přímé vrstvy (typed array fill; Z.rect je pomalý kvůli Math.min v cyklu)
    var OV = Z.ov;
    function rect(x, y, w, h, c) {
        var x0 = Math.floor(x), x1 = Math.floor(x + w), y0 = Math.floor(y), y1 = Math.floor(y + h);
        if (x0 < 0) { x0 = 0; }
        if (x1 > W) { x1 = W; }
        if (y0 < 0) { y0 = 0; }
        if (y1 > H) { y1 = H; }
        if (x1 <= x0) { return; }
        for (var yy = y0; yy < y1; yy++) { OV.fill(c, yy * W + x0, yy * W + x1); }
    }

    // ---------- Sprity (řetězce; 'q' rozbalí zápis typu "z5b3" = 5x z, 3x b)
    function q(s) {
        var out = '', re = /(.)(\d+)/g, m;
        while ((m = re.exec(s))) { out += new Array(+m[2] + 1).join(m[1]); }
        return out;
    }
    function mk(a) { return a.map(q); }
    function parse(rows) {
        var runs = [], h = rows.length, w = rows[0].length;
        rows.forEach(function (r, y) {
            if (r.length !== w) { throw new Error('Sprite: nestejna sirka radku ' + y + ' (' + r.length + ' vs ' + w + ')'); }
            var x = 0;
            while (x < w) {
                var ch = r.charAt(x);
                if (ch === '.') { x++; continue; }
                var e = x;
                while (e < w && r.charAt(e) === ch) { e++; }
                runs.push([y, x, e - x, ch]);
                x = e;
            }
        });
        return { w: w, h: h, runs: runs };
    }
    function rep(c, n) { return new Array(n + 1).join(c); }
    function pineRows(widths, wmax, topCount) {
        var rows = [];
        widths.forEach(function (w, i) {
            var side = (wmax - w) / 2;
            rows.push(rep('.', side) + rep(i < topCount ? 'a' : 'p', w) + rep('.', side));
        });
        for (var i = 0; i < 4; i++) { rows.push(rep('.', (wmax - 2) / 2) + 'nn' + rep('.', (wmax - 2) / 2)); }
        return rows;
    }
    function buildingRows(w, h) {
        var rows = [];
        for (var y = 0; y < h; y++) {
            var r = '';
            for (var x = 0; x < w; x++) {
                var win = y > 2 && y % 3 === 1 && x > 1 && x < w - 2 && (x % 4 === 2 || x % 4 === 3);
                r += win ? 'y' : 'B';
            }
            rows.push(y === 0 ? '.' + r.substr(1, w - 2) + '.' : r);
        }
        return rows;
    }
    function billboardRows() {
        var rows = [rep('b', 28), 'b' + rep('i', 26) + 'b'];
        for (var y = 0; y < 10; y++) {
            var r = 'b';
            for (var x = 0; x < 26; x++) { r += (y > 1 && y < 8 && x > 2 && x < 23 && (x % 3 !== 0)) ? 'w' : (y === 0 || y === 9 ? 'i' : 'i'); }
            rows.push(r + 'b');
        }
        rows.push(rep('b', 28));
        for (var p = 0; p < 9; p++) { rows.push(rep('.', 6) + 'nn' + rep('.', 12) + 'nn' + rep('.', 6)); }
        return rows;
    }

    var SP = {};
    SP.palm = parse(mk([
        '.6g9.6', '.3g15.3', '.1g19.1', 'g21', 'g3.15g3', 'g2.17g2', '.9n3.9', '.10n2.9', '.10n2.9', '.10n2.9', '.10n2.9', '.10n2.9',
        '.10n2.9', '.10n2.9', '.10n2.9', '.10n2.9', '.10n2.9', '.9n3.9', '.9n3.9', '.9n3.9'
    ]));
    SP.cactus = parse(mk([
        '.5c2.5', '.5c2.5', '.1c1.3c2.3c1.1', '.1c1.3c2.3c1.1', '.1c1.3c2.3c1.1', '.1c10.1', '.5c2.5', '.5c2.5', '.5c2.5', '.5c2.5', '.5c2.5', '.4c4.4'
    ]));
    SP.rock = parse(mk(['.4r6.4', '.2r10.2', '.1r12.1', 'r14', 'r14', 'd14']));
    SP.bush = parse(mk(['.3g6.3', '.1g10.1', 'g12', 'g12', 'g12']));
    SP.pine = parse(pineRows([2, 4, 6, 8, 4, 6, 8, 10, 12, 14, 16], 16, 0));
    SP.snow = parse(pineRows([2, 4, 6, 8, 4, 6, 8, 10, 12, 14, 16], 16, 4));
    SP.building = parse(buildingRows(24, 46));
    SP.tower = parse(buildingRows(16, 64));
    SP.billboard = parse(billboardRows());
    SP.lamp = parse(mk(['.2l5.2', '.3l3.3'].concat(new Array(23).join('|').split('|').map(function () { return '.4p1.4'; }))));
    // auto zezadu (24x12)
    SP.car = parse(mk([
        '.6b12.6', '.4b2c12b2.4', '.3b3c12b3.3', '.2b20.2', '.1b22.1', 'b1l4b14l4b1', 'b24', 'b2d6w8d6b2', 'd1b22d1',
        '.1t3d16t3.1', '.1t3d16t3.1', '.1t3.16t3.1'
    ]));
    // nákladní auto zezadu (24x15)
    SP.truck = parse(mk([
        '.1e22.1', 'e24', 'e24', 'e24', 'e2v20e2', 'e2v20e2', 'e2v20e2', 'e24', 'e24', 'd24', 'b2l4b12l4b2', 'b2d20b2',
        '.1t4d14t4.1', '.1t4.14t4.1', '.1t4.14t4.1'
    ]));

    var CARCOLS = [14, 11, 13, 12, 15, 9, 6];

    // ---------- Motivy etap
    var TH = {
        coast: {
            name: 'POBŘEŽÍ', sky: [[9, 20], [13, 46], [15, 72]], sun: [196, 34, 8, 14], floor: [1, 5],
            hills: [{ col: 4, amp: 12, k1: 2, k2: 5, p: 1, f: 0.5 }],
            grass: [14, 6], rumble: [2, 15], road: 0, objs: ['palm', 'palm', 'billboard', 'bush'], dens: 0.34
        },
        desert: {
            name: 'POUŠŤ', sky: [[13, 30], [14, 54], [6, 72]], sun: [60, 30, 10, 15], floor: [2, 6],
            hills: [{ col: 3, amp: 16, k1: 3, k2: 7, p: 2, f: 0.4 }, { col: 2, amp: 10, k1: 2, k2: 6, p: 4, f: 0.8 }],
            grass: [2, 10], rumble: [14, 2], road: 0, objs: ['cactus', 'cactus', 'rock', 'billboard'], dens: 0.3
        },
        forest: {
            name: 'LES', sky: [[1, 16], [5, 44], [13, 72]], sun: null, floor: [4, 4],
            hills: [{ col: 1, amp: 18, k1: 2, k2: 6, p: 3, f: 0.35 }, { col: 4, amp: 12, k1: 3, k2: 7, p: 0, f: 0.8 }],
            grass: [4, 12], rumble: [2, 15], road: 0, objs: ['pine', 'pine', 'pine', 'bush', 'billboard'], dens: 0.5
        },
        city: {
            name: 'MĚSTO', sky: [[0, 26], [1, 52], [9, 72]], sun: null, stars: true, floor: [0, 0],
            hills: [{ col: 1, amp: 14, k1: 5, k2: 11, p: 1, f: 0.5, step: 6 }, { col: 3, amp: 9, k1: 7, k2: 13, p: 2, f: 0.9, step: 4 }],
            grass: [1, 0], rumble: [10, 15], road: 0, objs: ['building', 'tower', 'billboard', 'lamp'], dens: 0.42
        },
        winter: {
            name: 'ZIMA', sky: [[5, 28], [13, 54], [15, 72]], sun: [210, 26, 6, 15], floor: [15, 15],
            hills: [{ col: 7, amp: 24, k1: 2, k2: 5, p: 5, f: 0.35 }, { col: 15, amp: 12, k1: 3, k2: 8, p: 1, f: 0.7 }],
            grass: [15, 7], rumble: [2, 15], road: 0, objs: ['snow', 'snow', 'snow', 'rock', 'billboard'], dens: 0.45
        },
        dusk: {
            name: 'SOUMRAK', sky: [[1, 14], [3, 30], [2, 46], [10, 60], [14, 72]], sun: [128, 62, 14, 14], floor: [1, 3],
            hills: [{ col: 0, amp: 14, k1: 2, k2: 6, p: 0, f: 0.4 }],
            grass: [3, 2], rumble: [14, 2], road: 0, objs: ['palm', 'palm', 'billboard', 'lamp'], dens: 0.34, dark: true
        },
        night: {
            name: 'NOC', sky: [[0, 40], [1, 72]], sun: [200, 24, 9, 15], stars: true, floor: [0, 0],
            hills: [{ col: 1, amp: 22, k1: 2, k2: 7, p: 4, f: 0.4 }, { col: 8, amp: 10, k1: 3, k2: 9, p: 2, f: 0.8 }],
            grass: [0, 1], rumble: [11, 15], road: 0, objs: ['lamp', 'lamp', 'tower', 'pine', 'billboard'], dens: 0.38, dark: true
        }
    };
    // Graf etap: L/R = volba na křižovatce
    var STAGES = {
        0: { th: 'coast', no: 1, next: { L: 1, R: 2 } },
        1: { th: 'desert', no: 2, next: 3 },
        2: { th: 'forest', no: 2, next: 3 },
        3: { th: 'city', no: 3, next: { L: 4, R: 5 } },
        4: { th: 'winter', no: 4, next: 6 },
        5: { th: 'dusk', no: 4, next: 6 },
        6: { th: 'night', no: 5, final: true }
    };
    var TOTAL = 5;
    var BONUS = [0, 32, 30, 30, 28];     // sekundy za kontrolní bod po etapě 1..4
    var START_TIME = 55;

    // profily kulis
    Object.keys(TH).forEach(function (k) {
        TH[k].hills.forEach(function (l) {
            l.prof = [];
            for (var x = 0; x < 256; x++) {
                var a = x / 256 * 6.2832;
                var h = l.amp * (0.55 + 0.27 * Math.sin(a * l.k1 + l.p) + 0.18 * Math.sin(a * l.k2 + l.p * 2.3));
                if (l.step) { h = Math.round(h / l.step) * l.step; }
                l.prof.push(Math.max(1, Math.round(h)));
            }
        });
        var r = Z.rng(k.length * 131 + 7), st = [];
        for (var i = 0; i < 36; i++) { st.push([Math.floor(r() * 256), Math.floor(r() * 56) + 2, r() < 0.3 ? 15 : 7]); }
        TH[k].starList = st;
    });

    // ---------- Stav hry
    var G = { state: 'title' };
    var track, N, cars, th, stageId, pos, speed, px, timeT, score, startT, crashT, msg, msgT, bgOff, hi, stageNo;
    var goT = 0, passed, endT, tickN, demoIdx, demoPos, titleT, over, newHi;
    var CL = { sx1: [], sy1: [], sc1: [], sx2: [], sy2: [], sc2: [], clip: [], vis: [] };

    // ---------- Generování trati
    function ease(a, b, p) { return a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5); }
    function easeIn(a, b, p) { return a + (b - a) * p * p; }
    function easeOut(a, b, p) { return a + (b - a) * (1 - (1 - p) * (1 - p)); }

    function build(id, len, seedAdd) {
        var st = STAGES[id], T = TH[st.th];
        var R = Z.rng(id * 7919 + 101 + (seedAdd || 0));
        var segs = [], lastY = 0;
        function add(curve, y) {
            segs.push({ i: segs.length, curve: curve, y1: lastY, y2: y, spr: [] });
            lastY = y;
        }
        function road(e, h, l, curve, y) {
            var startY = lastY, endY = startY + y * SEG, total = e + h + l, n;
            for (n = 0; n < e; n++) { add(easeIn(0, curve, n / e), ease(startY, endY, n / total)); }
            for (n = 0; n < h; n++) { add(curve, ease(startY, endY, (e + n) / total)); }
            for (n = 0; n < l; n++) { add(easeOut(curve, 0, n / l), ease(startY, endY, (e + h + n) / total)); }
        }
        var diff = Math.min(1, (st.no - 1) / 4);
        var maxC = 2.2 + diff * 2.4;
        function rnd(a, b) { return a + R() * (b - a); }
        function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
        road(0, 70, 0, 0, 0);
        var endAt = len - 340;
        while (segs.length < endAt) {
            var t = R(), sgn = R() < 0.5 ? -1 : 1;
            if (t < 0.18) { road(0, ri(20, 50), 0, 0, 0); }
            else if (t < 0.5) { road(ri(18, 32), ri(30, 70), ri(18, 32), sgn * rnd(1.4, maxC), 0); }
            else if (t < 0.75) {
                var hh = rnd(12, 24 + diff * 14) * (R() < 0.5 ? 1 : 1);
                road(ri(25, 40), ri(5, 20), ri(25, 40), 0, hh);
                road(ri(25, 40), ri(5, 20), ri(25, 40), 0, -hh);
            } else if (t < 0.9) {
                road(ri(15, 25), ri(20, 40), ri(15, 25), sgn * rnd(1.4, maxC), 0);
                road(ri(15, 25), ri(20, 40), ri(15, 25), -sgn * rnd(1.4, maxC), 0);
            } else {
                var h2 = rnd(10, 22);
                road(ri(25, 35), ri(10, 25), ri(25, 35), sgn * rnd(1.4, maxC * 0.9), h2);
                road(ri(20, 30), ri(10, 20), ri(20, 30), -sgn * rnd(1, maxC * 0.8), -h2);
            }
        }
        // návrat na rovinu a dlouhá rovinka před cílem
        if (lastY !== 0) { road(30, 20, 30, 0, -lastY / SEG); }
        while (segs.length < len) { add(0, 0); }
        for (var p = 0; p < PAD; p++) { add(0, 0); }
        // dekorace u krajnic
        var types = T.objs;
        for (var i = 4; i < segs.length; i++) {
            if (i > len - 8) { continue; }
            [-1, 1].forEach(function (side) {
                if (R() < T.dens * 0.5) {
                    var tp = types[Math.floor(R() * types.length)];
                    var o = 1.25 + R() * 0.7;
                    segs[i].spr.push(mkObj(tp, side * o, T, R, true));
                }
                if (R() < T.dens * 0.6) {
                    var tp2 = types[Math.floor(R() * types.length)];
                    segs[i].spr.push(mkObj(tp2, side * (2.8 + R() * 3.5), T, R, false));
                }
            });
        }
        // vyznačení cíle
        segs[len - 1].finish = true;
        segs[len].finish = true;
        // značky u křižovatky
        if (typeof st.next === 'object') {
            var L = TH[STAGES[st.next.L].th].name, Rn = TH[STAGES[st.next.R].th].name;
            [90, 55, 25].forEach(function (back) {
                segs[len - back].spr.push({ t: 'sign', off: -1.55, hw: 0.2, w: 900, txt: '< ' + L, solid: false });
                segs[len - back].spr.push({ t: 'sign', off: 1.55, hw: 0.2, w: 900, txt: Rn + ' >', solid: false });
            });
        }
        // auta
        var cl = [], z = 100 * SEG, cnt = 0;
        var lanes = [-0.62, -0.2, 0.22, 0.64];
        var gap = [46, 34, 28, 24, 20][Math.min(4, st.no - 1)];
        while (z < (len - 100) * SEG) {
            var truck = R() < 0.18;
            cl.push({
                z: z, off: lanes[Math.floor(R() * 4)], speed: MAXSP * rnd(0.26, 0.5 + diff * 0.1), truck: truck,
                col: CARCOLS[cnt % CARCOLS.length], hw: truck ? 0.19 : 0.14, w: truck ? 380 : 280, passed: false
            });
            cnt++;
            z += (gap + R() * gap) * SEG;
        }
        return { segs: segs, N: len, cars: cl, st: st, th: T };
    }

    function mkObj(tp, off, T, R, solid) {
        var o = { t: tp, off: off, solid: solid }, sg = off < 0 ? -1 : 1;
        switch (tp) {
            case 'palm': o.w = 640; o.hw = 0.12; break;
            case 'cactus': o.w = 360; o.hw = 0.1; break;
            case 'rock': o.w = 420; o.hw = 0.14; break;
            case 'bush': o.w = 340; o.hw = 0.1; break;
            case 'pine': case 'snow': o.w = 520; o.hw = 0.12; break;
            case 'building': o.w = 1000; o.hw = 0.5; o.B = [1, 3, 5, 9][Math.floor(R() * 4)]; break;
            case 'tower': o.w = 700; o.hw = 0.35; o.B = [1, 3, 5, 9][Math.floor(R() * 4)]; break;
            case 'billboard': o.w = 700; o.hw = 0.35; o.pal = { b: 7, i: [2, 1, 3, 4][Math.floor(R() * 4)], w: [15, 14, 15, 14][Math.floor(R() * 4)], n: 8 }; break;
            case 'lamp': o.w = 200; o.hw = 0.06; break;
            default: o.w = 400; o.hw = 0.1;
        }
        if (solid && o.hw > 0.2) { o.off = sg * (Math.abs(off) + o.hw); }
        return o;
    }

    function loadStage(id, len, keepPos) {
        var b = build(id, len || STAGE_LEN);
        stageId = id; track = b.segs; N = b.N; cars = b.cars; th = b.th;
        stageNo = b.st.no;
        if (!keepPos) { pos = 0; }
    }

    function segAt(z) {
        var i = Math.floor(z / SEG);
        if (i < 0) { i = 0; }
        if (i >= track.length) { i = track.length - 1; }
        return track[i];
    }

    // ---------- Kreslení scény
    function drawSpr(spr, pal, cx, by, dw, clip) {
        if (dw < 1.5) { return; }
        var s = dw / spr.w, x0 = cx - dw / 2, y0 = by - spr.h * s;
        var runs = spr.runs, lastY = -1, yy0 = 0, yy1 = 0;
        for (var i = 0; i < runs.length; i++) {
            var r = runs[i];
            if (r[0] !== lastY) {
                lastY = r[0];
                yy0 = Math.floor(y0 + r[0] * s); yy1 = Math.floor(y0 + (r[0] + 1) * s);
                if (yy1 <= yy0) { yy1 = yy0 + 1; }
                if (yy1 > clip) { yy1 = clip; }
            }
            if (yy1 <= yy0) { continue; }
            var c = pal[r[3]];
            if (c === undefined) { continue; }
            var xa = Math.floor(x0 + r[1] * s), xb = Math.floor(x0 + (r[1] + r[2]) * s);
            rect(xa, yy0, Math.max(1, xb - xa), yy1 - yy0, c);
        }
    }

    var PALS = {
        palm: function (o) { return { g: th.dark ? 3 : 12, n: 2 }; },
        cactus: function () { return { c: 4 }; },
        rock: function () { return { r: 7, d: 8 }; },
        bush: function () { return { g: 4 }; },
        pine: function () { return { a: 4, p: 4, n: 2 }; },
        snow: function () { return { a: 15, p: 4, n: 2 }; },
        building: function (o) { return { B: o.B, y: 14 }; },
        tower: function (o) { return { B: o.B, y: 14 }; },
        billboard: function (o) { return o.pal; },
        lamp: function () { return { l: 14, p: 7 }; }
    };

    function drawSky(bg) {
        var y = 0, i;
        th.sky.forEach(function (b) { rect(0, y, W, b[1] - y, b[0]); y = b[1]; });
        if (th.stars) {
            th.starList.forEach(function (s) {
                var x = (((s[0] - Math.floor(bg * 0.1)) % 256) + 256) % 256;
                Z.pix(x, s[1], s[2]);
            });
        }
        if (th.sun) {
            var sx = (((th.sun[0] - Math.floor(bg * 0.15)) % 320) + 320) % 320 - 30;
            Z.disc(sx, th.sun[1], th.sun[2], th.sun[3]);
        }
        rect(0, HY - 6, W, 6, th.floor[0]);
        th.hills.forEach(function (l) {
            var off = Math.floor(bg * l.f);
            for (var x = 0; x < W; x += 2) {
                var h = l.prof[(((x + off) % 256) + 256) % 256];
                rect(x, HY - h, 2, h, l.col);
            }
        });
        rect(0, HY, W, H - HY, th.grass[0]);
    }

    function textBoard(cx, by, dw, txt, bg, fg) {
        var bh = Math.max(4, dw * 0.28);
        rect(cx - dw / 2, by - bh - dw * 0.35, dw, bh, bg);
        rect(cx - dw / 2 - 1, by - bh - dw * 0.35 - 1, dw + 2, 1, 15);
        rect(cx - 1, by - dw * 0.35, 2, dw * 0.35, 7);
        if (dw >= Z.textW(txt, 1) + 4 && bh >= 9) { Z.text(cx, by - bh - dw * 0.35 + (bh - 9) / 2, txt, fg, { align: 'center' }); }
    }

    function drawArch(n, kind) {
        var sc = CL.sc1[n], by = CL.sy1[n], cx = CL.sx1[n], sw = sc * ROADW * HS, clip = CL.clip[n];
        var ph = sc * 1500 * VS, top = by - ph, bh = Math.max(3, sc * 320 * VS);
        var pw = Math.max(2, sw * 0.08);
        rect(cx - sw - pw * 1.5, top, pw, ph, 7);
        rect(cx + sw + pw * 0.5, top, pw, ph, 7);
        var x0 = cx - sw - pw * 1.5, wd = sw * 2 + pw * 3, col = kind === 'final' ? 15 : 14;
        rect(x0, top, wd, bh, col);
        if (kind === 'final') {
            var cs = Math.max(2, Math.floor(bh / 2));
            for (var x = 0; x < wd; x += cs) {
                rect(x0 + x, top + ((x / cs) & 1 ? 0 : cs), Math.min(cs, wd - x), cs, 0);
            }
        }
        var label = kind === 'fork' ? null : (kind === 'final' ? 'CÍL' : 'KONTROLA');
        if (label && bh >= 9 && wd > Z.textW(label, 1) + 6) { Z.text(cx, top + (bh - 9) / 2, label, 2, { align: 'center', paper: kind === 'final' ? 15 : 14 }); }
        if (kind === 'fork') {
            rect(cx - 1, top, 2, bh + ph * 0.1, 2);
            if (bh >= 9 && sw >= 52) {
                Z.text(cx - sw / 2, top + (bh - 9) / 2, '< VLEVO', 2, { align: 'center' });
                Z.text(cx + sw / 2, top + (bh - 9) / 2, 'VPRAVO >', 2, { align: 'center' });
            }
        }
    }

    function renderWorld(pz, pxv, carList, bg) {
        drawSky(bg);
        var baseIdx = Math.floor(pz / SEG), frac = (pz - baseIdx * SEG) / SEG;
        var pidx = Math.floor((pz + PZ) / SEG);
        var ps = track[Math.min(pidx, track.length - 1)], pfrac = ((pz + PZ) - pidx * SEG) / SEG;
        var camY = CAMH + ps.y1 + (ps.y2 - ps.y1) * pfrac;
        var base = track[Math.min(baseIdx, track.length - 1)];
        var x = 0, dx = -base.curve * frac, maxy = H, n, s, i;
        var camX = pxv * ROADW;
        var bucket = null;
        if (carList && carList.length) {
            bucket = {};
            for (i = 0; i < carList.length; i++) {
                var cn = Math.floor(carList[i].z / SEG) - baseIdx;
                if (cn >= 0 && cn < DRAW) { (bucket[cn] = bucket[cn] || []).push(carList[i]); }
            }
        }
        for (n = 0; n < DRAW; n++) {
            s = track[Math.min(baseIdx + n, track.length - 1)];
            var z1 = n * SEG - frac * SEG, z2 = z1 + SEG;
            CL.clip[n] = maxy;
            if (z1 <= 4) { CL.vis[n] = 0; x += dx; dx += s.curve; continue; }
            var sc1 = CAMD / z1, sc2 = CAMD / z2;
            var sx1 = HS + sc1 * (x - camX) * HS, sx2 = HS + sc2 * (x + dx - camX) * HS;
            var sy1 = HY - sc1 * (s.y1 - camY) * VS, sy2 = HY - sc2 * (s.y2 - camY) * VS;
            CL.sx1[n] = sx1; CL.sy1[n] = sy1; CL.sc1[n] = sc1; CL.sx2[n] = sx2; CL.sy2[n] = sy2; CL.sc2[n] = sc2;
            CL.vis[n] = 1;
            x += dx; dx += s.curve;
            if (sy2 >= sy1 || sy2 >= maxy) { continue; }
            var yTop = Math.round(sy2), yBot = Math.min(Math.round(maxy), Math.round(sy1));
            if (yBot > yTop) {
                var alt = (Math.floor(s.i / 3)) & 1, sw1 = sc1 * ROADW * HS, sw2 = sc2 * ROADW * HS;
                var gcol = th.grass[alt];
                rect(0, yTop, W, yBot - yTop, gcol);
                var rcol = th.rumble[alt], roadc = s.finish ? 15 : th.road, lane = alt === 0 && !s.finish;
                var span = sy1 - sy2;
                for (var r = yTop; r < yBot; r++) {
                    var t = (r + 0.5 - sy2) / span;
                    var cx = sx2 + (sx1 - sx2) * t, w = sw2 + (sw1 - sw2) * t, rw = w * 0.13;
                    rect(cx - w - rw, r, rw, 1, rcol);
                    rect(cx + w, r, rw, 1, rcol);
                    rect(cx - w, r, w * 2, 1, roadc);
                    if (lane) {
                        var lw = Math.max(1, w * 0.03);
                        rect(cx - w / 3 - lw / 2, r, lw, 1, 15);
                        rect(cx + w / 3 - lw / 2, r, lw, 1, 15);
                    }
                }
            }
            maxy = Math.min(maxy, sy1);
        }
        // sprity zdálky dopředu
        for (n = DRAW - 1; n > 0; n--) {
            if (!CL.vis[n]) { continue; }
            s = track[Math.min(baseIdx + n, track.length - 1)];
            var k, o;
            for (k = 0; k < s.spr.length; k++) {
                o = s.spr[k];
                var scx = CL.sc1[n], ox = CL.sx1[n] + scx * o.off * ROADW * HS, dw = scx * o.w * HS;
                if (ox + dw < 0 || ox - dw > W) { continue; }
                if (o.t === 'sign') { textBoard(ox, CL.sy1[n], dw, o.txt, 1, 15); continue; }
                var pal = PALS[o.t](o);
                drawSpr(SP[o.t], pal, ox, CL.sy1[n], dw, CL.clip[n]);
            }
            if (s.i === N) { drawArch(n, STAGES[stageId].final ? 'final' : (typeof STAGES[stageId].next === 'object' ? 'fork' : 'check')); }
            if (bucket && bucket[n]) {
                for (k = 0; k < bucket[n].length; k++) {
                    var c = bucket[n][k], pct = (c.z - (baseIdx + n) * SEG) / SEG;
                    var sc = CL.sc1[n] + (CL.sc2[n] - CL.sc1[n]) * pct;
                    var cxx = CL.sx1[n] + (CL.sx2[n] - CL.sx1[n]) * pct + sc * c.off * ROADW * HS;
                    var cyy = CL.sy1[n] + (CL.sy2[n] - CL.sy1[n]) * pct;
                    drawSpr(c.truck ? SP.truck : SP.car, c.truck ? { e: 15, v: 7, d: 8, b: c.col, l: 10, t: 7 } : { b: c.col, c: 0, l: 10, d: 8, w: 15, t: 7 }, cxx, cyy, sc * c.w * HS, CL.clip[n]);
                }
            }
        }
    }

    function drawPlayer(shake) {
        var x = W / 2 + shake, by = 181 + (crashT > 0 ? 0 : (tickN >> 1 & 1) * (speed > 100 ? 1 : 0)) - 1;
        drawSpr(SP.car, { b: 10, c: 13, l: 14, d: 2, w: 15, t: 7 }, x, by, 38, H);
        if (crashT > 0) {
            for (var i = 0; i < 8; i++) {
                Z.pix(x - 14 + Math.floor(Math.random() * 28), by - 20 + Math.floor(Math.random() * 22), Math.random() < 0.5 ? 14 : 10);
            }
        }
    }

    // ---------- HUD
    function pad(n, l) { var s = String(n); while (s.length < l) { s = '0' + s; } return s; }
    function drawHud() {
        rect(0, 0, W, 11, 0);
        Z.text(2, 0, 'SKÓRE ' + pad(Math.floor(score), 6), 15);
        var secs = Math.max(0, Math.ceil(timeT / 50));
        var low = secs <= 10 && (tickN >> 3 & 1);
        Z.text(128, 0, 'ČAS ' + secs, low ? 10 : 14, { align: 'center' });
        Z.text(254, 0, 'ETAPA ' + stageNo + '/' + TOTAL, 11, { align: 'right' });
        var prog = Z.clamp((pos + PZ) / (N * SEG), 0, 1);
        rect(0, 11, W, 1, 1);
        rect(0, 11, Math.floor(W * prog), 1, 12);
        rect(0, 182, W, 10, 0);
        Z.text(2, 182, 'REKORD ' + pad(hi, 6), 7);
        var kmh = Math.round(speed / MAXSP * 290);
        Z.text(254, 182, kmh + ' KM/H', 15, { align: 'right' });
        // pruh rychlosti
        var bw = Math.floor(70 * speed / MAXSP);
        rect(92, 185, 72, 4, 8);
        Z.frame(91, 184, 74, 6, 7);
        rect(92, 185, bw, 4, speed / MAXSP > 0.85 ? 10 : 12);
    }

    function shadowText(x, y, str, col, opt) {
        Z.text(x + 1, y + 1, str, 0, opt);
        Z.text(x, y, str, col, opt);
    }

    // ---------- Stavy
    function startGame() {
        score = 0; passed = 0; newHi = false;
        loadStage(0, STAGE_LEN);
        speed = 0; px = 0; timeT = START_TIME * 50; startT = 200; crashT = 0; msg = ''; msgT = 0; bgOff = 0;
        G.state = 'play'; endT = 0;
        Z.pauseOk = true;
    }

    function toTitle() {
        G.state = 'title'; Z.pauseOk = false;
        demoIdx = 0; titleT = 0;
        loadStage(0, 500); pos = 0; px = 0; bgOff = 0; cars = [];
        hi = Z.hi.get('zavodnik');
    }

    function finishStage() {
        var st = STAGES[stageId];
        if (st.final) {
            score += Math.floor(timeT / 50) * 150 + 3000;
            G.state = 'win'; endT = 0; msg = 'CÍL! GRATULUJEME'; msgT = 9999;
            Z.snd.seq([523, 659, 784, 1046, 784, 1046, 1318], 0.1);
            return;
        }
        var bonus = BONUS[st.no];
        timeT += bonus * 50;
        score += 1000 + Math.floor(timeT / 50) * 10;
        var next = st.next, txt;
        if (typeof next === 'object') {
            var left = px < 0;
            next = left ? next.L : next.R;
            txt = (left ? 'VLEVO: ' : 'VPRAVO: ') + TH[STAGES[next].th].name;
        } else { txt = 'KONTROLNÍ BOD'; }
        var over2 = pos - N * SEG;
        loadStage(next, STAGE_LEN, true);
        pos = Math.max(0, over2);
        msg = txt + '  +' + bonus + ' S'; msgT = 170;
        Z.snd.seq([523, 659, 784, 1046], 0.08);
    }

    function tickPlay() {
        tickN++;
        var I = Z.input, pct = speed / MAXSP;
        var ending = G.state !== 'play';
        if (msgT > 0 && G.state === 'play') { msgT--; }
        if (goT > 0) { goT--; }
        if (startT > 0) {
            startT--;
            if (startT % 50 === 49 && startT > 49) { Z.snd.beep(440, 0.1, 0, 0.05); }
            if (startT === 0) { Z.snd.beep(880, 0.4, 0, 0.06); goT = 60; }
        }
        var canDrive = !ending && startT <= 0;
        var gas = canDrive && (I.down('up') || I.down('fire'));
        var brake = I.down('down') || I.down('alt');
        var left = !ending && startT <= 0 && I.down('left'), right = !ending && startT <= 0 && I.down('right');
        if (ending) { brake = true; }

        var ps = segAt(pos + PZ);
        pos += speed * DT;
        var dxs = DT * 2.7 * pct;
        if (left) { px -= dxs; }
        if (right) { px += dxs; }
        px -= dxs * pct * ps.curve * 0.2;
        bgOff += ps.curve * (speed * DT / SEG) * 0.5;

        if (gas) { speed += ACC * DT; }
        else if (brake) { speed -= BRK * DT; }
        else { speed -= DEC * DT; }
        if ((px < -1 || px > 1) && speed > OFFLIM) { speed -= OFFDEC * DT; }
        if (crashT > 0) { crashT--; speed = Math.min(speed, MAXSP * 0.35); }
        speed = Z.clamp(speed, 0, MAXSP);
        px = Z.clamp(px, -2.3, 2.3);

        // krajnice – srážka s objektem
        ps = segAt(pos + PZ);
        for (var k = 0; k < ps.spr.length; k++) {
            var o = ps.spr[k];
            if (o.solid && Math.abs(px - o.off) < o.hw + PLAYER_HW) {
                if (crashT <= 0) { Z.snd.boom(); }
                crashT = 50; speed = Math.min(speed, MAXSP * 0.12);
                px = o.off > 0 ? 0.92 : -0.92;
                pos = Math.max(0, ps.i * SEG - PZ - SEG * 0.3);
                break;
            }
        }
        // auta
        var pz = pos + PZ;
        for (var c = 0; c < cars.length; c++) {
            var car = cars[c];
            car.z += car.speed * DT;
            var dz = car.z - pz;
            if (!car.passed && dz < -SEG * 0.5) { car.passed = true; passed++; score += 50; if (!ending) { Z.snd.beep(1200, 0.04, 0, 0.03); } }
            if (dz > -SEG * 0.6 && dz < SEG * 0.9 && speed > car.speed && Math.abs(px - car.off) < car.hw + PLAYER_HW) {
                Z.snd.hit();
                crashT = 40;
                speed = car.speed * 0.5;
                pos = car.z - PZ - SEG * 1.1;
                if (pos < 0) { pos = 0; }
                px += (px - car.off >= 0 ? 1 : -1) * 0.3;
                car.passed = false;
                break;
            }
        }
        score += pct * 2.2;
        if (canDrive && tickN % 3 === 0) { Z.snd.beep(50 + pct * 150, 0.07, 0, 0.012, 0, 'sawtooth'); }
        if (canDrive && (px < -1 || px > 1) && pct > 0.3 && tickN % 5 === 0) { Z.snd.noise(0.05, 0.02); }

        if (G.state === 'play') {
            timeT--;
            if (pos + PZ >= N * SEG) { finishStage(); }
            if (timeT <= 0) { timeT = 0; G.state = 'timeup'; endT = 0; msg = 'ČAS VYPRŠEL'; msgT = 9999; Z.snd.over(); }
        } else {
            endT++;
            if ((speed <= 0 && endT > 120) || endT > 330) { endGame(); }
        }
    }

    function endGame() {
        var prev = Z.hi.get('zavodnik');
        score = Math.floor(score);
        hi = Z.hi.submit('zavodnik', score);
        newHi = score > prev;
        G.state = 'over'; endT = 0; Z.pauseOk = false; msgT = 0;
    }

    function tickTitle() {
        titleT++;
        tickN++;
        pos += MAXSP * 0.65 * DT;
        var ps = segAt(pos + PZ);
        px = Math.sin(titleT / 60) * 0.5;
        bgOff += ps.curve * (MAXSP * 0.65 * DT / SEG) * 0.5;
        speed = MAXSP * 0.65;
        if (pos + PZ > (N - 20) * SEG) {
            var order = [0, 1, 2, 3, 4, 5, 6];
            demoIdx = (demoIdx + 1) % order.length;
            loadStage(order[demoIdx], 500); pos = 0; cars = [];
        }
        if (Z.input.hit('fire') || Z.input.hit('up')) { Z.snd.coin(); startGame(); }
    }

    function tick() {
        if (G.state === 'title') { tickTitle(); }
        else if (G.state === 'over') {
            endT++;
            if (endT > 60 && (Z.input.hit('fire') || Z.input.hit('up'))) { toTitle(); }
            if (endT > 1200) { toTitle(); }
        } else { tickPlay(); }
    }

    function draw() {
        Z.cls(0, 7);
        Z.border = 0;
        var st = G.state;
        if (st === 'title') {
            renderWorld(pos, px, cars, bgOff);
            rect(0, 0, W, 50, 0);
            Z.frame(0, 0, W, 50, 2);
            shadowText(128, 6, 'SILNIČNÍ', 14, { scale: 3, align: 'center' });
            shadowText(128, 30, 'ZÁVOD', 10, { scale: 2, align: 'center' });
            rect(0, 116, W, 76, 0);
            Z.frame(0, 116, W, 76, 1);
            Z.text(128, 118, 'ŠIPKY / WASD: ZATÁČENÍ A PLYN', 15, { align: 'center' });
            Z.text(128, 127, 'NAHORU NEBO MEZERNÍK = PLYN', 7, { align: 'center' });
            Z.text(128, 136, 'DOLŮ / X = BRZDA', 7, { align: 'center' });
            Z.text(128, 145, 'STIHNI KONTROLNÍ BODY A ZVOL TRASU', 13, { align: 'center' });
            Z.text(128, 155, 'REKORD ' + pad(hi, 6), 14, { align: 'center' });
            if ((titleT >> 4) & 1) { Z.text(128, 165, 'MEZERNÍK = START', 12, { align: 'center' }); }
            Z.text(128, 176, 'P PAUZA   M ZVUK', 5, { align: 'center' });
            return;
        }
        var shake = crashT > 0 ? ((tickN & 1) ? 2 : -2) : (px < -1 || px > 1 ? ((tickN >> 1 & 1) ? 1 : -1) : 0);
        renderWorld(pos, px, cars, bgOff);
        drawPlayer(shake);
        drawHud();
        if (startT > 0 && st === 'play') {
            var n = Math.ceil(startT / 50);
            var lab = startT > 150 ? 'ETAPA 1: POBŘEŽÍ' : null;
            if (lab) { shadowText(128, 44, lab, 15, { scale: 1, align: 'center' }); }
            shadowText(128, 60, n > 3 ? 'PŘIPRAV SE' : String(n), 14, { scale: 3, align: 'center' });
        } else if (goT > 0 && st === 'play') {
            shadowText(128, 60, 'JEĎ!', 12, { scale: 3, align: 'center' });
        }
        if (msgT > 0 && msg) {
            shadowText(128, 26, msg, (tickN >> 3 & 1) ? 14 : 15, { scale: 2, align: 'center' });
            if (st === 'win') { shadowText(128, 50, 'SKÓRE ' + pad(Math.floor(score), 6), 11, { scale: 2, align: 'center' }); }
        }
        if (st === 'over') {
            rect(24, 40, 208, 100, 0);
            Z.frame(24, 40, 208, 100, 14);
            Z.frame(26, 42, 204, 96, 2);
            shadowText(128, 50, 'KONEC ZÁVODU', 10, { scale: 2, align: 'center' });
            Z.text(128, 76, 'SKÓRE ' + pad(score, 6), 15, { align: 'center' });
            Z.text(128, 88, 'REKORD ' + pad(hi, 6), 14, { align: 'center' });
            if (newHi) { Z.text(128, 100, 'NOVÝ REKORD!', (tickN >> 3 & 1) ? 10 : 14, { align: 'center' }); }
            Z.text(128, 112, 'DOJELO AUT: ' + passed, 7, { align: 'center' });
            if (endT > 60 && (endT >> 4 & 1)) { Z.text(128, 126, 'MEZERNÍK = ZNOVU', 12, { align: 'center' }); }
        }
    }

    window.GAME = {
        get state() { return G.state; }, get pos() { return pos; }, get speed() { return speed; }, get px() { return px; },
        get timeT() { return timeT; }, get score() { return score; }, get stageNo() { return stageNo; }, get stageId() { return stageId; },
        get track() { return track; }, get N() { return N; }, get cars() { return cars; }, get crashT() { return crashT; },
        get passed() { return passed; }, get hi() { return hi; }, get msg() { return msg; },
        MAXSP: MAXSP, SEG: SEG, PZ: PZ, PLAYER_HW: PLAYER_HW, TH: TH, STAGES: STAGES, SP: SP, build: build,
        load: function (id) { loadStage(id, STAGE_LEN); }, set timeT(v) { timeT = v; }, set pos(v) { pos = v; }, set px(v) { px = v; }
    };

    Z.init({
        title: 'Silniční závod',
        touch: [
            { act: 'left', label: '◀' }, { act: 'right', label: '▶' },
            { act: 'down', label: 'BRZDA' }, { act: 'up', label: 'PLYN', cls: 'big' }
        ]
    });
    toTitle();
    Z.run({ tick: tick, draw: draw });
})();
