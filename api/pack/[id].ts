// GET /api/pack/:id -> 720x1120 PNG of a sealed Series 1 pack, from the design's pack wrapper.
import { screenshot, siteOrigin, type Req, type Res } from "../_render.js";

export default async function handler(req: Req, res: Res) {
  const id = String(req.query.id ?? "").replace(/\.png$/, "");
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: "bad pack id" });
  try {
    const png = await screenshot(`${siteOrigin(req)}/card.html?pack=${id}&static=1`, 720, 1120);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.status(200).send(png);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String((e as Error).message ?? e) });
  }
}
