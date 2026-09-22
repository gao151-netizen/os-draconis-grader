/**
 * Browser image feature extraction for Os Draconis grading.
 * Features: OpenCV-scale Lab L*, centred b*, LBP entropy on bone-like pixels.
 */
(function (global) {
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function rgbToLab(r, g, b) {
    const R = srgbToLinear(r),
      G = srgbToLinear(g),
      B = srgbToLinear(b);
    let x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
    let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
    let z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
    x /= 0.95047;
    y /= 1;
    z /= 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x),
      fy = f(y),
      fz = f(z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  function lbpCode(gray, w, h, x, y) {
    const at = (xx, yy) => gray[yy * w + xx];
    const c = at(x, y);
    const nbs = [
      at(x - 1, y - 1),
      at(x, y - 1),
      at(x + 1, y - 1),
      at(x + 1, y),
      at(x + 1, y + 1),
      at(x, y + 1),
      at(x - 1, y + 1),
      at(x - 1, y),
    ];
    let code = 0;
    for (let i = 0; i < 8; i++) if (nbs[i] >= c) code |= 1 << i;
    return code;
  }

  function entropy(hist) {
    let s = 0;
    for (let i = 0; i < hist.length; i++) s += hist[i];
    if (s <= 0) return 0;
    let e = 0;
    for (let i = 0; i < hist.length; i++) {
      if (!hist[i]) continue;
      const p = hist[i] / s;
      e -= p * Math.log2(p);
    }
    return e;
  }

  function extractFeatures(img, maxSide) {
    maxSide = maxSide || 512;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(32, Math.round(img.width * scale));
    const h = Math.max(32, Math.round(img.height * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const gray = new Float32Array(w * h);
    const mask = new Uint8Array(w * h);
    let sumL = 0,
      sumA = 0,
      sumB = 0,
      n = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
      gray[p] = lab.L;
      const chroma = Math.hypot(lab.a, lab.b);
      const isPaper = lab.L > 88 && chroma < 8;
      const isBone = !isPaper && lab.L > 25 && lab.L < 95;
      if (isBone) {
        mask[p] = 1;
        sumL += lab.L;
        sumA += lab.a;
        sumB += lab.b;
        n++;
      }
    }

    if (n < 50) {
      for (let y = (h * 0.2) | 0; y < (h * 0.8) | 0; y++) {
        for (let x = (w * 0.2) | 0; x < (w * 0.8) | 0; x++) {
          const p = y * w + x;
          const i = p * 4;
          const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
          mask[p] = 1;
          sumL += lab.L;
          sumA += lab.a;
          sumB += lab.b;
          n++;
        }
      }
    }

    const meanL = sumL / n;
    const meanB = sumB / n;
    // Match OpenCV 0–255 L used in the training table
    const lab_mean_L = meanL * (255 / 100);
    const lab_mean_b_centered = meanB;

    const hist = new Array(256).fill(0);
    let textureN = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (!mask[p]) continue;
        hist[lbpCode(gray, w, h, x, y)]++;
        textureN++;
      }
    }
    const lbp_entropy = textureN ? entropy(hist) : 0;

    const preview = document.createElement("canvas");
    preview.width = w;
    preview.height = h;
    const pctx = preview.getContext("2d");
    const pdata = pctx.createImageData(w, h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      if (mask[p]) {
        pdata.data[i] = data[i];
        pdata.data[i + 1] = data[i + 1];
        pdata.data[i + 2] = data[i + 2];
        pdata.data[i + 3] = 255;
      } else {
        pdata.data[i] = 28;
        pdata.data[i + 1] = 32;
        pdata.data[i + 2] = 38;
        pdata.data[i + 3] = 255;
      }
    }
    pctx.putImageData(pdata, 0, 0);

    return {
      lab_mean_L,
      lab_mean_b_centered,
      lbp_entropy,
      n_pixels: n,
      previewCanvas: preview,
    };
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const okType =
        !file.type ||
        ["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(file.type) ||
        /\.(jpe?g|png|webp|bmp)$/i.test(file.name);
      if (!okType) {
        reject(new Error("Supported image types: JPG, PNG, WEBP, BMP (max 15 MB)."));
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        reject(new Error("Image exceeds 15 MB limit."));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not decode the image file."));
      };
      img.src = url;
    });
  }

  global.OsDraconisImage = { extractFeatures, loadImageFromFile };
})(window);
