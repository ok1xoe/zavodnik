// Screenshoty všech etap (po 400 ticích jízdy)
const H = require('/Users/hyman/EngetoAcademy/TizenOS/_kit/headless.js');
const D = '/Users/hyman/EngetoAcademy/TizenOS/zavodnik/';
const out = process.argv[2];
for (let id = 0; id < 7; id++) {
    const g = H.load([D + 'js/speccy.js', D + 'js/game.js']);
    g.key(32, true); g.step(2); g.key(32, false);
    g.sandbox.GAME.load(id);
    g.sandbox.GAME.timeT = 99999;
    g.step(215); g.key(38, true);
    g.step(500);
    g.png(out + '/stage' + id + '.png', 2);
}
