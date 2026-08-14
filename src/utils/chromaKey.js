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

export { hexToRgb, applyChromaKey };
