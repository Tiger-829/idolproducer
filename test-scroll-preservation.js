const assert = require('assert');
const { loadGameHtml } = require('./test-helper');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  console.log('jsdom is not installed.');
  process.exit(1);
}

const dom = new JSDOM(loadGameHtml(__dirname), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
const { window } = dom;
let scrollX = 0;
let scrollY = 0;
const animationFrames = [];
window.scrollTo = (x, y) => {
  scrollX = x;
  scrollY = y;
};
Object.defineProperty(window, 'scrollX', { configurable: true, get: () => scrollX });
Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
window.requestAnimationFrame = callback => animationFrames.push(callback);

function assertRestoresScroll(runRender, name) {
  scrollX = 12;
  scrollY = 640;
  runRender();
  assert.deepStrictEqual([scrollX, scrollY], [12, 640], `${name} should restore scroll immediately`);

  scrollX = 0;
  scrollY = 0;
  animationFrames.shift()();
  assert.deepStrictEqual([scrollX, scrollY], [12, 640], `${name} should restore scroll after layout`);
}

window.updateUIContent = () => window.scrollTo(0, 0);
assertRestoresScroll(() => window.updateUI(), 'updateUI');

window.renderWeeklyActionPanelContent = () => window.scrollTo(0, 0);
assertRestoresScroll(() => window.renderWeeklyActionPanel(), 'renderWeeklyActionPanel');

dom.window.close();
console.log('PASS: UI refreshes preserve the current page scroll position.');
