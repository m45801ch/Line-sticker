const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 255, b: 0 };
};

/**
 * Chroma Key 去背（對 canvas 的 ImageData 就地處理）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {{bgColor:string, tolerance:number, smoothness:number, enableDespill:boolean, despillStrength:number}} settings
 */
const applyChromaKey = (ctx, width, height, settings) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const target = hexToRgb(settings.bgColor);
  const tol = settings.tolerance;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.sqrt(Math.pow(r - target.r, 2) + Math.pow(g - target.g, 2) + Math.pow(b - target.b, 2));

    if (dist < tol) {
      data[i + 3] = 0;
    } else if (settings.smoothness > 0 && dist < tol + settings.smoothness * 2) {
      const alpha = Math.round(((dist - tol) / (settings.smoothness * 2)) * 255);
      if (alpha < data[i + 3]) data[i + 3] = alpha;
    }

    if (settings.enableDespill && data[i + 3] > 0) {
      const maxRB = Math.max(r, b);
      if (g > maxRB) {
        const spill = g - maxRB;
        if (settings.despillStrength <= 100) {
          data[i + 1] = Math.round(g - spill * (settings.despillStrength / 100));
        } else {
          const baseG = Math.round(g - spill);
          const extraFactor = (settings.despillStrength - 100) / 100;
          data[i + 1] = Math.round(baseG - (baseG - (r + b) / 2) * extraFactor);
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
};

/**
 * 從圖片自動偵測去背參數（背景色、容差度、平滑度、溢色）。
 * 容差度收斂到 10–180、平滑度 8–20、溢色強度 100。
 * @param {string} src 圖片 dataURL
 * @returns {Promise<{bgColor:string,tolerance:number,smoothness:number,enableDespill:boolean,despillStrength:number}>}
 */
const autoDetectBgFromImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const w = canvas.width;
    const h = canvas.height;

    // 1. 從四角樣本平均取得背景色
    const sample = (sx, sy, sw, sh) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = sy; y < sy + sh; y++) {
        for (let x = sx; x < sx + sw; x++) {
          const i = (y * w + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
      }
      return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
    };
    const cornerSize = Math.max(4, Math.floor(Math.min(w, h) / 40));
    const corners = [
      sample(0, 0, cornerSize, cornerSize),
      sample(w - cornerSize, 0, cornerSize, cornerSize),
      sample(0, h - cornerSize, cornerSize, cornerSize),
      sample(w - cornerSize, h - cornerSize, cornerSize, cornerSize),
    ];
    const bg = {
      r: Math.round(corners.reduce((s, c) => s + c.r, 0) / 4),
      g: Math.round(corners.reduce((s, c) => s + c.g, 0) / 4),
      b: Math.round(corners.reduce((s, c) => s + c.b, 0) / 4),
    };

    // 2. 距離直方圖，找背景峰與谷
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const dist = Math.round(Math.sqrt((r - bg.r) ** 2 + (g - bg.g) ** 2 + (b - bg.b) ** 2));
      histogram[Math.min(255, dist)]++;
    }
    const smooth = histogram.map((_, d) => {
      let sum = 0, n = 0;
      for (let k = Math.max(0, d - 3); k <= Math.min(255, d + 3); k++) { sum += histogram[k]; n++; }
      return sum / n;
    });
    let bgPeak = 0;
    for (let d = 1; d < 100; d++) if (smooth[d] > smooth[bgPeak]) bgPeak = d;
    let valley = 255;
    for (let d = bgPeak + 1; d < 180; d++) {
      if (smooth[d] < smooth[d - 1] && smooth[d] <= smooth[d + 1]) { valley = d; break; }
    }

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const tolerance = clamp(valley, 10, 180);

    let spread = 0;
    for (let d = bgPeak; d <= 255; d++) if (smooth[d] > smooth[bgPeak] * 0.3) spread = d - bgPeak;
    const smoothness = clamp(Math.round(spread * 0.25), 8, 20);

    const isGreenish = bg.g > bg.r && bg.g > bg.b;

    const hex = (n) => n.toString(16).padStart(2, '0');
    resolve({
      bgColor: `#${hex(bg.r)}${hex(bg.g)}${hex(bg.b)}`,
      tolerance,
      smoothness,
      enableDespill: isGreenish,
      despillStrength: 100,
    });
  };
  img.onerror = () => reject(new Error('無法讀取圖片'));
  img.src = src;
});

export { hexToRgb, applyChromaKey, autoDetectBgFromImage };
