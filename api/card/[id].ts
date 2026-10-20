// GET /api/card/:id -> 720x1008 PNG of Doge Dash Collector Card #id, rendered from the design
// templates (card.html). A minted card never changes, so the image is cached for a year.
import { screenshot, siteOrigin, type Req, type Res } from "../_render.js";

export default async function handler(req: Req, res: Res) {
  const id = String(req.query.id ?? "").replace(/\.png$/, "");
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: "bad card id" });
  try {
    const png = await screenshot(`${siteOrigin(req)}/card.html?id=${id}&static=1`, 720, 1008);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.status(200).send(png);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: String((e as Error).message ?? e) });
  }
}
