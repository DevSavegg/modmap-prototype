'use strict';
/* OpenThai2.0-OCR-Text (iApp, Apache-2.0) in the browser: the second OCR layer, used when Tesseract finds no room code.
   A JavaScript port of the parts of the model's runtime/line_engine.py a room sign needs:
   detector (PP-OCRv6-tiny DB head) → line boxes → recognizer (CTC, 48 px lines, "flatten" colour mode) → text.
   Simplification: line boxes are axis-aligned (no rotated rectangles, no deskew, no reading order).
   Thresholds come from the model's det.yml: thresh 0.2, box_thresh 0.4, unclip 1.4. */
const OpenThaiOCR = (() => {
  const ORT_VER = '1.19.2';
  const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
  const DIR = 'models/openthai/';
  const DET = { limit: 1280, thresh: 0.2, boxThresh: 0.4, unclip: 1.4, minSize: 3 };
  const REC_H = 48, REC_MAX_W = 3200;
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225]; // applied to B, G, R (the runtime feeds BGR)
  let ready = null;

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  }
  async function init() {
    if (!window.ort) await loadScript(`${ORT_BASE}ort.min.js`);
    window.ort.env.wasm.wasmPaths = ORT_BASE;
    window.ort.env.wasm.numThreads = 1;            // static hosting has no cross-origin isolation, so no threads
    const opt = { executionProviders: ['wasm'] };
    const [det, rec, dict] = await Promise.all([
      window.ort.InferenceSession.create(`${DIR}det.onnx`, opt),
      window.ort.InferenceSession.create(`${DIR}rec.onnx`, opt),
      fetch(`${DIR}rec_dict.txt`).then((r) => r.text()),
    ]);
    const chars = [''].concat(dict.split('\n').filter((c) => c), [' ']);   // 0 = CTC blank, dictionary, then space
    return { det, rec, chars };
  }

  function detect(m, src, W0, H0) {
    const pad = Math.max(8, Math.floor(0.05 * Math.min(W0, H0)));
    const w = W0 + 2 * pad, h = H0 + 2 * pad;
    const s = Math.min(DET.limit / Math.max(w, h), 4);
    const rw = Math.max(32, Math.round((w * s) / 32) * 32), rh = Math.max(32, Math.round((h * s) / 32) * 32);
    const c = document.createElement('canvas'); c.width = rw; c.height = rh;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, rw, rh);
    g.drawImage(src, (pad * rw) / w, (pad * rh) / h, (W0 * rw) / w, (H0 * rh) / h);
    const px = g.getImageData(0, 0, rw, rh).data, N = rw * rh, x = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) {
      const r = px[i * 4] / 255, gg = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
      x[i] = (b - MEAN[0]) / STD[0]; x[N + i] = (gg - MEAN[1]) / STD[1]; x[2 * N + i] = (r - MEAN[2]) / STD[2];
    }
    return { input: new window.ort.Tensor('float32', x, [1, 3, rh, rw]), rw, rh, sx: w / rw, sy: h / rh, pad };
  }
  function boxesFrom(prob, pw, ph, meta, W0, H0) {
    const N = pw * ph, seen = new Uint8Array(N), boxes = [], stack = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      if (seen[i] || prob[i] <= DET.thresh) continue;
      let top = 0, x0 = pw, x1 = 0, y0 = ph, y1 = 0, sum = 0, n = 0;
      stack[top++] = i; seen[i] = 1;
      while (top) {
        const k = stack[--top], kx = k % pw, ky = (k - kx) / pw;
        sum += prob[k]; n++;
        if (kx < x0) x0 = kx; if (kx > x1) x1 = kx; if (ky < y0) y0 = ky; if (ky > y1) y1 = ky;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = kx + dx, ny = ky + dy; if (nx < 0 || ny < 0 || nx >= pw || ny >= ph) continue;
          const j = ny * pw + nx; if (!seen[j] && prob[j] > DET.thresh) { seen[j] = 1; stack[top++] = j; }
        }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (Math.min(bw, bh) < DET.minSize || sum / n < DET.boxThresh) continue;
      const off = (bw * bh * DET.unclip) / (2 * (bw + bh));           // DB unclip distance: area × ratio / perimeter
      const X0 = Math.max(0, (x0 - off) * meta.sx - meta.pad), X1 = Math.min(W0 - 1, (x1 + 1 + off) * meta.sx - meta.pad);
      const Y0 = Math.max(0, (y0 - off) * meta.sy - meta.pad), Y1 = Math.min(H0 - 1, (y1 + 1 + off) * meta.sy - meta.pad);
      if (X1 - X0 >= 2 && Y1 - Y0 >= 2) boxes.push([X0, Y0, X1, Y1]);
    }
    return boxes.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }
  function median(a) { const s = Float32Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function lineTensor(src, b) {
    // crop → grey at 48 px high → "flatten": subtract each column's background (median of top and bottom margins), any polarity
    const bw = b[2] - b[0], bh = b[3] - b[1];
    const W = Math.max(1, Math.min(REC_MAX_W, Math.ceil((REC_H * bw) / Math.max(bh, 1))));
    const c = document.createElement('canvas'); c.width = W; c.height = REC_H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, b[0], b[1], bw, bh, 0, 0, W, REC_H);
    const px = g.getImageData(0, 0, W, REC_H).data, gray = new Float32Array(W * REC_H);
    for (let i = 0; i < W * REC_H; i++) gray[i] = Math.round(px[i * 4 + 2] * 0.114 + px[i * 4 + 1] * 0.587 + px[i * 4] * 0.299);
    const k = Math.max(2, Math.floor(REC_H / 6)), col = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const v = []; for (let y = 0; y < k; y++) { v.push(gray[y * W + x], gray[(REC_H - 1 - y) * W + x]); }
      col[x] = Math.floor(median(v));
    }
    const win = Math.max(3, Math.min(REC_H | 1, 255)), half = win >> 1, bg = new Float32Array(W);
    for (let x = 0; x < W; x++) { const v = []; for (let d = -half; d <= half; d++) v.push(col[Math.min(W - 1, Math.max(0, x + d))]); bg[x] = median(v); }
    const diff = new Float32Array(W * REC_H), hist = new Uint32Array(256);
    for (let y = 0; y < REC_H; y++) for (let x = 0; x < W; x++) { const d = Math.abs(gray[y * W + x] - bg[x]); diff[y * W + x] = d; hist[Math.min(255, d | 0)]++; }
    let acc = 0, hi = 0; const target = 0.98 * W * REC_H;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) { hi = i; break; } }
    hi = Math.max(hi, 24);
    const N = W * REC_H, t = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) { const v = (255 - Math.min(255, (diff[i] * 255) / hi)) / 255; const z = (v - 0.5) / 0.5; t[i] = z; t[N + i] = z; t[2 * N + i] = z; }
    return new window.ort.Tensor('float32', t, [1, 3, REC_H, W]);
  }
  function ctc(out, chars) {
    const [, T, C] = out.dims, p = out.data; let text = '', prev = -1, confSum = 0, n = 0;
    for (let t = 0; t < T; t++) {
      let bi = 0, bv = -Infinity;
      for (let c = 0; c < C; c++) { const v = p[t * C + c]; if (v > bv) { bv = v; bi = c; } }
      if (bi !== prev && bi !== 0) { text += chars[bi] || ''; confSum += bv; n++; }
      prev = bi;
    }
    return { text, conf: n ? confSum / n : 0 };
  }

  async function read(src, W0, H0) {
    if (!ready) ready = init().catch((e) => { ready = null; throw e; });
    const m = await ready;
    const meta = detect(m, src, W0, H0);
    const dOut = await m.det.run({ [m.det.inputNames[0]]: meta.input });
    const prob = dOut[m.det.outputNames[0]];
    const [, , ph, pw] = prob.dims;
    const boxes = boxesFrom(prob.data, pw, ph, meta, W0, H0).slice(0, 40);
    const lines = [];
    for (const b of boxes) {
      const r = await m.rec.run({ [m.rec.inputNames[0]]: lineTensor(src, b) });
      const { text, conf } = ctc(r[m.rec.outputNames[0]], m.chars);
      if (text.trim()) lines.push({ text, conf, box: b });
    }
    return { text: lines.map((l) => l.text).join('\n'), lines };
  }
  return { read };
})();
