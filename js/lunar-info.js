// 包裝 lunar-javascript（js/vendor/lunar.js，MIT），輸出繁體中文的農曆、節氣與節日。
(function (global) {
  const S2T = { 腊: '臘', 节: '節', 惊: '驚', 蛰: '蟄', 谷: '穀', 满: '滿', 种: '種', 处: '處', 阳: '陽',
    马: '馬', 龙: '龍', 鸡: '雞', 猪: '豬', 闰: '閏', 头: '頭' };
  const t = (s) => String(s).replace(/./g, (c) => S2T[c] || c);

  const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const MONTH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  const pad = (n) => String(n).padStart(2, '0');

  let festivals = { solar: {}, lunar: {}, rules: {} };

  function setFestivals(data) { festivals = data; }

  function info(date) {
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    const solar = global.Solar.fromYmd(y, m, d);
    const lunar = solar.getLunar();
    const lm = lunar.getMonth(); // 閏月為負數
    const ld = lunar.getDay();

    const fests = [];
    const sf = festivals.solar[pad(m) + pad(d)];
    if (sf) fests.push(sf);
    if (m === 5 && date.getDay() === 0 && d > 7 && d <= 14 && festivals.rules['may-2nd-sunday']) {
      fests.push(festivals.rules['may-2nd-sunday']);
    }
    if (lm > 0) {
      const lf = festivals.lunar[pad(lm) + pad(ld)];
      if (lf) fests.push(lf);
    }
    const tomorrow = global.Solar.fromYmd(y, m, d).next(1).getLunar();
    if (tomorrow.getMonth() === 1 && tomorrow.getDay() === 1) fests.push('除夕');

    return {
      year: y,
      month: m,
      day: d,
      monthName: MONTH[m - 1],
      week: WEEK[date.getDay()],
      ganzhiYear: t(lunar.getYearInGanZhi() + lunar.getYearShengXiao()) + '年',
      lunarDate: t(lunar.getMonthInChinese()) + '月' + lunar.getDayInChinese(),
      jieqi: t(lunar.getJieQi() || ''),
      festivals: fests,
    };
  }

  global.LunarInfo = { info, setFestivals, pad };
})(window);
