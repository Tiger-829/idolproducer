/* ==========================================
   文字化けチェック
   日本語以外の文字体系が混入していないか、
   過去の誤変換が残っていないかを検証する。
   （比赛的统计数据・資産・客层説明など、漢字＋ひらがなは正常なので対象外）
   ========================================== */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log((ok ? 'PASS : ' : 'FAIL : ') + name + (extra ? ' -> ' + extra : ''));
};

const files = [];
const walk = (dir) => {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git') return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|html|css|md|json)$/.test(entry.name)) files.push(full);
  });
};
walk(ROOT);

// 1) 日本語以外の文字体系（西里尔・ギリシャ・ハングル・四点・CJK拡張）
const FOREIGN = [
  { name: 'Cyrillic', re: /[\u0400-\u04FF]/ },
  { name: 'Greek', re: /[\u0370-\u03FF]/ },
  { name: 'Hangul', re: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/ },
  { name: 'CJK-ext', re: /[\u3400-\u4DBF\uF900-\uFAFF]/ }
];

// 2) 過去のセッションで実際に発生させた誤変換パターン
const KNOWN_CORRUPTION = [
  '拿走', '掲走', '雜訊', 'updrade', '虚構', 'arnise', 'upgrady',
  '额度', '既読', '输入法', 'fandom', 'dominance', 'records.rows',
  'вeste', 'вести', 'прив', 'смерт', 'возмож', 'провер', 'примен'
];

// α や Σ など、数式で正当なギリシャ文字は許可する
const GREEK_ALLOWED = /[αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩΣΠ]/g;

const foreignHits = [];
const knownHits = [];
// この検査ファイル自身は誤変換パターンを定義しているので除外する
const SELF = path.basename(__filename);
files.forEach((file) => {
  const rel = path.relative(ROOT, file);
  if (rel === SELF) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    FOREIGN.forEach(({ name, re }) => {
      if (re.test(line)) {
        // ギリシャ文字だけなら数式として許容する
        const withoutGreek = line.replace(GREEK_ALLOWED, '');
        if (re.test(withoutGreek)) {
          foreignHits.push(`${rel}:${index + 1} [${name}] ${line.trim().slice(0, 90)}`);
        }
      }
    });
    KNOWN_CORRUPTION.forEach((pattern) => {
      if (line.includes(pattern)) {
        knownHits.push(`${rel}:${index + 1} [${pattern}] ${line.trim().slice(0, 90)}`);
      }
    });
  });
});

console.log(`検査対象: ${files.length} ファイル`);
console.log('');
check('no foreign writing systems are mixed in', foreignHits.length === 0,
  foreignHits.join(' | '));
check('no known mojibake patterns remain', knownHits.length === 0,
  knownHits.join(' | '));

console.log('\n================ RESULT ================');
const failed = results.filter((r) => !r.ok);
console.log('PASS ' + (results.length - failed.length) + ' / ' + results.length);
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.name).join(', '));
  process.exitCode = 1;
}
