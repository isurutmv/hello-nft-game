// A small runtime for the design's `.dc.html` components, so the cards, card backs and packs
// render from the original HTML/CSS unchanged.
//
// Supported template features (everything the Series 1 components use):
//   {{path.to.value}}         text and attribute interpolation ({{ true }} / {{ false }} literals too)
//   onClick="{{fn}}" etc.     event handlers from renderVals()
//   <sc-if value="{{x}}">     conditional children
//   <sc-for list="{{xs}}" as="x">  repeated children
//   <dc-import name="Card" prop="{{v}}">  nested components with props
//   <helmet>                  per-component <style>/<link>, injected once per shadow root
// Logic is the component's own `class Component extends DCLogic { renderVals() {...} }`.

export type Vals = Record<string, unknown>;

export class DCLogic {
  props: Record<string, unknown>;
  state: Record<string, unknown> = {};
  /** Set by the runtime: re-renders this component. */
  _rerender: () => void = () => {};
  constructor(props: Record<string, unknown>) {
    this.props = props;
  }
  setState(patch: Record<string, unknown>) {
    this.state = { ...this.state, ...patch };
    this._rerender();
  }
  componentDidMount?(): void;
  componentWillUnmount?(): void;
  renderVals(): Vals {
    return {};
  }
}

type ComponentDef = {
  name: string;
  template: HTMLTemplateElement;
  helmet: string;
  Logic: typeof DCLogic;
};

const registry = new Map<string, ComponentDef>();

/** Register a component from its `.dc.html` source. `rewriteUrl` maps asset URLs (e.g. /_blob/…). */
export function registerComponent(name: string, source: string, rewriteUrl: (u: string) => string = (u) => u) {
  const src = source.replace(/\/_blob\/[0-9a-f]{32}/g, (m) => rewriteUrl(m));
  const body = src.slice(src.indexOf("<x-dc>") + 6, src.indexOf("</x-dc>"));
  const helmetMatch = body.match(/<helmet>([\s\S]*?)<\/helmet>/);
  const helmet = helmetMatch ? helmetMatch[1] : "";
  const template = document.createElement("template");
  template.innerHTML = body.replace(/<helmet>[\s\S]*?<\/helmet>/, "");
  const script = src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  const code = script ? script[1] : "class Component extends DCLogic {}";
  // The components' logic ships with the design files in this repo; it only maps props to values.
  const Logic = new Function("DCLogic", `${code}\nreturn Component;`)(DCLogic) as typeof DCLogic;
  registry.set(name, { name, template, helmet, Logic });
}

export function hasComponent(name: string) {
  return registry.has(name);
}

// ------------------------------------------------------------------ expressions

const EXPR = /\{\{\s*([^}]*?)\s*\}\}/g;

