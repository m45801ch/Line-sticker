import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Scissors, Clapperboard, Download, Film, Wand2, Eye } from 'lucide-react';
import { autoProcessClipsToZip, extractProcessedFrameDataUrls, autoDetectBgSettings, AUTO_FRAME_COUNT } from './VideoProcessor';
import { useSlicer } from './SlicerContext';

const AutoProcessApp = () => {
  const navigate = useNavigate();
  const { clips, sourceName, clearClips } = useSlicer();

  const [selectedClips, setSelectedClips] = useState([]);
  const [autoFrameCount, setAutoFrameCount] = useState(AUTO_FRAME_COUNT);
  const [autoBg, setAutoBg] = useState('#00FF00');
  const [autoTolerance, setAutoTolerance] = useState(120);
  const [autoSmoothness, setAutoSmoothness] = useState(8);
  const [autoDespill, setAutoDespill] = useState(true);
  const [autoDespillStrength, setAutoDespillStrength] = useState(100);
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [autoProgress, setAutoProgress] = useState(0);
  const [autoCell, setAutoCell] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [previewFrames, setPreviewFrames] = useState([]);
  const [previewClipName, setPreviewClipName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const toggleClip = (index) => {
    setSelectedClips((prev) => prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]);
  };

  const handleOpenClip = (clip) => {
    navigate('/dynamic', { state: { slicedVideo: { url: clip.url, name: clip.name } } });
  };

  const handleAutoProcess = async () => {
    const chosen = selectedClips.length > 0
      ? clips.filter((c) => selectedClips.includes(c.index))
      : clips;
    if (chosen.length === 0 || autoProcessing) return;
    setAutoProcessing(true);
    setError('');
    setAutoProgress(0);
    setAutoCell(0);
    setStatusText('自動化處理中...');

    try {
      // 以第一支影片自動偵測去背參數，套用於全部
      const detected = await autoDetectBgSettings(chosen[0].url);
      setAutoBg(detected.bgColor);
      setAutoTolerance(detected.tolerance);
      setAutoSmoothness(detected.smoothness);
      setAutoDespill(detected.enableDespill);
      setAutoDespillStrength(detected.despillStrength);

      const result = await autoProcessClipsToZip(
        chosen,
        {
          bgColor: detected.bgColor,
          tolerance: detected.tolerance,
          smoothness: detected.smoothness,
          enableDespill: detected.enableDespill,
          despillStrength: detected.despillStrength,
        },
        autoFrameCount,
        ({ done, total }) => {
          setAutoCell(done + 1);
          setAutoProgress(total > 0 ? ((done + 1) / total) * 100 : 0);
          setStatusText(`自動化處理第 ${done + 1}/${total} 支...`);
        },
      );

      const a = document.createElement('a');
      a.href = URL.createObjectURL(result.zip);
      a.download = 'line-dynamic-stickers-auto.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setStatusText(`完成！已打包 ${result.count} 個 APNG 檔案（單檔已壓縮至 ≤1MB）`);
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e?.message || e?.toString?.() || String(e));
      setError(`自動化處理失敗：${msg}`);
    } finally {
      setAutoProcessing(false);
    }
  };

  const handlePreview = async (mode) => {
    if (clips.length === 0 || previewing) return;
    const clip = selectedClips.length > 0
      ? clips.find((c) => c.index === selectedClips[0])
      : clips[0];
    if (!clip) return;
    setPreviewing(true);
    setError('');

    let settings = {
      bgColor: autoBg,
      tolerance: autoTolerance,
      smoothness: autoSmoothness,
      enableDespill: autoDespill,
      despillStrength: autoDespillStrength,
    };

    if (mode === 'auto') {
      setStatusText(`自動偵測 ${clip.name} 去背參數...`);
      try {
        const detected = await autoDetectBgSettings(clip.url);
        setAutoBg(detected.bgColor);
        setAutoTolerance(detected.tolerance);
        setAutoSmoothness(detected.smoothness);
        setAutoDespill(detected.enableDespill);
        setAutoDespillStrength(detected.despillStrength);
        settings = {
          bgColor: detected.bgColor,
          tolerance: detected.tolerance,
          smoothness: detected.smoothness,
          enableDespill: detected.enableDespill,
          despillStrength: detected.despillStrength,
        };
      } catch (e) {
        const msg = typeof e === 'string' ? e : (e?.message || e?.toString?.() || String(e));
        setError(`自動偵測失敗：${msg}`);
        setPreviewing(false);
        return;
      }
    } else {
      setStatusText(`手動預處理 ${clip.name}...`);
    }

    try {
      const frames = await extractProcessedFrameDataUrls(
        clip.url,
        settings,
        autoFrameCount,
      );
      setPreviewFrames(frames);
      setPreviewClipName(clip.name);
      if (mode === 'auto') {
        setStatusText(`自動預處理完成：${clip.name}（背景 ${settings.bgColor}、容差 ${settings.tolerance}、平滑 ${settings.smoothness}）`);
      } else {
        setStatusText(`手動預處理完成：${clip.name}（${frames.length} 張）`);
      }
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e?.message || e?.toString?.() || String(e));
      setError(`預處理失敗：${msg}`);
    } finally {
      setPreviewing(false);
    }
  };

  if (clips.length === 0) {
    return (
      <div className="glass-panel">
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Film size={40} className="upload-icon" />
          <p style={{ color: 'var(--text-secondary)' }}>尚無切割結果，請先到「多張動態貼圖製作」頁面切割影片。</p>
          <button className="button btn-uniform" style={{ marginTop: '1rem' }} onClick={() => navigate('/slicer')}>
            前往切割
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="glass-panel">
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Scissors size={20} /> 自動化處理
        </h3>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          {/* 左欄：參數設定 */}
          <div style={{ flex: '1', minWidth: '280px' }}>
            <div className="bg-settings-row" style={{ gap: '1.25rem', rowGap: '1rem', alignItems: 'flex-start' }}>
              <div className="slider-uniform" style={{ flex: '0 0 90px' }}>
                <label>影格張數</label>
                <input
                  type="number"
                  min="1"
                  max="40"
                  value={autoFrameCount}
                  onChange={(e) => setAutoFrameCount(Math.min(40, Math.max(1, Number(e.target.value) || AUTO_FRAME_COUNT)))}
                  className="text-input"
                  style={{ padding: '0.5rem', minWidth: '60px' }}
                />
              </div>
              <div className="slider-uniform" style={{ flex: '0 0 190px' }}>
                <label>去背背景色</label>
                <div className="color-picker-row">
                  <input type="color" value={autoBg} onChange={(e) => setAutoBg(e.target.value)} />
                  {['#00FF00', '#0000FF', '#FFFFFF', '#000000'].map((c) => (
                    <button key={c} onClick={() => setAutoBg(c)} className="color-swatch" style={{ backgroundColor: c, borderColor: autoBg === c ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)' }} />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: '0 0 140px' }}>
                <div className="slider-uniform">
                  <label>容差度 <span>{autoTolerance}</span></label>
                  <input type="range" min="0" max="255" value={autoTolerance} onChange={(e) => setAutoTolerance(parseInt(e.target.value))} />
                </div>
                {autoDespill && (
                  <div className="slider-uniform">
                    <label>溢色強度 <span>{autoDespillStrength}%</span></label>
                    <input type="range" min="0" max="200" value={autoDespillStrength} onChange={(e) => setAutoDespillStrength(parseInt(e.target.value))} />
                  </div>
                )}
              </div>
              <div className="slider-uniform" style={{ flex: '0 0 140px' }}>
                <label>平滑度 <span>{autoSmoothness}</span></label>
                <input type="range" min="0" max="20" value={autoSmoothness} onChange={(e) => setAutoSmoothness(parseInt(e.target.value))} />
              </div>
              <div className="slider-uniform" style={{ flex: '0 0 90px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label>溢色去除</label>
                <input type="checkbox" className="toggle" checked={autoDespill} onChange={(e) => setAutoDespill(e.target.checked)} />
              </div>
            </div>
          </div>

          {/* 右欄：動作 + 進度 */}
          <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {selectedClips.length > 0 ? `已勾選 ${selectedClips.length}/${clips.length} 支。` : '未勾選時將處理全部影片。'}流程：截取 {autoFrameCount} 影格 → 去背 → 4 秒 APNG（320x270）。
            </div>
            <div className="action-row" style={{ flexWrap: 'wrap' }}>
              <button className="button btn-uniform" style={{ flex: 1 }} onClick={() => handlePreview('auto')} disabled={previewing || clips.length === 0}>
                {previewing ? <><Loader2 size={16} className="spin" /> 處理中...</> : <><Wand2 size={16} /> 自動去背預覽</>}
              </button>
              <button className="button btn-uniform" style={{ flex: 1 }} onClick={() => handlePreview('manual')} disabled={previewing || clips.length === 0}>
                {previewing ? <><Loader2 size={16} className="spin" /> 處理中...</> : <><Eye size={16} /> 手動去背預覽</>}
              </button>
            </div>
            <button className="button success btn-uniform" style={{ width: '100%' }} onClick={handleAutoProcess} disabled={autoProcessing || clips.length === 0}>
              {autoProcessing ? <><Loader2 size={16} className="spin" /> 處理中...</> : <><Download size={16} /> 自動化處理並下載</>}
            </button>
            {autoProcessing && (
              <div>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${autoProgress}%` }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.3rem' }}>
                  進度 {autoCell}/{selectedClips.length}（{autoProgress.toFixed(0)}%）
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {previewFrames.length > 0 && (
        <div className="glass-panel" style={{ marginTop: '1.25rem' }}>
          <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            預處理結果：{previewClipName}（{previewFrames.length} 張）
          </h4>
          <div className="frame-grid">
            {previewFrames.map((src, i) => (
              <div key={i} className="frame-item" style={{ background: 'repeating-conic-gradient(#1a1a1a 0% 25%, #222 0% 50%) 50% / 20px 20px' }}>
                <img src={src} alt={`預覽 ${i + 1}`} />
                <span className="frame-index">#{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <div className="frame-toolbar">
          <span className="frame-count-text">
            切割結果：{sourceName || '影片'} → {clips.length} 支（點選影片前往單張動態貼圖製作，勾選框用於自動化處理）
          </span>
          <button className="button secondary btn-uniform" onClick={clearClips}>
            清除切割結果
          </button>
        </div>
        <div className="frame-grid">
          {clips.map((clip) => (
            <div key={clip.index} className={`frame-item ${selectedClips.includes(clip.index) ? 'selected' : ''}`} style={{ cursor: 'pointer' }} onClick={() => handleOpenClip(clip)} title={`點擊處理 ${clip.name}`}>
              <div className="frame-select-box" onClick={(e) => { e.stopPropagation(); toggleClip(clip.index); }}>
                <input type="checkbox" checked={selectedClips.includes(clip.index)} onChange={() => toggleClip(clip.index)} />
              </div>
              <video src={clip.url} muted preload="metadata" style={{ width: '100%', display: 'block' }} />
              <span className="frame-index">#{clip.index + 1}</span>
              <span className="frame-download-btn" style={{ cursor: 'pointer' }} title={clip.name}>
                <Clapperboard size={12} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {statusText && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>{statusText}</div>}
      {error && <div style={{ fontSize: '0.8rem', color: '#d32f2f', marginTop: '0.75rem' }}>{error}</div>}
    </div>
  );
};

export default AutoProcessApp;
