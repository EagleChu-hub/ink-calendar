// 匯出 1080×1920 PNG：顯示圖片（手機可長按儲存），並提供分享與下載。
// 在 claude.ai Artifact 裡，下載要透過平台的 downloads 能力（會先請觀看者確認）；
// 其他環境（GitHub Pages、本機）用一般的瀏覽器下載。
(function (global) {
  let platformDownloads = null;
  let inArtifact = false;
  if (global.claude && typeof global.claude.use === 'function') {
    inArtifact = true;
    global.claude.use('downloads').then((d) => { platformDownloads = d; }).catch(() => {});
  }

  function toBlob(canvas) {
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('圖片產生失敗'))), 'image/png'));
  }

  async function makeImage(draw) {
    const canvas = document.createElement('canvas');
    canvas.width = Card.W;
    canvas.height = Card.H;
    draw(canvas.getContext('2d'));
    return toBlob(canvas);
  }

  // iPadOS 13 以後會自稱 Mac，要用觸控點數分辨
  const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let lastUrl = null;

  function browserDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function setHint(text) {
    document.getElementById('sheet-hint').textContent = text;
  }

  // shareInfo：{ text, url }，給「脆」「LINE」按鈕用（只能帶文字與連結，圖卡要走上面的系統分享）
  function openSheet(blob, filename, shareInfo) {
    const sheet = document.getElementById('sheet');
    const img = document.getElementById('sheet-img');
    const dl = document.getElementById('sheet-download');
    const share = document.getElementById('sheet-share');
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    img.src = lastUrl;

    // Artifact 裡若平台不提供下載，就只留長按圖片的方式
    dl.hidden = inArtifact && !platformDownloads;
    const file = new File([blob], filename, { type: 'image/png' });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    // iPhone／iPad 的瀏覽器下載會存進「檔案」App，不會進相簿；
    // 改叫出系統分享選單，裡面的「儲存影像」會直接存進照片。
    const saveViaShare = canShare && IS_IOS && !inArtifact;
    dl.onclick = async () => {
      if (saveViaShare) {
        try { await navigator.share({ files: [file] }); } catch (e) { /* 使用者取消 */ }
        return;
      }
      if (!platformDownloads) { browserDownload(lastUrl, filename); return; }
      try {
        await platformDownloads.save({ filename, data: blob });
        setHint('已交給瀏覽器下載。');
      } catch (e) {
        const code = e && e.code;
        if (code === 'declined') return;
        if (code === 'rate_limited') setHint('下載視窗已經開著，請先完成或關閉它。');
        else { dl.hidden = true; setHint('這裡無法下載，請長按或右鍵另存圖片。'); }
      }
    };

    share.hidden = !canShare;
    // 兩種分享的差別要講清楚：一個帶圖卡，一個帶文字和連結（連結的預覽圖是這一天的縮圖）
    setHint(saveViaShare
      ? '「儲存圖片」→ 在選單點「儲存影像」就會存進照片。Threads、LINE 會附上這一天的句子和連結。'
      : canShare
        ? '「分享圖片」會附上圖卡；Threads、LINE 會附上這一天的句子和連結。'
        : 'Threads、LINE 會附上這一天的句子和連結。手機上也可以長按圖片儲存。');
    share.onclick = async () => {
      try {
        await navigator.share({ files: [file], title: '水墨日曆' });
      } catch (e) {
        /* 使用者取消分享或瀏覽器拒絕：保留面板讓他改用長按或下載 */
      }
    };

    const info = shareInfo || { text: '', url: location.href };
    document.getElementById('share-threads').onclick = () => openShare(
      `https://www.threads.com/intent/post?text=${encodeURIComponent(info.text)}&url=${encodeURIComponent(info.url)}`);
    document.getElementById('share-line').onclick = () => openShare(
      `https://line.me/R/share?text=${encodeURIComponent(info.text + '\n' + info.url)}`);

    sheet.hidden = false;
    document.getElementById('sheet-close').focus();
  }

  function openShare(url) {
    window.open(url, '_blank', 'noopener');
  }

  function closeSheet() {
    document.getElementById('sheet').hidden = true;
    document.getElementById('save').focus();
  }

  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  document.getElementById('sheet').addEventListener('click', (e) => {
    if (e.target.id === 'sheet') closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('sheet').hidden) closeSheet();
  });

  global.CardExport = { makeImage, openSheet };
})(window);
