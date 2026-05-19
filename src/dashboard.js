// Live dashboard + attack console. On-brand with monteirotf.com so it
// slots straight into the portfolio as a real, inspectable case study.

export function renderDashboard(host) {
  const base = "https://" + host;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sentinel — edge bot-firewall</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
<style>
  :root{ --cyber:#0066FF; --ice:#9FD0FF; --ink:#03060E; --deep:#070B1A; }
  *{ box-sizing:border-box; margin:0; padding:0 }
  body{ background:var(--ink); color:#DCE7FF; font-family:'Space Grotesk',sans-serif; line-height:1.55;
        background-image:linear-gradient(rgba(122,174,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(122,174,255,.04) 1px,transparent 1px);
        background-size:64px 64px; min-height:100vh }
  .wrap{ max-width:1080px; margin:0 auto; padding:56px 24px 80px }
  .eyebrow{ font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:.32em; text-transform:uppercase; color:var(--cyber) }
  h1{ font-family:'Orbitron',sans-serif; font-weight:900; font-size:clamp(2rem,6vw,3.6rem); line-height:1.05; margin:14px 0 18px;
      background:linear-gradient(110deg,#fff,#7AAEFF,#0066FF,#fff); -webkit-background-clip:text; background-clip:text; color:transparent }
  .sub{ color:#9FB2D8; max-width:60ch }
  .grid{ display:grid; gap:16px; margin-top:34px }
  @media(min-width:760px){ .cols-4{ grid-template-columns:repeat(4,1fr) } .cols-2{ grid-template-columns:1fr 1fr } }
  .card{ background:linear-gradient(135deg,rgba(15,28,60,.5),rgba(7,11,26,.35)); border:1px solid rgba(122,174,255,.14);
         border-radius:18px; padding:20px; backdrop-filter:blur(10px) }
  .stat .k{ font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:.25em; color:var(--cyber); text-transform:uppercase }
  .stat .v{ font-family:'Orbitron',sans-serif; font-size:2rem; margin-top:8px }
  .v.block{ color:#ff6b6b } .v.allow{ color:#46e0a8 } .v.chal{ color:#ffc94d } .v.rl{ color:#ff9d5c }
  h2{ font-family:'Orbitron',sans-serif; font-size:1.05rem; letter-spacing:.04em; margin-bottom:6px }
  .muted{ color:#7e90b5; font-size:13px }
  code,pre{ font-family:'JetBrains Mono',monospace }
  pre{ background:#04081A; border:1px solid rgba(122,174,255,.14); border-radius:12px; padding:14px 16px; overflow-x:auto;
       font-size:12.5px; color:#bcd2ff; position:relative }
  .copy{ position:absolute; top:8px; right:8px; font-size:10px; letter-spacing:.15em; text-transform:uppercase;
         background:rgba(0,102,255,.15); color:var(--ice); border:1px solid rgba(0,102,255,.4);
         border-radius:999px; padding:5px 10px; cursor:pointer }
  button.act{ font-family:'JetBrains Mono',monospace; font-size:12px; letter-spacing:.18em; text-transform:uppercase;
              background:var(--cyber); color:var(--ink); border:0; border-radius:999px; padding:12px 22px;
              font-weight:600; cursor:pointer }
  button.act:hover{ background:#fff }
  table{ width:100%; border-collapse:collapse; font-size:12.5px }
  th,td{ text-align:left; padding:8px 10px; border-bottom:1px solid rgba(122,174,255,.08); white-space:nowrap }
  th{ font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:#6f83ab }
  td.tag{ font-family:'JetBrains Mono',monospace; font-weight:600 }
  .B{ color:#ff6b6b } .A{ color:#46e0a8 } .C{ color:#ffc94d } .R{ color:#ff9d5c }
  .pill{ display:inline-block; font-family:'JetBrains Mono',monospace; font-size:11px; padding:3px 10px;
         border:1px solid rgba(0,102,255,.35); border-radius:999px; color:var(--ice); margin:4px 6px 0 0 }
  .dot{ display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--cyber); margin-right:7px;
        box-shadow:0 0 10px var(--cyber); animation:p 1.6s ease-in-out infinite }
  @keyframes p{ 50%{ opacity:.35 } }
  footer{ margin-top:46px; font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:.2em;
          color:#5f739b; text-transform:uppercase }
  a{ color:var(--ice) }
</style>
</head>
<body>
<div class="wrap">

  <div class="eyebrow"><span class="dot"></span>Sentinel · live</div>
  <h1>The firewall<br>at the edge.</h1>
  <p class="sub">Every request below was scored in a Cloudflare Worker — no paid Bot Management,
  just header / TLS / network heuristics. Suspicious clients also get a tighter rate-limit budget.
  Try to get past it; the dashboard is real and updates as you do.</p>

  <div class="grid cols-4">
    <div class="card stat"><div class="k">Checked</div><div class="v" id="s-total">—</div></div>
    <div class="card stat"><div class="k">Allowed</div><div class="v allow" id="s-allow">—</div></div>
    <div class="card stat"><div class="k">Challenged</div><div class="v chal" id="s-chal">—</div></div>
    <div class="card stat"><div class="k">Blocked</div><div class="v block" id="s-block">—</div></div>
  </div>

  <div class="grid cols-2">
    <div class="card">
      <h2>Test it from this browser</h2>
      <p class="muted">A real fetch with your real browser headers. It should pass.</p>
      <p style="margin:16px 0"><button class="act" onclick="testReq()">Send request →</button></p>
      <pre id="result" style="display:none"></pre>
    </div>
    <div class="card">
      <h2>Try to beat it (curl)</h2>
      <p class="muted">Browsers can't forge <code>User-Agent</code> — that's the point.
      Run these and watch the table below light up.</p>
      <pre>BLOCK<button class="copy" data-c="curl ${base}/api/check">copy</button>
curl ${base}/api/check</pre>
      <pre>CHALLENGE (spoofed, incomplete browser UA)<button class="copy" data-c='curl -A &quot;Mozilla/5.0 (Windows NT 10.0) Chrome/120.0&quot; ${base}/api/check'>copy</button>
curl -A "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0" \\
     ${base}/api/check</pre>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Top reasons traffic was flagged</h2>
      <div id="reasons" class="muted">collecting…</div>
    </div>
    <div class="card">
      <h2>Recent decisions <span class="muted">· live</span></h2>
      <div style="overflow-x:auto">
      <table><thead><tr><th>Time</th><th>Verdict</th><th>Score</th><th>Country</th><th>UA</th><th>Top signal</th></tr></thead>
      <tbody id="events"><tr><td colspan="6" class="muted">no traffic yet — be the first</td></tr></tbody></table>
      </div>
    </div>
  </div>

  <footer>Sentinel v0.1 · open source · built by S. Monteiro · <a href="https://monteirotf.com">monteirotf.com</a></footer>
</div>

<script>
  const cls = { ALLOW:'A', BLOCK:'B', CHALLENGE:'C', RATE_LIMITED:'R' };
  document.querySelectorAll('.copy').forEach(b=>{
    b.onclick=()=>{ navigator.clipboard.writeText(b.dataset.c); b.textContent='copied'; setTimeout(()=>b.textContent='copy',1200); };
  });
  async function testReq(){
    const r=document.getElementById('result'); r.style.display='block'; r.textContent='…';
    try{ const res=await fetch('/api/check',{cache:'no-store'}); const j=await res.json();
      r.textContent='HTTP '+res.status+'  →  '+j.verdict+'  (score '+j.score+')\\n'+
        (j.reasons.length? j.reasons.map(x=>'  +'+x.points+'  '+x.reason).join('\\n') : '  no negative signals'); }
    catch(e){ r.textContent='error: '+e; }
  }
  async function refresh(){
    try{
      const j=await (await fetch('/api/stats',{cache:'no-store'})).json(); const t=j.totals;
      s_total.textContent=t.total; s_allow.textContent=t.ALLOW||0;
      s_chal.textContent=t.CHALLENGE||0; s_block.textContent=(t.BLOCK||0)+(t.RATE_LIMITED||0);
      reasons.innerHTML = j.topReasons.length
        ? j.topReasons.map(x=>'<span class="pill">'+x.reason+' · '+x.n+'</span>').join('')
        : 'collecting…';
      events.innerHTML = j.events.length ? j.events.map(e=>{
        const d=new Date(e.t).toISOString().substr(11,8);
        return '<tr><td>'+d+'</td><td class="tag '+cls[e.verdict]+'">'+e.verdict+
          '</td><td>'+e.score+'</td><td>'+e.country+'</td><td>'+esc(e.ua)+
          '</td><td class="muted">'+esc(e.top)+'</td></tr>';
      }).join('') : '<tr><td colspan="6" class="muted">no traffic yet — be the first</td></tr>';
    }catch(e){}
  }
  function esc(s){ return String(s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }
  refresh(); setInterval(refresh, 2000);
</script>
</body>
</html>`;
}
