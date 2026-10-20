// Standalone NFT page: /card.html?id=<cardTokenId> or /card.html?pack=<packTokenId>.
//   ?static=1  renders at 720x1008 for the PNG renderer (/api/card/:id), then sets window.__cardReady
//   default    an interactive card for marketplaces (animation_url): tilt for the holo glare, tap to flip
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { registerDesign } from "./dc";
import { mount } from "./dc/runtime";
import { designCard } from "./lib/designCard";
import { toCard } from "./lib/cards";
import { DashCardsAbi, getDeployment } from "./contracts";

declare global {
  interface Window {
    __cardReady?: boolean;
    __cardError?: string;
  }
}

const q = new URLSearchParams(location.search);
const isStatic = q.has("static");
const chainId = Number(q.get("chain") ?? bscTestnet.id);
const root = document.getElementById("root")!;

async function waitForImages(host: HTMLElement) {
  await document.fonts.ready;
  const imgs = Array.from(host.shadowRoot?.querySelectorAll("img") ?? []);
  await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
  // mask-image and background-image art: preload the same URLs
  const urls = new Set<string>();
  host.shadowRoot?.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const s = el.getAttribute("style") ?? "";
    for (const m of s.matchAll(/url\(([^)]+)\)/g)) urls.add(m[1].replace(/["']/g, ""));
  });
  await Promise.all([...urls].map((u) => new Promise((r) => {
    const i = new Image();
    i.onload = i.onerror = r;
    i.src = u;
  })));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

async function main() {
  registerDesign();
  const host = document.createElement("div");
  host.style.cssText = isStatic
    ? "width:360px;height:504px;transform:scale(2);transform-origin:0 0"
    : "width:360px;height:504px;transform-origin:0 0;transition:transform .3s ease-out";
  root.appendChild(host);
  if (!isStatic) document.body.classList.add("interactive");

  if (q.has("pack")) {
    host.style.height = "560px";
    if (isStatic) root.style.height = "1120px";
    mount(host, "PackWrapper", { shine: 30 });
  } else {
    const id = BigInt(q.get("id") ?? "0");
    const dep = getDeployment(chainId);
    if (!dep) throw new Error(`no deployment for chain ${chainId}`);
    const client = createPublicClient({ chain: bscTestnet, transport: http(import.meta.env.VITE_BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com") });
    const raw = await client.readContract({ address: dep.contracts.DashCards, abi: DashCardsAbi, functionName: "cardOf", args: [id] });
    const card = designCard(toCard(raw));
    let back = false;
    let gx = 50;
    let gy = 40;
    const inst = mount(host, "CardFace", { card, glare: !isStatic, gx, gy });
    if (!isStatic) {
      const fit = () => {
        const s = root.clientWidth / 360;
        host.style.transform = `scale(${s})`;
      };
      fit();
      window.addEventListener("resize", fit);
      root.addEventListener("pointermove", (e) => {
        const r = root.getBoundingClientRect();
        gx = Math.round(((e.clientX - r.left) / r.width) * 100);
        gy = Math.round(((e.clientY - r.top) / r.height) * 100);
        const s = root.clientWidth / 360;
        host.style.transform = `scale(${s}) rotateX(${(50 - gy) / 6}deg) rotateY(${(gx - 50) / 6}deg)`;
        inst.update({ card, back, glare: true, gx, gy });
      });
      root.addEventListener("click", () => {
        back = !back;
        inst.update({ card, back, glare: !back, gx, gy });
      });
    }
  }
  await waitForImages(host);
  window.__cardReady = true;
}

main().catch((e) => {
  window.__cardError = String(e);
  root.textContent = String(e);
});
