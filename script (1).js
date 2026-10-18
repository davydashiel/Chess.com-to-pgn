"use strict";
const $ = id => document.getElementById(id);
const MN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const TC = [["bullet","Bullet"],["blitz","Blitz"],["rapid","Rapid"],["daily","Daily"]];
const RS = [["win","Wins"],["draw","Draws"],["loss","Losses"]];
const DRAWS = new Set(["agreed","repetition","stalemate","insufficient","50move","timevsinsufficient"]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safe = s => String(s || "unknown").replace(/[^\w.-]+/g, "_");
const pad = n => String(n).padStart(2, "0");
const keyOf = (y, m) => `${y}-${pad(m)}`;

let user = "", data = {}, years = [], sel = new Set(), firstRender = true;
const tcOn = new Set(TC.map(t => t[0]));
const rsOn = new Set(RS.map(r => r[0]));

/* floating background pieces */
(function pieces() {
  const glyphs = "♔♕♖♗♘♙♚♛♜♝♞♟";
  const box = $("pieces");
  for (let i = 0; i < 16; i++) {
    const s = document.createElement("span");
    s.textContent = glyphs[i % glyphs.length];
    s.style.left = Math.random() * 100 + "%";
    s.style.fontSize = 28 + Math.random() * 56 + "px";
    s.style.animationDuration = 16 + Math.random() * 18 + "s";
    s.style.animationDelay = -Math.random() * 30 + "s";
    box.append(s);
  }
})();

/* helpers */
async function getJSON(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (r.status === 404) throw new Error("NOTFOUND");
    if (r.status === 429 || r.status >= 500) { await sleep(1500 * (i + 1)); continue; }
    throw new Error("HTTP " + r.status);
  }
  throw new Error("Chess.com is rate-limiting requests. Wait a minute and try again.");
}
function say(t, err) { const s = $("s"); s.textContent = t; s.className = "status" + (err ? " err" : ""); }
function prog(p) {
  $("track").classList.toggle("on", p != null);
  if (p != null) { $("fill").style.width = p + "%"; $("knight").style.left = p + "%"; }
}
function countUp(el, to) {
  const from = el._v || 0; el._v = to;
  const t0 = performance.now(), dur = 600;
  (function step(t) {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString();
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
function outcome(g) {
  const me = g.white.username.toLowerCase() === user ? g.white : g.black;
  return me.result === "win" ? "win" : DRAWS.has(me.result) ? "draw" : "loss";
}
const match = (g, tcs, rss) => tcs.has(g.time_class) && rss.has(g._o);
const filtered = k => (data[k] || []).filter(g => match(g, tcOn, rsOn));
const countAll = (tcs, rss) => Object.values(data).reduce((a, gs) => a + gs.filter(g => match(g, tcs, rss)).length, 0);

/* load games */
$("f").addEventListener("submit", async e => {
  e.preventDefault();
  user = $("u").value.trim().toLowerCase();
  if (!user) return;
  $("load").disabled = true; $("picker").hidden = true; $("scrollHint").hidden = true;
  data = {}; sel = new Set(); firstRender = true;
  try {
    if (typeof JSZip === "undefined") throw new Error("ZIP library failed to load. Check your connection and reload.");
    say("Finding your archives…"); prog(2);
    let arch;
    try { arch = (await getJSON(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`)).archives; }
    catch (err) { if (err.message === "NOTFOUND") throw new Error(`No Chess.com player named “${user}”. Check the spelling.`); throw err; }
    if (!arch.length) throw new Error("This account has no public games yet.");
    for (let i = 0; i < arch.length; i++) {
      const m = arch[i].match(/(\d{4})\/(\d{2})$/);
      say(`Reading ${MN[+m[2] - 1]} ${m[1]}… (${i + 1} of ${arch.length})`); prog(5 + 93 * i / arch.length);
      const games = ((await getJSON(arch[i])).games || []).filter(g => g.pgn).sort((a, b) => a.end_time - b.end_time);
      games.forEach(g => g._o = outcome(g));
      data[`${m[1]}-${m[2]}`] = games;
      await sleep(120);
    }
    prog(100); await sleep(300); prog(null);
    const keys = Object.keys(data), ys = keys.map(k => +k.slice(0, 4));
    years = []; for (let y = Math.max(...ys); y >= Math.min(...ys); y--) years.push(y);
    keys.forEach(k => { if (data[k].length) sel.add(k); });
    const total = keys.reduce((n, k) => n + data[k].length, 0);
    say(`Found ${total.toLocaleString()} games for ${user}.`);
    $("picker").hidden = false; $("scrollHint").hidden = false;
    render();
    $("picker").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    prog(null);
    say(err.message.startsWith("Failed to fetch") ? "Couldn’t reach Chess.com. Check your connection and try again." : err.message, true);
  } finally { $("load").disabled = false; }
});

/* render filters + month board */
function render() {
  const rbox = $("results"); rbox.textContent = "";
  RS.forEach(([id, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "rc"; b.dataset.r = id; b.setAttribute("aria-pressed", rsOn.has(id));
    const n = document.createElement("b"), l = document.createElement("span");
    l.textContent = label; b.append(n, l); rbox.append(b);
    countUp(n, countAll(tcOn, new Set([id])));
    b.onclick = () => { rsOn.has(id) ? rsOn.delete(id) : rsOn.add(id); render(); };
  });

  const cbox = $("chips"); cbox.textContent = "";
  TC.forEach(([id, label]) => {
    const n = countAll(new Set([id]), rsOn);
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.setAttribute("aria-pressed", tcOn.has(id));
    b.disabled = !n && !tcOn.has(id);
    const s = document.createElement("small"); s.textContent = n.toLocaleString();
    b.append(label, s); cbox.append(b);
    b.onclick = () => { tcOn.has(id) ? tcOn.delete(id) : tcOn.add(id); render(); };
  });

  const g = $("grid"); g.textContent = "";
  const corner = document.createElement("div"); corner.className = "hd"; g.append(corner);
  MN.forEach(m => { const h = document.createElement("div"); h.className = "hd"; h.textContent = m.slice(0, 3); g.append(h); });
  years.forEach((y, r) => {
    const yb = document.createElement("button");
    yb.type = "button"; yb.className = "yr"; yb.textContent = y; yb.title = `Toggle all of ${y}`;
    yb.onclick = () => {
      const ks = MN.map((_, i) => keyOf(y, i + 1)).filter(k => filtered(k).length);
      const all = ks.every(k => sel.has(k));
      ks.forEach(k => all ? sel.delete(k) : sel.add(k)); render();
    };
    g.append(yb);
    MN.forEach((_, i) => {
      const k = keyOf(y, i + 1), n = filtered(k).length, on = sel.has(k) && n > 0;
      const c = document.createElement("button");
      c.type = "button"; c.disabled = !n;
      c.className = "cell " + ((r + i) % 2 ? "a" : "b") + (on ? " on" : "") + (firstRender ? " pop" : "");
      if (firstRender) c.style.setProperty("--d", (r * 40 + i * 30) + "ms");
      c.textContent = n || ""; c.setAttribute("aria-pressed", on);
      c.setAttribute("aria-label", `${MN[i]} ${y}: ${n} games`);
      c.onclick = () => { sel.has(k) ? sel.delete(k) : sel.add(k); render(); };
      g.append(c);
    });
  });
  firstRender = false;

  const chosen = [...sel].filter(k => filtered(k).length);
  const total = chosen.reduce((a, k) => a + filtered(k).length, 0);
  const sum = $("sum"); sum.textContent = "";
  const st = document.createElement("strong"); sum.append(st, ` games from ${chosen.length} month${chosen.length === 1 ? "" : "s"}`);
  countUp(st, total);
  $("dl").disabled = !total;
}
$("qAll").onclick = () => { Object.keys(data).forEach(k => { if (filtered(k).length) sel.add(k); }); render(); };
$("qNone").onclick = () => { sel.clear(); render(); };
$("qLast").onclick = () => { sel.clear(); Object.keys(data).filter(k => filtered(k).length).sort().slice(-12).forEach(k => sel.add(k)); render(); };

/* build + download zip */
$("dl").onclick = async () => {
  const btn = $("dl"), label = btn.firstElementChild; btn.disabled = true; label.textContent = "Building ZIP…";
  try {
    const keys = [...sel].filter(k => filtered(k).length).sort();
    const tag = [TC.map(t => t[0]).filter(t => tcOn.has(t)), RS.map(r => r[0]).filter(r => rsOn.has(r))]
      .map((a, i) => a.length === (i ? RS : TC).length ? "all" : a.join("-")).join("_");
    const rootName = `${safe(user)}_${tag}_games`, zip = new JSZip(), root = zip.folder(rootName);
    keys.forEach(k => {
      const [y, mo] = k.split("-"), games = filtered(k);
      const f = root.folder(y).folder(`${y}-${mo}_${MN[+mo - 1]}`);
      games.forEach((g, i) => {
        const d = new Date(g.end_time * 1000);
        const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        f.file(`${pad(i + 1)}_${date}_${g.time_class}_${g._o}_${safe(g.white.username)}_vs_${safe(g.black.username)}.pgn`, g.pgn + "\n");
      });
      f.file(`_all_games_${k}.pgn`, games.map(g => g.pgn.trim()).join("\n\n\n") + "\n");
    });
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = rootName + ".zip";
    document.body.append(a); a.click(); a.remove();
    label.textContent = "✓ Saved!"; await sleep(1800);
  } catch (err) { say(err.message, true); }
  finally { label.textContent = "Download ZIP"; render(); }
};
