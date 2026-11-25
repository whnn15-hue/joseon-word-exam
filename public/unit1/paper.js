// 본문 렌더링 공용 함수 (시험지, 연습지)
window.Paper = {
  esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  blanksOf(t) { return [...t.matchAll(/\{(\d+)\}/g)].map(m => +m[1]); },
  itemHtml(it, k, extra) {
    const body = this.esc(it.t).replace(/\n/g, '<br>').replace(/\{(\d+)\}/g, (_, n) =>
      '<span class="bl" id="bl' + n + '"><b>' + n + '</b><input type="text" id="b' + n + '" data-n="' + n + '" autocomplete="off" spellcheck="false" aria-label="' + n + '번 빈칸"></span>');
    return '<div class="item" id="it' + k + '"><span class="qno">' + (k + 1) + '</span><div class="txt">' + body +
      (it.h ? '<p class="help">' + this.esc(it.h) + '</p>' : '') + (extra ? extra(it, k) : '') + '</div></div>';
  },
  render(D, parts, extra) {
    let html = '';
    parts.forEach(p => {
      html += '<section class="card" data-part="' + p + '"><h2>' + this.esc(D.parts[p]) + '</h2>';
      D.items.forEach((it, k) => {
        if (it.p !== p) return;
        if (it.sub) html += '<h3>' + this.esc(it.sub) + '</h3>';
        html += this.itemHtml(it, k, extra);
      });
      html += '</section>';
    });
    return html;
  }
};
