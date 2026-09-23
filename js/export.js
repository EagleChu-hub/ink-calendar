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

  function openSheet(blob, filename) {
    const sheet = document.getElementById('sheet');
    const img = document.getElementById('sheet-img');
    const dl = document.getElementById('sheet-download');
    const share = document.getElementById('sheet-share');
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    img.src = lastUrl;
    setHint('手機上長按圖片即可儲存或分享。');

    // Artifact 裡若平台不提供下載，就只留長按圖片的方式
    dl.hidden = inArtifact && !platformDownloads;
    dl.onclick = async () => {
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

    const file = new File([blob], filename, { type: 'image/png' });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    share.hidden = !canShare;
    share.onclick = async () => {
      try {
        await navigator.share({ files: [file], title: '水墨日曆' });
      } catch (e) {
        /* 使用者取消分享或瀏覽器拒絕：保留面板讓他改用長按或下載 */
      }
    };

    sheet.hidden = false;
    document.getElementById('sheet-close').focus();
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
