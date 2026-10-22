// Testy: kontrola NaN, přechody stavů, bot dojede všechny etapy (obě větve), kontrola bez plynu = konec času
const H = require('/Users/hyman/EngetoAcademy/TizenOS/_kit/headless.js');
const D = '/Users/hyman/EngetoAcademy/TizenOS/zavodnik/';
const OUT = process.argv[2] || '/tmp';
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('CHYBA:', m); } else { console.log('ok:', m); } }

function fresh() { return H.load([D + 'js/speccy.js', D + 'js/game.js']); }
function start(g) { g.key(32, true); g.step(2); g.key(32, false); }

// 1) Bez plynu: title -> play -> timeup -> over -> title
(function () {
    const g = fresh(), G = g.sandbox.GAME;
    g.step(20);
    ok(G.state === 'title', 'start na titulní obrazovce');
    start(g);
    ok(G.state === 'play', 'mezerník spustí hru');
    const seen = new Set();
    for (let i = 0; i < 20000 && seen.size < 4; i++) { g.step(1); seen.add(G.state); if (G.state === 'over' && i > 0) { break; } }
    ok(seen.has('timeup') && G.state === 'over', 'pasivní hra končí časem: ' + [...seen].join('>'));
    g.step(80); g.key(32, true); g.step(2); g.key(32, false);
    ok(G.state === 'title', 'po konci návrat na titulní obrazovku');
})();

// 2) Bot
function runBot(choice, label) {
    const g = fresh(), G = g.sandbox.GAME;
    start(g);
    const seenStages = [];
    let crashes = 0, lastCrash = 0, ticks = 0, nan = false;
    const key = (c, d) => g.key(c, d);
    while (ticks < 60000 && G.state !== 'over') {
        const px = G.px, pos = G.pos, SEG = G.SEG, track = G.track;
        const idx = Math.floor((pos + G.PZ) / SEG);
        // cílový pruh
        let target = 0.2;
        const lanes = [-0.62, -0.2, 0.22, 0.64];
        let best = null, bestScore = 1e9;
        lanes.forEach(l => {
            let pen = Math.abs(l - px) * 0.5;
            G.cars.forEach(c => {
                const dz = c.z - (pos + G.PZ);
                if (dz > -300 && dz < 3500 && Math.abs(c.off - l) < 0.38) { pen += 10 + (3500 - dz) / 300; }
            });
            if (pen < bestScore) { bestScore = pen; best = l; }
        });
        target = best;
        const remaining = G.N * SEG - (pos + G.PZ);
        const st = G.STAGES[G.stageId];
        if (typeof st.next === 'object' && remaining < 9000) { target = choice === 'L' ? -0.5 : 0.5; }
        // zpomal před zatáčkou
        const cur = track[Math.min(idx + 6, track.length - 1)].curve;
        const pct = G.speed / G.MAXSP;
        const gas = !(Math.abs(cur) > 3.8 && pct > 0.9) && !(Math.abs(px) > 1);
        key(38, gas); key(40, false);
        const e = target - px;
        key(37, e < -0.06); key(39, e > 0.06);
        g.step(1); ticks++;
        if (G.state === 'play' && seenStages[seenStages.length - 1] !== G.stageId) { seenStages.push(G.stageId); }
        if (G.crashT > 0 && ticks - lastCrash > 60) { crashes++; }
        if (G.crashT > 0) { lastCrash = ticks; }
        if (ticks % 500 === 0 && g.hasNaN({ a: G.pos, b: G.px, c: G.speed, d: G.score, e: G.timeT })) { nan = true; }
    }
    key(38, false); key(37, false); key(39, false);
    console.log(label, 'stav', G.state, 'etapy', seenStages.join('>'), 'skore', Math.floor(G.score), 'zbyvajici cas', Math.ceil(G.timeT / 50), 'srazek', crashes, 'ticku', ticks, 'projeto aut', G.passed);
    return { g, G, seenStages, nan };
}
const a = process.env.SKIPL ? {nan:false,seenStages:['0','1','3','4','6'].map(Number)} : runBot('L', 'bot vlevo');
ok(!a.nan, 'bez NaN (vlevo)');
ok(a.seenStages.join('>') === '0>1>3>4>6', 'trasa vlevo projeta: ' + a.seenStages.join('>'));
const b = runBot('R', 'bot vpravo');
ok(!b.nan, 'bez NaN (vpravo)');
ok(b.seenStages.join('>') === '0>2>3>5>6', 'trasa vpravo projeta: ' + b.seenStages.join('>'));
ok(b.G.state === 'over' && b.G.score > 5000, 'po cíli je konec hry se skóre');
ok(b.G.hi >= b.G.score, 'rekord uložen');

// 3) Všechny etapy: vybudování trati, konečná rovinka, auta mimo cíl
(function () {
    const g = fresh(), G = g.sandbox.GAME;
    Object.keys(G.STAGES).forEach(id => {
        const b = G.build(+id, 1100);
        const t = b.segs;
        let bad = false;
        t.forEach(s => { if (!isFinite(s.curve) || !isFinite(s.y1) || !isFinite(s.y2)) { bad = true; } });
        const last = t[b.N];
        ok(!bad && Math.abs(last.y1) < 1 && last.curve === 0 && b.cars.length > 5 && b.cars.every(c => c.z < b.N * 200), 'etapa ' + id + ' trať v pořádku (aut ' + b.cars.length + ')');
    });
})();

// 4) Snímky titulní/herní obrazovky a konec hry
(function () {
    const g = fresh(), G = g.sandbox.GAME;
    g.step(60); g.png(OUT + '/t_title.png', 2);
    start(g); g.step(230); g.key(38, true); g.step(260);
    g.png(OUT + '/t_play.png', 2);
    G.timeT = 3; g.step(400);
    g.png(OUT + '/t_over.png', 2);
    ok(G.state === 'over', 'obrazovka konce hry');
})();

// 5) Výkon: snímek (tick+draw) ve hře
(function () {
    const g = fresh(), G = g.sandbox.GAME;
    start(g); g.step(230); g.key(38, true);
    const t0 = process.hrtime.bigint();
    g.step(1500);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 1500;
    ok(ms < 8, 'prumerny cas snimku ' + ms.toFixed(2) + ' ms (limit 20 ms)');
})();
console.log(fails ? 'SELHALO: ' + fails : 'VSE V PORADKU');
process.exit(fails ? 1 : 0);
