/* ==========================================
   テスト共通ヘルパー
   index.html は CSS と JS を外部ファイルへ分割しているため、
   jsdom で同期的に初期化できるよう <script src> を実ファイルの中身を
   読み込んでインライン化し、<link rel="stylesheet"> は取り除く。
   （スクリプトの実行順は index.html に記載されたどおりに保たれる）
   ========================================== */
const fs = require('fs');
const path = require('path');

function loadGameHtml(root = __dirname) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  let inlined = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (_, src) => {
    const target = path.join(root, src.replace(/^\.\//, '').replace(/^\//, ''));
    if (!fs.existsSync(target)) {
      throw new Error(`index.html が参照しているファイルが見つかりません: ${src}`);
    }
    const code = fs.readFileSync(target, 'utf8');
    if (code.includes('</script>')) {
      throw new Error(`${src} に </script> が含まれるためインライン化できません`);
    }
    return `<script>\n${code}\n</script>`;
  });
  inlined = inlined.replace(/<link\s+rel="stylesheet"[^>]*>/g, '');
  return inlined;
}

module.exports = { loadGameHtml };
