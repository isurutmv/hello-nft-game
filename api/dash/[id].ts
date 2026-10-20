// GET /api/dash/:id -> transparent cut-out PNG of HELLO Doge Dash #id (Vercel serverless function).
// Cached at the edge for a year: a token's art never changes.
import { dashCutout } from "../../web/server/dashArt.js";

export default async function handler(req: { query: Record<string, string | string[]> }, res: {
  status(code: number): { send(body: unknown): void; json(body: unknown): void };
  setHeader(name: string, value: string): void;
}) {
  const raw = String(req.query.id ?? "").replace(/\.png$/, "");
  const id = Number(raw);
  try {
    const png = await dashCutout(id);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.status(200).send(png);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(/bad token/.test(String(e)) ? 400 : 502).json({ error: String((e as Error).message ?? e) });
  }
}
