// 列出指定期間每天的星期、農曆、節氣、節日，撰寫內容時對照用。
// 用法：node tools/calendar_notes.js 2026-10 [2026-12]
const { Solar } = require('../js/vendor/lunar.js');
const fest = require('../data/festivals-tw.json');
const S2T = { 腊: '臘', 节: '節', 惊: '驚', 蛰: '蟄', 谷: '穀', 满: '滿', 种: '種', 处: '處', 闰: '閏' };
const t = (s) => String(s).replace(/./g, (c) => S2T[c] || c);
const pad = (n) => String(n).padStart(2, '0');
const [from, to = from] = process.argv.slice(2);
let [y, m] = from.split('-').map(Number);
const [ty, tm] = to.split('-').map(Number);
while (y < ty || (y === ty && m <= tm)) {
  const days = new Date(y, m, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const s = Solar.fromYmd(y, m, d), l = s.getLunar();
    const marks = [];
    if (l.getJieQi()) marks.push(t(l.getJieQi()));
    if (fest.solar[pad(m) + pad(d)]) marks.push(fest.solar[pad(m) + pad(d)]);
    if (l.getMonth() > 0 && fest.lunar[pad(l.getMonth()) + pad(l.getDay())]) marks.push(fest.lunar[pad(l.getMonth()) + pad(l.getDay())]);
    const tm2 = s.next(1).getLunar();
    if (tm2.getMonth() === 1 && tm2.getDay() === 1) marks.push('除夕');
    if (m === 5 && s.getWeek() === 0 && d > 7 && d <= 14) marks.push('母親節');
    if (marks.length) console.log(`${y}-${pad(m)}-${pad(d)} ${t(l.getMonthInChinese())}月${l.getDayInChinese()} ${marks.join('、')}`);
  }
  m++; if (m > 12) { m = 1; y++; }
}
