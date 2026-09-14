import { useEffect, useRef, useState } from "react";
import { Eraser, Upload } from "lucide-react";

type Mode = "draw" | "type" | "image";
const W = 520;
const H = 180;

/** Crop a canvas to its non-transparent bounding box and return a PNG data URL. */
function exportTrimmed(source: HTMLCanvasElement): string | null {
  const ctx = source.getContext("2d")!;
  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d")!.drawImage(source, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/** Make near-white pixels transparent so scanned signatures blend into the page. */
function knockOutWhite(canvas: HTMLCanvasElement, threshold = 215): void {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum > threshold) d[i + 3] = 0;
    else if (lum > threshold - 40) d[i + 3] = Math.round(((threshold - lum) / 40) * 255);
  }
  ctx.putImageData(img, 0, 0);
}

export function SignatureDialog({ onDone }: { onDone: (dataUrl: string | null) => void }) {
  const [mode, setMode] = useState<Mode>("draw");
  const [typed, setTyped] = useState("");
  const [thickness, setThickness] = useState(3);
  const [hasInk, setHasInk] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [transparent, setTransparent] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  // Redraw typed text.
  useEffect(() => {
    if (mode !== "type") return;
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!typed.trim()) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    let size = 64;
    ctx.font = `${size}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`;
    while (ctx.measureText(typed).width > W - 40 && size > 16) {
      size -= 2;
      ctx.font = `${size}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`;
    }
    ctx.fillStyle = "#101010";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(typed, W / 2, H / 2);
    ctx.restore();
  }, [typed, mode, dpr]);

  // Redraw uploaded image.
  useEffect(() => {
    if (mode !== "image") return;
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    const img = imageRef.current;
    if (!img) return;
    const scale = Math.min((W - 20) / img.naturalWidth, (H - 20) / img.naturalHeight, 4);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    ctx.restore();
    if (transparent) knockOutWhite(c);
  }, [mode, imageLoaded, transparent, dpr]);

  useEffect(() => {
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "draw") return;
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const rect = c.getBoundingClientRect();
    const pt = (ev: { clientX: number; clientY: number }) => [((ev.clientX - rect.left) / rect.width) * c.width, ((ev.clientY - rect.top) / rect.height) * c.height];
    let [lx, ly] = pt(e);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#101010";
    ctx.lineWidth = thickness * dpr;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 0.1, ly + 0.1);
    ctx.stroke();
    setHasInk(true);
    c.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const [x, y] = pt(ev);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(x, y);
      ctx.stroke();
      lx = x;
      ly = y;
    };
    const up = () => {
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
    };
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const canAdd = mode === "draw" ? hasInk : mode === "type" ? typed.trim().length > 0 : imageLoaded;
  const add = () => {
    const url = exportTrimmed(canvasRef.current!);
    onDone(url);
  };

  return (
    <div className="modal modal--wide" role="dialog" aria-label="Create signature">
      <h3>Create signature</h3>
      <div className="segmented">
        {(["draw", "type", "image"] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? "is-active" : ""} onClick={() => setMode(m)}>
            {m === "draw" ? "Draw" : m === "type" ? "Type" : "Image"}
          </button>
        ))}
      </div>

      {mode === "type" && (
        <input className="input" autoFocus placeholder="Type your name" value={typed} onChange={(e) => setTyped(e.target.value)} />
      )}
      {mode === "image" && (
        <div className="btnRow">
          <label className="btn">
            <Upload size={14} /> Choose image…
            <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <label className="check">
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Remove white background
          </label>
        </div>
      )}

      <div className={"sigPad" + (mode === "draw" ? " sigPad--draw" : "")}>
        <canvas ref={canvasRef} width={W * dpr} height={H * dpr} style={{ width: W, height: H }} onPointerDown={onPointerDown} />
        {mode === "draw" && !hasInk && <span className="sigPad__hint">Draw your signature here</span>}
        {mode === "image" && !imageLoaded && <span className="sigPad__hint">Choose a PNG or JPEG of your signature</span>}
      </div>

      <div className="modal__row">
        {mode === "draw" && (
          <>
            <label className="field field--inline">
              <span className="field__label">Thickness</span>
              <input type="range" min={1} max={8} value={thickness} onChange={(e) => setThickness(Number(e.target.value))} />
            </label>
            <button className="btn btn--sm" onClick={clear} disabled={!hasInk}>
              <Eraser size={14} /> Clear
            </button>
          </>
        )}
        <span className="modal__spacer" />
        <button className="btn" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button className="btn btn--primary" onClick={add} disabled={!canAdd}>
          Add signature
        </button>
      </div>
    </div>
  );
}
