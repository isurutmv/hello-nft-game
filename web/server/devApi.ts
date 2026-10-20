// Vite dev-server middleware that serves the same /api routes as the Vercel functions.
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { dashCutout } from "./dashArt";

export function devApi(): Plugin {
  const cache = path.join(process.cwd(), "node_modules", ".cache", "dash-art");
  return {
    name: "doge-dash-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/dash\/(\d+)(?:\.png)?(?:\?.*)?$/);
        if (!m) return next();
        const id = Number(m[1]);
        const file = path.join(cache, `${id}.png`);
        try {
          let png: Buffer;
          if (fs.existsSync(file)) png = fs.readFileSync(file);
          else {
            png = await dashCutout(id);
            fs.mkdirSync(cache, { recursive: true });
            fs.writeFileSync(file, png);
          }
          res.setHeader("Content-Type", "image/png");
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.end(png);
        } catch (e) {
          res.statusCode = 502;
          res.end(String(e));
        }
      });
    },
  };
}
