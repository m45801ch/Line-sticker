import React, { useState, useRef } from 'react';
import { Upload, ImageIcon, Sparkles, PackageCheck, Star, Tag, Download } from 'lucide-react';

const ImageProcessor = ({ onProcessed, onGoToStep3 }) => {
    const [sourceImage, setSourceImage] = useState(null);
    const [imageObj, setImageObj] = useState(null);
    const [stems, setStems] = useState([]);
    const [mainIdx, setMainIdx] = useState(0);
    const [tabIdx, setTabIdx] = useState(1);
    const [startIndex, setStartIndex] = useState(1);

    // Background removal settings
    const [bgColor, setBgColor] = useState('#00FF00');
    const [tolerance, setTolerance] = useState(60);
    const [smoothness, setSmoothness] = useState(5);
    const [enableSmartRemoval, setEnableSmartRemoval] = useState(true);
    const [enableDespill, setEnableDespill] = useState(true);

    // Interactive Grid settings
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const containerRef = useRef(null);

    // Fixed grid dimensions for calculation
    const GRID_WIDTH = 2560;
    const GRID_HEIGHT = 1664;

    // UI Container dimensions (scaled down for display)
    const UI_WIDTH = 560;
    const UI_HEIGHT = Math.round(UI_WIDTH * (GRID_HEIGHT / GRID_WIDTH));

    // Handle initial upload
    const handleUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                setImageObj(img);
                setSourceImage(event.target.result);
                setStems([]); // Clear old previews

                // Auto-scale to fill the frame
                const scaleX = GRID_WIDTH / img.width;
                const scaleY = GRID_HEIGHT / img.height;
                const minScaleRequired = Math.max(scaleX, scaleY);

                setScale(minScaleRequired);
                setPosition({ x: 0, y: 0 }); // Center
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    const executeProcess = () => {
        if (!imageObj) return;

        const cols = 4;
        const rows = 3;

        const cellWidth = GRID_WIDTH / cols;    // 640
        const cellHeight = Math.floor(GRID_HEIGHT / rows); // 554

        const newStems = [];
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        tempCanvas.width = cellWidth;
        tempCanvas.height = cellHeight;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                tempCtx.clearRect(0, 0, cellWidth, cellHeight);

                const centerX = GRID_WIDTH / 2 + position.x;
                const centerY = GRID_HEIGHT / 2 + position.y;

                const imgW = imageObj.width * scale;
                const imgH = imageObj.height * scale;

                const cellXInGrid = c * cellWidth;
                const cellYInGrid = r * cellHeight;

                const srcX = (cellXInGrid - (centerX - imgW / 2)) / scale;
                const srcY = (cellYInGrid - (centerY - imgH / 2)) / scale;
                const srcW = cellWidth / scale;
                const srcH = cellHeight / scale;

                tempCtx.drawImage(imageObj, srcX, srcY, srcW, srcH, 0, 0, cellWidth, cellHeight);

                // Apply Chroma Key — standard Euclidean distance only
                if (enableSmartRemoval) {
                    const imageData = tempCtx.getImageData(0, 0, cellWidth, cellHeight);
                    const data = imageData.data;
                    const targetRGB = hexToRgb(bgColor);
                    const tol = tolerance;
                    const tr = targetRGB.r;
                    const tg = targetRGB.g;
                    const tb = targetRGB.b;

                    for (let i = 0; i < data.length; i += 4) {
                        const rVal = data[i];
                        const gVal = data[i + 1];
                        const bVal = data[i + 2];

                        // Standard Euclidean distance — only remove what matches
                        const dist = Math.sqrt(
                            Math.pow(rVal - tr, 2) +
                            Math.pow(gVal - tg, 2) +
                            Math.pow(bVal - tb, 2)
                        );

                        if (dist < tol) {
                            data[i + 3] = 0; // Fully transparent
                        } else if (smoothness > 0 && dist < tol + smoothness) {
                            const featherAlpha = Math.round(((dist - tol) / smoothness) * 255);
                            if (featherAlpha < data[i + 3]) {
                                data[i + 3] = featherAlpha;
                            }
                        }

                        // Despill: reduce green spill on partially transparent / opaque pixels
                        if (enableDespill && data[i + 3] > 0) {
                            const maxRB = Math.max(rVal, bVal);
                            if (gVal > maxRB + 20) {
                                data[i + 1] = maxRB + 20;
                            }
                        }
                    }
                    tempCtx.putImageData(imageData, 0, 0);
                }

                newStems.push(tempCanvas.toDataURL('image/png'));
            }
        }
        setStems(newStems);
    };

    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 255, b: 0 };
    };

    const handleGoToStep3 = () => {
        if (stems.length > 0) {
            onProcessed({ stems, mainIdx, tabIdx, startIndex });
            onGoToStep3();
        }
    };

    // Drag handlers
    const onMouseDown = (e) => {
        setIsDragging(true);
        const ratio = GRID_WIDTH / UI_WIDTH;
        setDragStart({ x: e.clientX * ratio - position.x, y: e.clientY * ratio - position.y });
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const ratio = GRID_WIDTH / UI_WIDTH;
        setPosition({
            x: e.clientX * ratio - dragStart.x,
            y: e.clientY * ratio - dragStart.y
        });
    };

    const onMouseUp = () => setIsDragging(false);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-panel" style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* Left Side: Editor */}
                <div style={{ flexShrink: 0, width: `${UI_WIDTH}px`, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div
                        className="editor-container"
                        ref={containerRef}
                        style={{
                            width: `${UI_WIDTH}px`,
                            height: `${UI_HEIGHT}px`,
                            backgroundColor: '#0a0a0a',
                            borderRadius: '0.5rem',
                            position: 'relative',
                            overflow: 'hidden',
                            border: '1px solid var(--border-color)',
                            cursor: isDragging ? 'grabbing' : 'grab'
                        }}
                        onMouseDown={onMouseDown}
                        onMouseMove={onMouseMove}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseUp}
                    >
                        {!sourceImage ? (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                                <ImageIcon size={64} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                                <label className="button secondary" style={{ cursor: 'pointer' }}>
                                    <Upload size={18} /> 點此上傳圖片
                                    <input type="file" hidden accept="image/*" onChange={handleUpload} />
                                </label>
                            </div>
                        ) : (
                            <>
                                {/* Image representation */}
                                <img
                                    src={sourceImage}
                                    draggable={false}
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: '50%',
                                        transform: `translate(calc(-50% + ${position.x * (UI_WIDTH / GRID_WIDTH)}px), calc(-50% + ${position.y * (UI_HEIGHT / GRID_HEIGHT)}px)) scale(${scale * (UI_WIDTH / GRID_WIDTH)})`,
                                        maxWidth: 'none',
                                        userSelect: 'none',
                                        transformOrigin: 'center'
                                    }}
                                />
                                {/* 4x3 Grid Overlay */}
                                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(3, 1fr)', border: '2px solid rgba(255, 255, 255, 0.8)' }}>
                                    {[...Array(12)].map((_, i) => (
                                        <div key={i} style={{ border: '1px solid rgba(255, 255, 255, 0.6)' }} />
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    {sourceImage && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>裁切縮放 (去除黑邊)</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)' }}>{(scale * 100).toFixed(0)}%</span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>若兩側仍有黑邊，請將數值往右拉大</span>
                            <input
                                type="range" min="0.1" max="5" step="0.01" value={scale}
                                onChange={(e) => setScale(parseFloat(e.target.value))}
                                style={{ width: '100%', accentColor: 'var(--primary-color)' }}
                            />
                        </div>
                    )}
                </div>

                {/* Right Side: Sidebar */}
                <div style={{ flexShrink: 0, width: '280px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="sidebar-group glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Sparkles size={18} color="var(--primary-color)" />
                                <span style={{ fontWeight: 600 }}>啟用智慧去背</span>
                            </div>
                            <input
                                type="checkbox"
                                className="toggle"
                                checked={enableSmartRemoval}
                                onChange={(e) => setEnableSmartRemoval(e.target.checked)}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>溢色去除 (Despill)</span>
                            </div>
                            <input
                                type="checkbox"
                                className="toggle"
                                checked={enableDespill}
                                onChange={(e) => setEnableDespill(e.target.checked)}
                            />
                        </div>

                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '1rem' }}>
                            去背參數設定
                        </div>

                        <div className="control-field" style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>目標背景色</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="color"
                                    value={bgColor}
                                    onChange={(e) => setBgColor(e.target.value)}
                                    style={{ width: '100%', height: '2rem', border: 'none', borderRadius: '0.25rem' }}
                                />
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    {['#00FF00', '#0000FF', '#FFFFFF', '#000000'].map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setBgColor(c)}
                                            style={{ width: '2rem', height: '2rem', backgroundColor: c, border: `1px solid ${bgColor === c ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '0.25rem' }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="control-field" style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                容差度 (Tolerance) <span>{tolerance}</span>
                            </label>
                            <input
                                type="range" min="0" max="255" value={tolerance}
                                onChange={(e) => setTolerance(parseInt(e.target.value))}
                            />
                        </div>

                        <div className="control-field">
                            <label style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                平滑度 (Smoothness) <span>{smoothness}</span>
                            </label>
                            <input
                                type="range" min="0" max="20" value={smoothness}
                                onChange={(e) => setSmoothness(parseInt(e.target.value))}
                            />
                        </div>
                    </div>

                    {/* Action Buttons */}
                    {sourceImage && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button className="button success" style={{ width: '100%', padding: '0.75rem' }} onClick={executeProcess}>
                                <Sparkles size={18} /> 執行開始 (開始去背)
                            </button>
                            <button className="button secondary" style={{ width: '100%' }} onClick={() => { setSourceImage(null); setImageObj(null); setStems([]); }}>
                                重新上傳
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Preview Grid — shown after execution */}
            {stems.length > 0 && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0 }}>
                                去背預覽結果 (12 張)
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}># 起始</span>
                                <input
                                    type="number" min="1" value={startIndex}
                                    onChange={(e) => setStartIndex(parseInt(e.target.value) || 1)}
                                    style={{ background: 'transparent', border: 'none', color: 'white', maxWidth: '35px', textAlign: 'center', outline: 'none', fontSize: '0.9rem', fontWeight: 'bold' }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            不滿意？調整參數後再次按「執行開始」
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        {stems.map((src, idx) => {
                            const isMain = idx === mainIdx;
                            const isTab = idx === tabIdx;
                            const fileName = String(startIndex + idx).padStart(2, '0') + ".png";
                            return (
                                <div key={idx} style={{
                                    background: 'var(--panel-bg)', borderRadius: '0.5rem', padding: '0.75rem',
                                    border: `1px solid ${isMain ? 'var(--primary-color)' : (isTab ? 'var(--success-color)' : 'var(--border-color)')}`,
                                    display: 'flex', flexDirection: 'column', gap: '0.5rem'
                                }}>
                                    <div style={{
                                        aspectRatio: '1.15', backgroundImage: 'repeating-conic-gradient(#222 0% 25%, #1a1a1a 0% 50%)',
                                        backgroundSize: '16px 16px', borderRadius: '0.25rem', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <img src={src} alt={`sticker-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    </div>
                                    <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'monospace', padding: '0.25rem', background: 'rgba(0,0,0,0.3)', borderRadius: '0.25rem' }}>
                                        {fileName}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => setMainIdx(idx)}
                                            style={{
                                                padding: '0.4rem', border: '1px solid', borderRadius: '0.25rem', fontSize: '0.75rem', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                                                background: isMain ? 'rgba(0, 242, 254, 0.15)' : 'transparent',
                                                borderColor: isMain ? 'var(--primary-color)' : 'var(--border-color)',
                                                color: isMain ? 'var(--primary-color)' : 'var(--text-secondary)',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <Star size={12} fill={isMain ? 'currentColor' : 'none'} /> Main
                                        </button>
                                        <button
                                            onClick={() => setTabIdx(idx)}
                                            style={{
                                                padding: '0.4rem', border: '1px solid', borderRadius: '0.25rem', fontSize: '0.75rem', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                                                background: isTab ? 'rgba(0, 230, 118, 0.15)' : 'transparent',
                                                borderColor: isTab ? 'var(--success-color)' : 'var(--border-color)',
                                                color: isTab ? 'var(--success-color)' : 'var(--text-secondary)',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <Tag size={12} fill={isTab ? 'currentColor' : 'none'} /> Tab
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Go to Step 3 button */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                        <button className="button" style={{ padding: '0.75rem 3rem', fontSize: '1rem' }} onClick={handleGoToStep3}>
                            <PackageCheck size={20} /> 滿意！前往打包下載
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageProcessor;