function lookup(path: string, scope: Vals): unknown {
  if (path === "true") return true;
  if (path === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
  let v: unknown = scope;
  for (const part of path.split(".")) {
    if (v === null || v === undefined) return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

function single(value: string): string | null {
  const m = value.match(/^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/);
  return m ? m[1] : null;
}

function interpolate(value: string, scope: Vals): string {
  return value.replace(EXPR, (_, p: string) => {
    const v = lookup(p, scope);
    return v === undefined || v === null || v === false ? "" : String(v);
  });
}

// ------------------------------------------------------------------ rendering

const SVG_NS = "http://www.w3.org/2000/svg";

type Instance = { logic: DCLogic; host: Element; def: ComponentDef; children: Instance[]; root: ShadowRoot | Document };

function renderNodes(nodes: NodeListOf<ChildNode> | ChildNode[], scope: Vals, parent: Node, inst: Instance, svg: boolean) {
  for (const n of Array.from(nodes)) renderNode(n, scope, parent, inst, svg);
}

function renderNode(n: ChildNode, scope: Vals, parent: Node, inst: Instance, svg: boolean) {
  if (n.nodeType === Node.TEXT_NODE) {
    const t = n.textContent ?? "";
    parent.appendChild(document.createTextNode(t.includes("{{") ? interpolate(t, scope) : t));
    return;
  }
  if (n.nodeType !== Node.ELEMENT_NODE) return;
  const el = n as Element;
  const tag = el.localName;
  if (tag === "sc-if") {
    const p = single(el.getAttribute("value") ?? "");
    if (p !== null && lookup(p, scope)) renderNodes(el.childNodes, scope, parent, inst, svg);
    return;
  }
  if (tag === "sc-for") {
    const p = single(el.getAttribute("list") ?? "");
    const as = el.getAttribute("as") ?? "item";
    const list = p !== null ? lookup(p, scope) : [];
    if (Array.isArray(list)) list.forEach((item, i) => renderNodes(el.childNodes, { ...scope, [as]: item, $index: i }, parent, inst, svg));
    return;
  }
  if (tag === "dc-import") {
    const name = el.getAttribute("name")!;
    const props: Record<string, unknown> = {};
    for (const a of Array.from(el.attributes)) {
      if (a.name === "name" || a.name.startsWith("hint-")) continue;
      const p = single(a.value);
      props[a.name] = p !== null ? lookup(p, scope) : interpolate(a.value, scope);
    }
    const holder = document.createElement("div");
    holder.style.display = "contents";
    parent.appendChild(holder);
    inst.children.push(mountInto(holder, name, props, inst.root));
    return;
  }
  const isSvg = svg || tag === "svg";
  const out = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const a of Array.from(el.attributes)) {
    if (a.name.startsWith("hint-")) continue;
    const p = single(a.value);
    if (/^on[a-z]+$/i.test(a.name) && p !== null) {
      const fn = lookup(p, scope);
      if (typeof fn === "function") setHandler(out, a.name.slice(2).toLowerCase(), fn as EventListener);
      continue;
    }
    if (p !== null) {
      const v = lookup(p, scope);
      if (v === false || v === null || v === undefined) continue;
      out.setAttribute(a.name, v === true ? "" : String(v));
    } else out.setAttribute(a.name, a.value.includes("{{") ? interpolate(a.value, scope) : a.value);
  }
  parent.appendChild(out);
  renderNodes(el.childNodes, scope, out, inst, isSvg);
}

const injected = new WeakMap<ShadowRoot | Document, Set<string>>();

function injectHelmet(root: ShadowRoot | Document, def: ComponentDef) {
  let set = injected.get(root);
  if (!set) injected.set(root, (set = new Set()));
  if (set.has(def.name) || !def.helmet) return;
  set.add(def.name);
  const box = document.createElement("div");
  box.innerHTML = def.helmet;
  const target = root instanceof Document ? root.head : root;
  // Font <link>s are loaded once by the page; only styles go into the shadow root.
  for (const s of Array.from(box.querySelectorAll("style"))) target.appendChild(s);
}

// ------------------------------------------------------------------ DOM patching
// Re-renders are applied by patching the live DOM to match the new render, so running CSS
// animations, loaded images and focus survive state changes (the design's pack opening
// updates its state every 40ms).

type Handlers = Record<string, EventListener>;
type HandlerHost = Element & { __dcHandlers?: Handlers };

function setHandler(el: Element, type: string, fn: EventListener) {
  const h = el as HandlerHost;
  if (!h.__dcHandlers) h.__dcHandlers = {};
  h.__dcHandlers[type] = fn;
}

function bindHandlers(el: HandlerHost) {
  const hs = el.__dcHandlers;
  if (!hs) return;
  const bound = ((el as unknown as { __dcBound?: Set<string> }).__dcBound ??= new Set());
  for (const type of Object.keys(hs)) {
    if (bound.has(type)) continue;
    bound.add(type);
    el.addEventListener(type, (e) => el.__dcHandlers?.[type]?.(e));
  }
}

function bindAll(root: Node) {
  if (root instanceof Element) bindHandlers(root as HandlerHost);
  root.childNodes.forEach(bindAll);
}

function sameKind(a: Node, b: Node) {
  return a.nodeType === b.nodeType && (a.nodeType !== Node.ELEMENT_NODE || (a as Element).localName === (b as Element).localName);
}

function morph(from: Node, to: Node) {
  if (from.nodeType === Node.TEXT_NODE) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  if (from.nodeType !== Node.ELEMENT_NODE) return;
  const f = from as HandlerHost;
  const t = to as HandlerHost;
  for (const a of Array.from(f.attributes)) if (!t.hasAttribute(a.name)) f.removeAttribute(a.name);
  for (const a of Array.from(t.attributes)) if (f.getAttribute(a.name) !== a.value) f.setAttribute(a.name, a.value);
  f.__dcHandlers = t.__dcHandlers;
  bindHandlers(f);
  morphChildren(f, t);
}

function morphChildren(from: Node, to: Node) {
  const next = Array.from(to.childNodes);
  let cur = from.firstChild;
  for (const n of next) {
    if (cur && sameKind(cur, n)) {
      morph(cur, n);
      cur = cur.nextSibling;
    } else {
      bindAll(n);
      from.insertBefore(n, cur);
    }
  }
  while (cur) {
    const rm = cur;
    cur = cur.nextSibling;
    from.removeChild(rm);
  }
}

function draw(inst: Instance) {
  for (const c of inst.children) unmount(c);
  inst.children = [];
  const frag = document.createDocumentFragment();
  renderNodes(inst.def.template.content.childNodes, inst.logic.renderVals(), frag, inst, false);
  if (!inst.host.firstChild) {
    bindAll(frag);
    inst.host.appendChild(frag);
  } else morphChildren(inst.host, frag);
}

function mountInto(host: Element, name: string, props: Record<string, unknown>, root: ShadowRoot | Document): Instance {
  const def = registry.get(name);
  if (!def) throw new Error(`Unknown design component ${name}`);
  injectHelmet(root, def);
  const logic = new def.Logic(props);
  if (!logic.state) logic.state = {};
  const inst: Instance = { logic, host, def, children: [], root };
  logic._rerender = () => draw(inst);
  draw(inst);
  logic.componentDidMount?.();
  return inst;
}

function unmount(inst: Instance) {
  for (const c of inst.children) unmount(c);
  inst.logic.componentWillUnmount?.();
  inst.logic._rerender = () => {};
}

export type Mounted = { update(props: Record<string, unknown>): void; destroy(): void };

/** Render component `name` into a shadow root on `host`. */
export function mount(host: HTMLElement, name: string, props: Record<string, unknown>): Mounted {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const box = document.createElement("div");
  shadow.replaceChildren(box);
  injected.delete(shadow);
  let inst = mountInto(box, name, props, shadow);
  return {
    update(next) {
      unmount(inst);
      inst = mountInto(box, name, next, shadow);
    },
    destroy() {
      unmount(inst);
      shadow.replaceChildren();
    },
  };
}
