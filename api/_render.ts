// Shared headless-Chromium screenshot for the NFT image endpoints.
// On Vercel it uses @sparticuz/chromium; locally set CHROME_PATH to any Chrome/Chromium binary.
import type { Browser } from "puppeteer-core";

let browser: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.CHROME_PATH) {
    const extra = process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(" ") : [];
    return puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox", ...extra], headless: true });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: null });
}

/** Screenshot `url` (the standalone card page in static mode) once it signals it is ready. */
export async function screenshot(url: string, width: number, height: number): Promise<Buffer> {
  browser ??= launch();
  const b = await browser;
  const page = await b.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 25_000 });
    await page.waitForFunction("window.__cardReady === true || !!window.__cardError", { timeout: 20_000 });
    const err = await page.evaluate("window.__cardError");
    if (err) throw new Error(String(err));
    const png = await page.screenshot({ type: "png", omitBackground: true, clip: { x: 0, y: 0, width, height } });
    return Buffer.from(png);
  } finally {
    await page.close();
  }
}

export function siteOrigin(req: { headers: Record<string, string | string[] | undefined> }) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:5173");
  const proto = String(req.headers["x-forwarded-proto"] ?? (host.startsWith("localhost") ? "http" : "https"));
  return `${proto}://${host}`;
}

export type Req = { query: Record<string, string | string[]>; headers: Record<string, string | string[] | undefined> };
export type Res = {
  status(code: number): { send(body: unknown): void; json(body: unknown): void };
  setHeader(name: string, value: string): void;
};
