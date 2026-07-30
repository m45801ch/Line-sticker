import React, { useState, useRef } from 'react';
import { Upload, ImageIcon, Sparkles, PackageCheck, Star, Tag, Download, X } from 'lucide-react';

const ImageProcessor = ({ onProcessed, onGoToStep4 }) => {
    const [sourceImage, setSourceImage] = useState(null);
    const [imageObj, setImageObj] = useState(null);
    const [stems, setStems] = useState([]);
    const [mainIdx, setMainIdx] = useState(0);
    const [tabIdx, setTabIdx] = useState(1);
    const [startIndex, setStartIndex] = useState(1);

    const [cropMode, setCropMode] = useState('gemini-grid');
    const [singleCropPos, setSingleCropPos] = useState({ x: 0, y: 0 });
    const [singleCropScale, setSingleCropScale] = useState(1);
    const [singleCropImgScale, setSingleCropImgScale] = useState(1);

    // Background removal settings
    const [bgColor, setBgColor] = useState('#00FF00');
    const [tolerance, setTolerance] = useState(60);
    const [smoothness, setSmoothness] = useState(20);
    const [enableSmartRemoval, setEnableSmartRemoval] = useState(true);
    const [enableDespill, setEnableDespill] = useState(true);
    const [despillStrength, setDespillStrength] = useState(100);
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewImage, setPreviewImage] = useState(null); // { url, name }
    const [previewBg, setPreviewBg] = useState('grid'); // 'grid', 'white', 'black', 'blue', 'pink'

    // Interactive Grid settings
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    // Adjustable grid lines for 4x3 mode: relative positions (0~1) of inner lines
    const [gridCols, setGridCols] = useState([0.25, 0.5, 0.75]);
    const [gridRows, setGridRows] = useState([0.333, 0.667]);
    const [dragLine, setDragLine] = useState(null); // { dir: 'col'|'row', idx: number }
    // Single crop resize via handle
    const [isResizing, setIsResizing] = useState(false);

    const containerRef = useRef(null);

    // Grid dimensions based on mode
    const GRID_WIDTH = cropMode === 'gpt-grid' ? 2048 : 2560;
    const GRID_HEIGHT = cropMode === 'gpt-grid' ? 1152 : 1664;

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

    const executeProcess = async () => {
        if (!imageObj) return;

        setIsProcessing(true);
        if (cropMode === 'gemini-grid' || cropMode === 'gpt-grid') {
            setStems([]);
        }

        // Use timeout to allow UI to render the processing state
        await new Promise(resolve => setTimeout(resolve, 50));

        const applyChromaKey = (ctx, width, height) => {
            if (!enableSmartRemoval) return;
            const imageData = ctx.getImageData(0, 0, width, height);
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

                const dist = Math.sqrt(
                    Math.pow(rVal - tr, 2) +
                    Math.pow(gVal - tg, 2) +
                    Math.pow(bVal - tb, 2)
                );

                if (dist < tol) {
                    data[i + 3] = 0;
                } else if (smoothness > 0 && dist < tol + smoothness * 2) {
                    const featherAlpha = Math.round(((dist - tol) / (smoothness * 2)) * 255);
                    if (featherAlpha < data[i + 3]) {
                        data[i + 3] = featherAlpha;
                    }
                }

                if (enableDespill && data[i + 3] > 0) {
                    const maxRB = Math.max(rVal, bVal);
                    if (gVal > maxRB) {
                        const spill = gVal - maxRB;
                        if (despillStrength <= 100) {
                            const factor = despillStrength / 100;
                            data[i + 1] = Math.round(gVal - spill * factor);
                        } else {
                            const baseG = Math.round(gVal - spill);
                            const extraFactor = (despillStrength - 100) / 100;
                            const targetG = Math.round((rVal + bVal) / 2);
                            data[i + 1] = Math.round(baseG - (baseG - targetG) * extraFactor);
                        }
                    }
                }
            }
            ctx.putImageData(imageData, 0, 0);
        };

        const newStems = [];

        if (cropMode === 'gemini-grid' || cropMode === 'gpt-grid') {
            const colBoundaries = [0, ...gridCols, 1].map(v => Math.round(v * GRID_WIDTH));
            const rowBoundaries = [0, ...gridRows, 1].map(v => Math.round(v * GRID_HEIGHT));

            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

            for (let r = 0; r < rowBoundaries.length - 1; r++) {
                for (let c = 0; c < colBoundaries.length - 1; c++) {
                    const cellW = colBoundaries[c + 1] - colBoundaries[c];
                    const cellH = rowBoundaries[r + 1] - rowBoundaries[r];
                    tempCanvas.width = cellW;
                    tempCanvas.height = cellH;
                    tempCtx.clearRect(0, 0, cellW, cellH);

                    const centerX = GRID_WIDTH / 2 + position.x;
                    const centerY = GRID_HEIGHT / 2 + position.y;
                    const imgW = imageObj.width * scale;
                    const imgH = imageObj.height * scale;

                    const cellXInGrid = colBoundaries[c];
                    const cellYInGrid = rowBoundaries[r];

                    const srcX = (cellXInGrid - (centerX - imgW / 2)) / scale;
                    const srcY = (cellYInGrid - (centerY - imgH / 2)) / scale;
                    const srcW = cellW / scale;
                    const srcH = cellH / scale;

                    tempCtx.drawImage(imageObj, srcX, srcY, srcW, srcH, 0, 0, cellW, cellH);
                    applyChromaKey(tempCtx, cellW, cellH);
                    newStems.push(tempCanvas.toDataURL('image/png'));
                }
            }
            setStems(newStems);
        } else {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            tempCanvas.width = 370;
            tempCanvas.height = 320;

            const containerRatio = UI_WIDTH / UI_HEIGHT;
            const imgRatio = imageObj.width / imageObj.height;
            let displayWidth = UI_WIDTH;
            let displayHeight = UI_HEIGHT;

            if (imgRatio > containerRatio) {
                displayHeight = UI_WIDTH / imgRatio;
            } else {
                displayWidth = UI_HEIGHT * imgRatio;
            }

            // Apply the image zoom chosen by the user in single crop mode
            displayWidth *= singleCropImgScale;
            displayHeight *= singleCropImgScale;

            const boxW = 370 * singleCropScale;
            const boxH = 320 * singleCropScale;

            const boxLeftInContainer = UI_WIDTH / 2 + singleCropPos.x - boxW / 2;
            const boxTopInContainer = UI_HEIGHT / 2 + singleCropPos.y - boxH / 2;

            const imgLeft = (UI_WIDTH - displayWidth) / 2;
            const imgTop = (UI_HEIGHT - displayHeight) / 2;

            const scaleUItoImg = imageObj.width / displayWidth;

            const srcX = (boxLeftInContainer - imgLeft) * scaleUItoImg;
            const srcY = (boxTopInContainer - imgTop) * scaleUItoImg;
            const srcW = boxW * scaleUItoImg;
            const srcH = boxH * scaleUItoImg;

            // Optional: check bounds and handle edge cases, but drawImage handles it safely typically.
            tempCtx.drawImage(imageObj, srcX, srcY, srcW, srcH, 0, 0, 370, 320);

            applyChromaKey(tempCtx, 370, 320);

            const dataUrl = tempCanvas.toDataURL('image/png');
            setStems((prev) => [...prev, dataUrl]);
        }

        setIsProcessing(false);
    };

    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 255, b: 0 };
    };

    const handleGoToStep4 = () => {
        if (stems.length > 0) {
            onProcessed({ stems, mainIdx, tabIdx, startIndex });
            onGoToStep4();
        }
    };

    const onGridLineDown = (dir, idx, e) => {
        e.stopPropagation();
        setDragLine({ dir, idx });
    };

    const onMouseDown = (e) => {
        setIsDragging(true);
        if (cropMode === 'gemini-grid' || cropMode === 'gpt-grid') {
            const ratio = GRID_WIDTH / UI_WIDTH;
            setDragStart({ x: e.clientX * ratio - position.x, y: e.clientY * ratio - position.y });
        } else {
            setDragStart({ x: e.clientX - singleCropPos.x, y: e.clientY - singleCropPos.y });
        }
    };

    const onMouseMove = (e) => {
        if (dragLine) {
            const rect = containerRef.current.getBoundingClientRect();
            const ratio = GRID_WIDTH / UI_WIDTH;
            const relPos = (e.clientX - rect.left) / UI_WIDTH;
            const relPosY = (e.clientY - rect.top) / UI_HEIGHT;
            if (dragLine.dir === 'col') {
                const newCols = [...gridCols];
                newCols[dragLine.idx] = Math.max(0.05, Math.min(0.95, relPos));
                for (let i = dragLine.idx + 1; i < newCols.length; i++) {
                    newCols[i] = Math.max(newCols[i - 1] + 0.05, newCols[i]);
                }
                for (let i = dragLine.idx - 1; i >= 0; i--) {
                    newCols[i] = Math.min(newCols[i + 1] - 0.05, newCols[i]);
                }
                setGridCols(newCols);
            } else {
                const newRows = [...gridRows];
                newRows[dragLine.idx] = Math.max(0.05, Math.min(0.95, relPosY));
                for (let i = dragLine.idx + 1; i < newRows.length; i++) {
                    newRows[i] = Math.max(newRows[i - 1] + 0.05, newRows[i]);
                }
                for (let i = dragLine.idx - 1; i >= 0; i--) {
                    newRows[i] = Math.min(newRows[i + 1] - 0.05, newRows[i]);
                }
                setGridRows(newRows);
            }
            return;
        }
        if (!isDragging) return;
        if (cropMode === 'gemini-grid' || cropMode === 'gpt-grid') {
            const ratio = GRID_WIDTH / UI_WIDTH;
            setPosition({
                x: e.clientX * ratio - dragStart.x,
                y: e.clientY * ratio - dragStart.y
            });
        } else {
            let newX = e.clientX - dragStart.x;
            let newY = e.clientY - dragStart.y;

            // Constrain the crop box within the UI container bounds
            const boxW = 370 * singleCropScale;
            const boxH = 320 * singleCropScale;

            const minX = - (UI_WIDTH / 2 - boxW / 2);
            const maxX = UI_WIDTH / 2 - boxW / 2;
            const minY = - (UI_HEIGHT / 2 - boxH / 2);
            const maxY = UI_HEIGHT / 2 - boxH / 2;

            newX = Math.max(minX, Math.min(newX, maxX));
            newY = Math.max(minY, Math.min(newY, maxY));

            setSingleCropPos({ x: newX, y: newY });
        }
    };

    const onMouseUp = () => { setIsDragging(false); setDragLine(null); };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-panel" style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* Left Side: Editor */}
                <div style={{ flexShrink: 0, width: `${UI_WIDTH}px`, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', justifyContent: 'center' }}>
                        <button
                            className={`button ${cropMode === 'gemini-grid' ? 'primary' : 'secondary'}`}
                            onClick={() => setCropMode('gemini-grid')}
                            style={{ flex: 1, fontSize: '0.75rem' }}
                        >
                            4x3 網格 (for Gemini)
                        </button>
                        <button
                            className={`button ${cropMode === 'gpt-grid' ? 'primary' : 'secondary'}`}
                            onClick={() => setCropMode('gpt-grid')}
                            style={{ flex: 1, fontSize: '0.75rem' }}
                        >
                            4x3 網格 (for GPT)
                        </button>
                        <button
                            className={`button ${cropMode === 'single' ? 'primary' : 'secondary'}`}
                            onClick={() => setCropMode('single')}
                            style={{ flex: 1, fontSize: '0.75rem' }}
                        >
                            單格裁切
                        </button>
                    </div>
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
                        ) : (cropMode === 'gemini-grid' || cropMode === 'gpt-grid') ? (
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
                                {/* Adjustable 4x3 Grid Overlay */}
                                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                                    <svg width="100%" height="100%" viewBox={`0 0 ${UI_WIDTH} ${UI_HEIGHT}`} style={{ position: 'absolute', inset: 0 }}>
                                        <rect x="0" y="0" width={UI_WIDTH} height={UI_HEIGHT} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" />
                                        {gridCols.map((p, i) => (
                                          <line key={'c'+i} x1={p * UI_WIDTH} y1="0" x2={p * UI_WIDTH} y2={UI_HEIGHT} stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
                                        ))}
                                        {gridRows.map((p, i) => (
                                          <line key={'r'+i} x1="0" y1={p * UI_HEIGHT} x2={UI_WIDTH} y2={p * UI_HEIGHT} stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
                                        ))}
                                    </svg>
                                    {gridCols.map((p, i) => (
                                      <div key={'ch'+i} style={{ position: 'absolute', left: `calc(${p * 100}% - 6px)`, top: 0, bottom: 0, width: '12px', cursor: 'col-resize', zIndex: 5, pointerEvents: 'auto' }} onMouseDown={(e) => onGridLineDown('col', i, e)} />
                                    ))}
                                    {gridRows.map((p, i) => (
                                      <div key={'rh'+i} style={{ position: 'absolute', left: 0, right: 0, top: `calc(${p * 100}% - 6px)`, height: '12px', cursor: 'row-resize', zIndex: 5, pointerEvents: 'auto' }} onMouseDown={(e) => onGridLineDown('row', i, e)} />
                                    ))}
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Fixed Image representation for single crop */}
                                <img
                                    src={sourceImage}
                                    draggable={false}
                                    style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: '50%',
                                        transform: `translate(-50%, -50%) scale(${singleCropImgScale})`,
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain',
                                        userSelect: 'none',
                                        pointerEvents: 'none',
                                        transformOrigin: 'center'
                                    }}
                                />
                                {/* Single Crop Box Overlay */}
                                <div style={{
                                    position: 'absolute',
                                    left: `calc(50% + ${singleCropPos.x}px - ${(370 * singleCropScale) / 2}px)`,
                                    top: `calc(50% + ${singleCropPos.y}px - ${(320 * singleCropScale) / 2}px)`,
                                    width: `${370 * singleCropScale}px`,
                                    height: `${320 * singleCropScale}px`,
                                    border: '2px dashed #00F2FE',
                                    backgroundColor: 'rgba(0, 242, 254, 0.1)',
                                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)'
                                }}>
                                    <div style={{
                                        position: 'absolute', bottom: 0, right: 0, width: '20px', height: '20px',
                                        cursor: 'nwse-resize', zIndex: 10
                                    }}
                                        onMouseDown={(e) => { e.stopPropagation(); setIsResizing(true); setDragStart({ x: e.clientX - 370 * singleCropScale, y: e.clientY - 320 * singleCropScale }); }}
                                        onMouseMove={(e) => { if (!isResizing) return; e.stopPropagation(); const newW = Math.max(50, e.clientX - dragStart.x); const newH = Math.max(50, e.clientY - dragStart.y); setSingleCropScale(Math.max(0.1, Math.min(1.5, newW / 370, newH / 320))); }}
                                        onMouseUp={() => setIsResizing(false)}
                                        onMouseLeave={() => setIsResizing(false)}
                                    >
                                        <svg width="20" height="20" viewBox="0 0 20 20"><line x1="4" y1="20" x2="20" y2="4" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/><line x1="10" y1="20" x2="20" y2="10" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/></svg>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    {sourceImage && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {cropMode === 'gemini-grid' || cropMode === 'gpt-grid' ? (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>圖片縮放 (消除黑邊)</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)' }}>{(scale * 100).toFixed(0)}%</span>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>若兩側仍有黑邊，請將數值往右拉大</span>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input
                                            type="range" min="0.1" max="5" step="0.01" value={scale}
                                            onChange={(e) => setScale(parseFloat(e.target.value))}
                                            style={{ flex: 1, accentColor: 'var(--primary-color)' }}
                                        />
                                        <button className="num-btn" style={{ fontSize: '0.7rem', width: '2rem', height: '1.6rem' }} onClick={() => { setScale(1); setGridCols([0.25, 0.5, 0.75]); setGridRows([0.333, 0.667]); setPosition({ x: 0, y: 0 }); }} title="復原預設">↺</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>照片縮放</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)' }}>{(singleCropImgScale * 100).toFixed(0)}%</span>
                                    </div>
                                    <input
                                        type="range" min="0.1" max="5" step="0.01" value={singleCropImgScale}
                                        onChange={(e) => setSingleCropImgScale(parseFloat(e.target.value))}
                                        style={{ width: '100%', accentColor: 'var(--primary-color)' }}
                                    />

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>裁切格縮放</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)' }}>{(singleCropScale * 100).toFixed(0)}%</span>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>拖曳畫布移動裁切框，以調整欲裁切範圍</span>
                                    <input
                                        type="range" min="0.1" max="1.5" step="0.01" value={singleCropScale}
                                        onChange={(e) => {
                                            const newScale = parseFloat(e.target.value);
                                            setSingleCropScale(newScale);

                                            // Re-evaluate boundaries upon scale change to keep box inside container
                                            const boxW = 370 * newScale;
                                            const boxH = 320 * newScale;
                                            const minX = - (UI_WIDTH / 2 - boxW / 2);
                                            const maxX = UI_WIDTH / 2 - boxW / 2;
                                            const minY = - (UI_HEIGHT / 2 - boxH / 2);
                                            const maxY = UI_HEIGHT / 2 - boxH / 2;

                                            setSingleCropPos(prev => ({
                                                x: Math.max(minX, Math.min(prev.x, maxX)),
                                                y: Math.max(minY, Math.min(prev.y, maxY))
                                            }));
                                        }}
                                        style={{ width: '100%', accentColor: 'var(--primary-color)' }}
                                    />
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Side: Sidebar */}
                <div style={{ flexShrink: 0, width: '280px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="sidebar-group glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
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
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: '1.5rem', lineHeight: '1.4' }}>
                                關閉時僅會進行照片裁切，保留原始背景。
                            </div>
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
                        {enableDespill && (
                            <div className="control-field" style={{ marginBottom: '1rem', marginTop: '-0.5rem', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                                <label style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                                    溢色去除強度 <span>{despillStrength}%{despillStrength > 100 ? ' ⚡強化' : ''}</span>
                                </label>
                                <input
                                    type="range" min="0" max="200" value={despillStrength}
                                    onChange={(e) => setDespillStrength(parseInt(e.target.value))}
                                />
                            </div>
                        )}

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
                            <button className="button success" style={{ width: '100%', padding: '0.75rem' }} onClick={executeProcess} disabled={isProcessing}>
                                {isProcessing ? <span className="loader">處理中...</span> : <><Sparkles size={18} /> {cropMode === 'single' ? '裁切並去背' : '執行開始'}</>}
                            </button>
                            <button className="button secondary" style={{ width: '100%' }} onClick={() => { setSourceImage(null); setImageObj(null); setStems([]); }} disabled={isProcessing}>
                                重新上傳
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Preview Grid — shown after execution */}
            {
                stems.length > 0 && (
                    <div className="glass-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <h3 style={{ fontSize: '1rem', margin: 0 }}>
                                    去背預覽結果 ({stems.length} 張)
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
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', alignItems: 'center' }}>
                                    背景配色：
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        {[
                                            { id: 'grid', label: '預設', value: 'grid' },
                                            { id: 'white', label: '白', color: '#FFFFFF' },
                                            { id: 'black', label: '黑', color: '#000000' },
                                            { id: 'blue', label: '藍', color: '#007AFF' },
                                            { id: 'pink', label: '粉', color: '#FF69B4' }
                                        ].map(bg => (
                                            <button
                                                key={bg.id}
                                                onClick={() => setPreviewBg(bg.id)}
                                                style={{
                                                    padding: '2px 8px',
                                                    fontSize: '0.7rem',
                                                    borderRadius: '4px',
                                                    border: '1px solid',
                                                    cursor: 'pointer',
                                                    backgroundColor: previewBg === bg.id ? (bg.color || 'var(--primary-color)') : 'transparent',
                                                    borderColor: previewBg === bg.id ? (bg.color || 'var(--primary-color)') : 'var(--border-color)',
                                                    color: previewBg === bg.id ? (bg.id === 'white' ? '#000' : '#fff') : 'var(--text-secondary)',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {bg.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    不滿意？調整參數後再次按「執行開始」
                                </div>
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
                                        display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                        position: 'relative'
                                    }}>
                                        <button
                                            onClick={() => {
                                                setStems(stems.filter((_, i) => i !== idx));
                                                if (mainIdx === idx) setMainIdx(0);
                                                else if (mainIdx > idx) setMainIdx(mainIdx - 1);
                                                if (tabIdx === idx) setTabIdx(0);
                                                else if (tabIdx > idx) setTabIdx(tabIdx - 1);
                                            }}
                                            style={{
                                                position: 'absolute', top: '0.25rem', right: '0.25rem',
                                                background: 'rgba(255,50,50,0.8)', color: 'white', border: 'none',
                                                borderRadius: '50%', width: '20px', height: '20px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', fontSize: '12px', zIndex: 10
                                            }}
                                            title="移除"
                                        >✕</button>
                                        <div
                                            style={{
                                                aspectRatio: '1.15',
                                                background: previewBg === 'grid'
                                                    ? 'repeating-conic-gradient(#222 0% 25%, #1a1a1a 0% 50%)'
                                                    : ({
                                                        white: '#FFFFFF',
                                                        black: '#000000',
                                                        blue: '#007AFF',
                                                        pink: '#FF69B4'
                                                    }[previewBg]),
                                                backgroundSize: '16px 16px',
                                                borderRadius: '0.25rem',
                                                overflow: 'hidden',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'zoom-in'
                                            }}
                                            onClick={() => setPreviewImage({ url: src, name: fileName })}
                                        >
                                            <img src={src} alt={`sticker-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        </div>
                                        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'monospace', padding: '0.25rem', background: 'rgba(0,0,0,0.3)', borderRadius: '0.25rem' }}>
                                            {fileName}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => {
                                                    const link = document.createElement('a');
                                                    link.href = src;
                                                    link.download = fileName;
                                                    document.body.appendChild(link);
                                                    link.click();
                                                    document.body.removeChild(link);
                                                }}
                                                style={{
                                                    padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '0.25rem', fontSize: '0.75rem', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                    color: 'var(--text-primary)',
                                                    transition: 'all 0.2s'
                                                }}
                                                title="單獨下載此圖"
                                            >
                                                <Download size={12} /> 單獨下載
                                            </button>
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
                                                <Star size={12} fill={isMain ? 'currentColor' : 'none'} /> 主要的 (Main)
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
                                                <Tag size={12} fill={isTab ? 'currentColor' : 'none'} /> 標籤頁 (Tab)
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Go to Step 4 button */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                            <button className="button" style={{ padding: '0.75rem 3rem', fontSize: '1rem' }} onClick={handleGoToStep4}>
                                <PackageCheck size={20} /> 滿意！前往打包下載
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Lightbox Overlay */}
            {previewImage && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        background: previewBg === 'grid'
                            ? 'rgba(0, 0, 0, 0.9)'
                            : (previewBg === 'white' ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.95)'), // Standard darker for most colors except white
                        zIndex: 9999,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2rem'
                    }}
                    onClick={() => setPreviewImage(null)}
                >
                    <button
                        style={{
                            position: 'absolute',
                            top: '1.5rem',
                            right: '1.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: '50%',
                            color: 'white',
                            padding: '0.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(null);
                        }}
                    >
                        <X size={32} />
                    </button>

                    <div style={{ maxHeight: '85vh', maxWidth: '90vw', position: 'relative', textAlign: 'center' }}>
                        <div style={{
                            position: 'relative',
                            borderRadius: '0.5rem',
                            overflow: 'hidden',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                            background: previewBg === 'grid'
                                ? 'repeating-conic-gradient(#222 0% 25%, #1a1a1a 0% 50%)'
                                : ({
                                    white: '#FFFFFF',
                                    black: '#000000',
                                    blue: '#007AFF',
                                    pink: '#FF69B4'
                                }[previewBg]),
                            backgroundSize: '16px 16px'
                        }}>
                            <img
                                src={previewImage.url}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '85vh',
                                    objectFit: 'contain',
                                    cursor: 'zoom-out'
                                }}
                                alt="Preview"
                            />
                        </div>
                        <div style={{
                            color: previewBg === 'white' ? '#000' : '#fff',
                            marginTop: '1rem',
                            fontSize: '1rem',
                            fontWeight: 500
                        }}>
                            {previewImage.name}
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default ImageProcessor;
