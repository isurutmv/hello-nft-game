// Cut-out art for HELLO Doge Dash NFTs, in the style of the Series 1 design files: the Dash on a
// transparent background, so the card supplies its own background colour and dots.
//
// The collection's images (Ethereum 0x44357CB1fC60FD5c6E3E673F6b71B38baf83D386) are flat-colour
// backgrounds behind the character. The background is removed by flood-filling from the image edges,
// so colours inside the art that match the background (pink headphones on a pink background) stay.
import sharp from "sharp";

export const DOGE_DASH_CONTRACT = "0x44357CB1fC60FD5c6E3E673F6b71B38baf83D386";
export const IMAGE_CID = "QmYTS6KMs9AgkqrB1NX9du2EEAFJXyCjEv4amX2X2ZDHt4";
export const METADATA_CID = "QmZasRx2N6bDHmHVhhmbfQU7gBuwTiX2xGhGTipSSF9QTT";
export const MAX_TOKEN = 4120;

const GATEWAY = (process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud").replace(/\/$/, "");

export function sourceImageUrl(id: number) {
  return `${GATEWAY}/ipfs/${IMAGE_CID}/${id}.png`;
}

/** Fetch token `id`'s image and return a trimmed, transparent PNG about `size` px tall. */
export async function dashCutout(id: number, size = 520): Promise<Buffer> {
  if (!Number.isInteger(id) || id < 1 || id > MAX_TOKEN) throw new Error("bad token id");
  const res = await fetch(sourceImageUrl(id), { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  return cutoutFromImage(input, size);
}

export async function cutoutFromImage(input: Buffer, size = 520): Promise<Buffer> {
  // Work at a moderate resolution: plenty for a 380px card slot, fast to flood-fill.
  const { data, info } = await sharp(input).resize({ height: 900, withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);

  // Background colour: median of the four corners.
  const corner = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const cs = [corner(2, 2), corner(w - 3, 2), corner(2, h - 3), corner(w - 3, h - 3)];
  const bg = [0, 1, 2].map((c) => cs.map((v) => v[c]).sort((a, b) => a - b)[1]);
  const dist = (i: number) => Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]);

  // Flood fill from every edge pixel through "close to background" pixels.
  const HARD = 48; // definitely background
  const SOFT = 120; // anti-aliased edge: partially transparent
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (seen[p]) return;
    if (dist(p * 4) > HARD) return;
    seen[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (seen[p]) {
      px[i + 3] = 0;
      continue;
    }
    // Soften pixels that touch the removed background (anti-aliased outline).
    const x = p % w;
    const y = (p - x) / w;
    const nearBg = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (y > 0 && seen[p - w]) || (y < h - 1 && seen[p + w]);
    if (nearBg) {
      const d = dist(i);
      if (d < SOFT) px[i + 3] = Math.round(255 * ((d - HARD) / (SOFT - HARD)));
    }
  }

  return sharp(Buffer.from(px.buffer, px.byteOffset, px.length), { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })
    .resize({ height: size, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}
