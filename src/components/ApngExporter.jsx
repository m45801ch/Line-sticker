import React, { useState, useRef, useEffect } from 'react';
import { Package, Play, Download, Loader2, AlertTriangle } from 'lucide-react';
import UPNG from 'upng-js';

const durationOptions = [1, 2, 3, 4];
const loopOptions = [1, 2, 3, 4];
const SIZE_LIMIT = 1024 * 1024;

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const setApngLoopCount = (buffer, count, infinite) => {
  if (infinite) count = 0;
  const data = new Uint8Array(buffer);
  for (let i = 0; i < data.length - 20; i++) {
    if (data[i] === 0x61 && data[i+1] === 0x63 && data[i+2] === 0x54 && data[i+3] === 0x4c) {
      data[i+11] = count;
      break;
    }
  }
  return data.buffer;
};

const ApngExporter = ({ frames }) => {
  const [duration, setDuration] = useState(1);
  const [loopCount, setLoopCount] = useState(1);
  const [infiniteLoop, setInfiniteLoop] = useState(false);
  const [outputSize, setOutputSize] = useState('line');
  const [customW, setCustomW] = useState(320);
  const [customH, setCustomH] = useState(270);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [fileSize, setFileSize] = useState(0);
  const [usedColors, setUsedColors] = useState(0);
  const [outDims, setOutDims] = useState(null);
  const [error, setError] = useState('');
  const [previewFrames, setPreviewFrames] = useState([]);
  const [frameDelay, setFrameDelay] = useState(0);
  const [animating, setAnimating] = useState(false);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const frameIdxRef = useRef(0);

  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  useEffect(() => {
    if (!animating || previewFrames.length === 0 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let lastTime = 0;
    let frameIdx = 0;
    let loopCountDown = (infiniteLoop || loopCount < 1) ? -1 : loopCount;

    const render = (time) => {
      if (time - lastTime < frameDelay) {
        animRef.current = requestAnimationFrame(render);
        return;
      }
      lastTime = time;
      const img = previewFrames[frameIdx];
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      frameIdx++;
      if (frameIdx >= previewFrames.length) {
        frameIdx = 0;
        if (loopCountDown > 0) {
          loopCountDown--;
          if (loopCountDown === 0) return;
        }
      }
      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [animating, previewFrames, frameDelay, loopCount, infiniteLoop]);

  const getTargetSize = () => {
    if (outputSize === 'line') return { w: 320, h: 270 };
    if (outputSize === 'main') return { w: 240, h: 240 };
    if (outputSize === 'tab') return { w: 96, h: 74 };
    if (outputSize === 'custom') return { w: customW, h: customH };
    return null;
  };

  const loadFrameSrc = (f) => f?.processedSrc || f?.displaySrc || f?.src;
  const loadImg = (src) => new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(img); } };
    img.onload = finish;
    img.onerror = finish;
    img.src = src || '';
    if (img.complete) finish();
  });

  const startPreviewAnimation = async () => {
    const srcFrames = frames || [];
    if (srcFrames.length === 0) return;
    const loaded = await Promise.all(srcFrames.map(f => loadImg(loadFrameSrc(f))));
    const valid = loaded.filter(img => img.naturalWidth > 0);
    if (valid.length === 0) return;
    const totalMs = duration * 1000;
    const base = Math.floor(totalMs / valid.length);
    const rem = totalMs % valid.length;
    const delay = rem > 0 ? base + 1 : base;
    setPreviewFrames(valid);
    setFrameDelay(delay);
    setAnimating(true);
  };

  const generateApng = async () => {
    const srcFrames = frames || [];
    if (srcFrames.length === 0) return;

    setIsGenerating(true);
    setPreviewUrl(null);
    setError('');

    try {
      const target = getTargetSize();
      const totalMs = duration * 1000;
      const delayBase = Math.floor(totalMs / srcFrames.length);
      const delayRemainder = totalMs % srcFrames.length;
      const delays = Array.from({ length: srcFrames.length }, (_, i) => (i < delayRemainder ? delayBase + 1 : delayBase));

      const first = await loadImg(loadFrameSrc(srcFrames[0]));
      let fw = target ? target.w : (first.naturalWidth || 320);
      let fh = target ? target.h : (first.naturalHeight || 270);

      const pixelBuffers = [];
      for (let i = 0; i < srcFrames.length; i++) {
        const img = await loadImg(loadFrameSrc(srcFrames[i]));
        if (!img.naturalWidth) { pixelBuffers.push(null); continue; }

        const canvas = document.createElement('canvas');
        canvas.width = fw;
        canvas.height = fh;
        const ctx = canvas.getContext('2d');

        if (target) {
          const scale = Math.min(fw / img.naturalWidth, fh / img.naturalHeight, 1);
          const dw = Math.round(img.naturalWidth * scale);
          const dh = Math.round(img.naturalHeight * scale);
          const dx = Math.round((fw - dw) / 2);
          const dy = Math.round((fh - dh) / 2);
          ctx.drawImage(img, dx, dy, dw, dh);
        } else {
          ctx.drawImage(img, 0, 0, fw, fh);
        }

        pixelBuffers.push(ctx.getImageData(0, 0, fw, fh).data.buffer);
      }

      const valid = pixelBuffers.filter(Boolean);
      if (valid.length === 0) { setError('無法讀取圖片資料'); setIsGenerating(false); return; }

      const validDelays = delays.slice(0, valid.length);
      let cnum = 0;
      let result = null;

      const encodeBlob = (buffers, w, h, colors, frameDelays) => {
        const buf = UPNG.encode(buffers, w, h, colors, frameDelays);
        const patched = setApngLoopCount(buf, loopCount, infiniteLoop);
        return new Blob([patched], { type: 'image/png' });
      };

      for (const attempt of [0, 256, 128, 96, 64, 48, 32, 16]) {
        const b = encodeBlob(valid, fw, fh, attempt, validDelays);
        if (b.size <= SIZE_LIMIT) {
          result = b;
          cnum = attempt;
          break;
        }
      }

      if (!result) {
        let sw = fw;
        let sh = fh;
        const MIN_DIM = 32;
        while (sw > MIN_DIM || sh > MIN_DIM) {
          sw = Math.max(MIN_DIM, Math.round(sw * 0.8));
          sh = Math.max(MIN_DIM, Math.round(sh * 0.8));

          const scaledBuffers = [];
          for (let i = 0; i < valid.length; i++) {
            const img = await loadImg(loadFrameSrc(srcFrames[i]));
            const canvas = document.createElement('canvas');
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, sw, sh);
            scaledBuffers.push(ctx.getImageData(0, 0, sw, sh).data.buffer);
          }

          const b = encodeBlob(scaledBuffers, sw, sh, 16, validDelays);
          if (b.size <= SIZE_LIMIT || (sw === MIN_DIM && sh === MIN_DIM)) {
            result = b;
            cnum = 16;
            fw = sw;
            fh = sh;
            break;
          }
        }
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(result));
      setFileSize(result.size);
      setUsedColors(cnum);
      setOutDims({ w: fw, h: fh });
      startPreviewAnimation();
    } catch (err) {
      setError(`合成失敗：${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    const typeLabel = outputSize === 'main' ? 'main' : outputSize === 'tab' ? 'tab' : 'line';
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `line-sticker-${typeLabel}-animated.png`;
    a.click();
  };

  const hasFrames = frames && frames.length > 0;
  const autoGenDone = useRef(false);
  useEffect(() => {
    if (hasFrames && !autoGenDone.current) {
      autoGenDone.current = true;
      generateApng();
    }
  }, [hasFrames]);

  return (
    <div className="glass-panel">
      <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Package size={20} /> 打包 APNG
      </h3>

      {!hasFrames ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
          請先回到 Step 2 擷取影格並完成去背
        </p>
      ) : (
        <div className="apng-layout">
          <div className="apng-settings">
            <h4 style={{ marginBottom: '1rem', fontSize: '0.95rem' }}>動畫設定</h4>

            <div className="apng-section">
              <label className="apng-label">動畫總長度 (秒)</label>
              <div className="apng-radio-group">
                {durationOptions.map((d) => (
                  <button key={d} className={`apng-radio-btn ${duration === d ? 'active' : ''}`} onClick={() => setDuration(d)}>
                    {d}秒
                  </button>
                ))}
              </div>
              <div className="apng-hint">
                每幀延遲：{duration * 1000 / (frames.length || 1)}ms（共 {frames.length} 幀）
              </div>
            </div>

            <div className="apng-section">
              <label className="apng-label">循環次數 (Loop)</label>
              <div className="apng-radio-group">
                {loopOptions.map((n) => (
                  <button key={n} className={`apng-radio-btn ${loopCount === n && !infiniteLoop ? 'active' : ''}`} onClick={() => { setLoopCount(n); setInfiniteLoop(false); }}>
                    {n}次
                  </button>
                ))}
              </div>
            </div>

            <div className="apng-section">
              <label className="apng-label">輸出尺寸</label>
              <div className="apng-radio-group" style={{ flexDirection: 'column', gap: '0.4rem' }}>
                <button className={`apng-radio-btn ${outputSize === 'auto' ? 'active' : ''}`} onClick={() => setOutputSize('auto')}>
                  自動 (原始大小)
                </button>
                <button className={`apng-radio-btn ${outputSize === 'line' ? 'active' : ''}`} onClick={() => setOutputSize('line')}>
                  LINE 貼圖標準 (Max 320x270)
                </button>
                <button className={`apng-radio-btn ${outputSize === 'main' ? 'active' : ''}`} onClick={() => setOutputSize('main')}>
                  main 主圖 (240x240)
                </button>
                <button className={`apng-radio-btn ${outputSize === 'tab' ? 'active' : ''}`} onClick={() => setOutputSize('tab')}>
                  tab 標籤圖 (96x74)
                </button>
                <button className={`apng-radio-btn ${outputSize === 'custom' ? 'active' : ''}`} onClick={() => setOutputSize('custom')}>
                  自訂尺寸
                </button>
                {outputSize === 'custom' && (
                  <div className="apng-custom-size">
                    <input type="number" min="1" max="2000" value={customW} onChange={(e) => setCustomW(Number(e.target.value) || 1)} />
                    <span>×</span>
                    <input type="number" min="1" max="2000" value={customH} onChange={(e) => setCustomH(Number(e.target.value) || 1)} />
                  </div>
                )}
              </div>
            </div>

            <button className="button success" style={{ width: '100%', marginTop: '1rem' }} onClick={generateApng} disabled={isGenerating}>
              {isGenerating ? <><Loader2 size={16} className="spin" /> 打包中...</> : <><Play size={16} /> 產生預覽</>}
            </button>
          </div>

          <div className="apng-preview">
            <h4>成品預覽</h4>
            <div className="apng-preview-box">
              {animating ? (
                <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '0.25rem' }} />
              ) : error ? (
                <div style={{ color: '#ff6b6b', fontSize: '0.85rem' }}>{error}</div>
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  點擊「產生預覽」檢視動畫效果
                </div>
              )}
            </div>
            {previewUrl && (
              <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  檔案大小：{formatSize(fileSize)} | {frames.length} 幀 | {outDims ? `${outDims.w}×${outDims.h}` : '—'} | {usedColors ? `${usedColors} 色` : '全彩'}
                </div>
                <div className="preview-controls">
                  <label className="toggle-unit" style={{ justifyContent: 'center' }}>
                    <span>無限循環預覽</span>
                    <button className={`toggle-switch ${infiniteLoop ? 'on' : ''}`} onClick={() => setInfiniteLoop(!infiniteLoop)}>
                      <div className="toggle-knob" />
                    </button>
                  </label>
                </div>
                <button className="button" style={{ width: '100%', marginTop: '0.5rem' }} onClick={handleDownload} disabled={isGenerating}>
                  <Download size={16} /> 下載 LINE 動態貼圖 (PNG)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ApngExporter;
