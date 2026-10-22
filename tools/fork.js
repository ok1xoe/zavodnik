// Screenshot křižovatky (značky a oblouk)
const H = require('/Users/hyman/EngetoAcademy/TizenOS/_kit/headless.js');
const D = '/Users/hyman/EngetoAcademy/TizenOS/zavodnik/';
const out = process.argv[2];
const g = H.load([D + 'js/speccy.js', D + 'js/game.js']), G = g.sandbox.GAME;
g.key(32, true); g.step(2); g.key(32, false); g.step(210);
G.timeT = 99999; G.pos = G.N * G.SEG - 5200; G.px = 0.1;
g.step(3); g.png(out + '/fork1.png', 2);
G.pos = G.N * G.SEG - 2800; g.step(3); g.png(out + '/fork2.png', 2);
