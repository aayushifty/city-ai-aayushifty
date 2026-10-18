"""HTML template for citizen-built websites.

The copy (headline, sections, features, metrics) is written by the citizen's model; this module only lays it
out. With three_d=True the hero gets a real Three.js scene (one of a few themes the model picks to suit the
topic). Nothing on the page pretends to work when it doesn't: there are no fake counters or forms.
"""

import html
import json
from datetime import datetime
from typing import Any, Dict

SCENES = ("city", "globe", "orbit", "crystal", "waves", "galaxy")


def render_website(c: Dict[str, Any], citizen_name: str, citizen_profession: str, three_d: bool) -> str:
    e = html.escape
    brand = e(c["brand"])
    accent = c.get("accent") or "#38bdf8"
    metrics = c["metrics"] if len(c["metrics"]) >= 2 else []      # a strip with one number looks broken
    nav = ['<a href="#features">Features</a>'] + (['<a href="#more">Details</a>'] if c["sections"] else []) + \
          (['<a href="#about">About</a>'] if c["about"] else [])

    metrics_html = ""
    if metrics:
        items = "\n".join(f'<div class="metric"><div class="mv">{e(m["value"])}</div><div class="ml">{e(m["label"])}</div></div>'
                          for m in metrics)
        metrics_html = f'<section class="metrics">\n{items}\n</section>'
    cards = "\n".join(
        f'<article class="card"><div class="icon">{e(f["icon"])}</div><h3>{e(f["title"])}</h3><p>{e(f["text"])}</p></article>'
        for f in c["features"])
    sections = "\n".join(
        f'<div class="block{" alt" if i % 2 else ""}"><h3>{e(s["title"])}</h3><p>{e(s["text"])}</p></div>'
        for i, s in enumerate(c["sections"]))
    more_html = f'<section class="section" id="more"><h2>{e(c["sections_title"])}</h2>\n{sections}\n</section>' if c["sections"] else ""
    about_html = f'<section class="section about" id="about"><h2>About</h2><p>{e(c["about"])}</p></section>' if c["about"] else ""
    cta = e(c.get("cta") or "Explore")

    scene_js = _scene_script(c.get("scene") or "globe", accent) if three_d else ""
    hero_class = "hero hero3d" if three_d else "hero"
    canvas = ('<canvas id="scene" aria-label="Interactive 3D scene"></canvas>'
              '<div id="no3d" class="no3d" hidden>3D view unavailable (WebGL or the Three.js download is blocked).</div>') if three_d else ""
    built = datetime.now().strftime("%d %b %Y")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{brand}</title>
<style>
:root {{ --accent: {accent}; --bg: #070b14; --surface: #0f172a; --line: rgba(255,255,255,.09); --text: #f1f5f9; --muted: #94a3b8; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html {{ scroll-behavior: smooth; }}
body {{ background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; line-height: 1.6; }}
header {{ position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px clamp(16px, 5vw, 64px); background: rgba(7,11,20,.78); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }}
.logo {{ font-weight: 800; letter-spacing: .02em; }}
.logo span {{ color: var(--accent); }}
nav {{ display: flex; gap: 20px; flex-wrap: wrap; }}
nav a {{ color: var(--muted); text-decoration: none; font-size: 14px; }}
nav a:hover {{ color: var(--text); }}
.hero {{ position: relative; min-height: 64vh; display: flex; flex-direction: column; justify-content: center;
  padding: 72px clamp(16px, 6vw, 96px); overflow: hidden; }}
.hero3d {{ min-height: 88vh; }}
.hero canvas {{ position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; }}
.hero .copy {{ position: relative; z-index: 1; max-width: 640px; }}
.hero h1 {{ font-size: clamp(34px, 6vw, 64px); line-height: 1.08; margin-bottom: 18px; text-shadow: 0 4px 30px rgba(0,0,0,.6); }}
.hero p {{ font-size: clamp(16px, 2vw, 20px); color: #cbd5e1; margin-bottom: 28px; text-shadow: 0 2px 12px rgba(0,0,0,.7); }}
.btn {{ display: inline-block; padding: 12px 22px; border-radius: 10px; background: var(--accent); color: #04121f; font-weight: 700;
  text-decoration: none; }}
.no3d {{ position: relative; z-index: 1; margin-top: 18px; font-size: 13px; color: var(--muted); }}
.metrics {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1px; background: var(--line);
  border-block: 1px solid var(--line); }}
.metric {{ background: var(--surface); padding: 26px 20px; text-align: center; }}
.mv {{ font-size: 30px; font-weight: 800; color: var(--accent); }}
.ml {{ font-size: 13px; color: var(--muted); }}
.section {{ padding: 72px clamp(16px, 6vw, 96px); }}
.section h2 {{ font-size: clamp(26px, 4vw, 38px); margin-bottom: 26px; }}
.cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }}
.card {{ background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 24px; }}
.card .icon {{ font-size: 28px; margin-bottom: 10px; }}
.card h3 {{ margin-bottom: 6px; }}
.card p, .block p, .about p {{ color: var(--muted); }}
.block {{ max-width: 860px; padding: 22px 0; border-top: 1px solid var(--line); }}
.block h3 {{ margin-bottom: 6px; color: var(--text); }}
.about p {{ max-width: 780px; font-size: 18px; }}
footer {{ padding: 32px clamp(16px, 6vw, 96px); border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }}
@media (prefers-reduced-motion: reduce) {{ html {{ scroll-behavior: auto; }} }}
</style>
</head>
<body>
<header><div class="logo">{brand.split(" ")[0]}<span>.</span> {" ".join(brand.split(" ")[1:])}</div><nav>{"".join(nav)}</nav></header>
<main>
<section class="{hero_class}">
{canvas}
<div class="copy">
<h1>{e(c["headline"])}</h1>
<p>{e(c["subheadline"])}</p>
<a class="btn" href="#features">{cta}</a>
</div>
</section>
{metrics_html}
<section class="section" id="features"><h2>{e(c["features_title"])}</h2>
<div class="cards">
{cards}
</div>
</section>
{more_html}
{about_html}
</main>
<footer>Built by {e(citizen_name)} ({e(citizen_profession)}) in city_ai_aayushifty · {built}</footer>
{scene_js}
</body>
</html>
"""


def _scene_script(scene: str, accent: str) -> str:
    scene = scene if scene in SCENES else "globe"
    return ('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n'
            "<script>\n" + _SCENE_JS.replace("__SCENE__", json.dumps(scene)).replace("__ACCENT__", json.dumps(accent))
            + "\n</script>")


# Plain JS (not an f-string): one small Three.js scene per theme, slow camera drift + mouse parallax.
_SCENE_JS = r"""
(function () {
  var canvas = document.getElementById('scene');
  if (!window.THREE || !canvas) { var n = document.getElementById('no3d'); if (n) n.hidden = false; return; }
  var SCENE = __SCENE__, ACCENT = new THREE.Color(__ACCENT__);
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
  catch (err) { document.getElementById('no3d').hidden = false; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070b14, 0.035);
  var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.position.set(0, 4, 16);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  var key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(6, 10, 8); scene.add(key);
  var glow = new THREE.PointLight(ACCENT.getHex(), 2.2, 60); glow.position.set(-6, 5, 6); scene.add(glow);
  var root = new THREE.Group(); scene.add(root);
  var accentMat = new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.4 });
  var darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.3 });
  var animate = [];
  function rnd(a, b) { return a + Math.random() * (b - a); }

  if (SCENE === 'city') {
    for (var x = -7; x <= 7; x++) for (var z = -7; z <= 7; z++) {
      if (Math.abs(x) < 1 && Math.abs(z) < 1) continue;
      var h = rnd(0.5, 1) * (9 - Math.hypot(x, z) * 0.6); if (h < 0.4) h = 0.4;
      var b = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), Math.random() < 0.12 ? accentMat : darkMat);
      b.position.set(x * 1.2, h / 2, z * 1.2); root.add(b);
    }
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x0b1220 }));
    ground.rotation.x = -Math.PI / 2; root.add(ground);
    camera.position.set(0, 9, 18);
  } else if (SCENE === 'orbit') {
    var planet = new THREE.Mesh(new THREE.SphereGeometry(2.4, 48, 32), accentMat); root.add(planet);
    for (var r = 0; r < 3; r++) {
      var ring = new THREE.Mesh(new THREE.TorusGeometry(3.6 + r * 1.1, 0.03, 8, 120), new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.5 - r * 0.12 }));
      ring.rotation.x = Math.PI / 2 + r * 0.25; root.add(ring);
      var moon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), darkMat); root.add(moon);
      (function (m, rad, sp) { animate.push(function (t) { m.position.set(Math.cos(t * sp) * rad, Math.sin(t * sp * 0.6) * 0.6, Math.sin(t * sp) * rad); }); })(moon, 3.6 + r * 1.1, 0.5 - r * 0.12);
    }
  } else if (SCENE === 'crystal') {
    var core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), accentMat); root.add(core);
    var shell = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), new THREE.MeshBasicMaterial({ color: ACCENT, wireframe: true, transparent: true, opacity: 0.35 }));
    root.add(shell);
    for (var i = 0; i < 18; i++) {
      var s = new THREE.Mesh(new THREE.OctahedronGeometry(rnd(0.15, 0.4)), darkMat);
      s.position.setFromSphericalCoords(rnd(4.5, 7), rnd(0, Math.PI), rnd(0, Math.PI * 2)); root.add(s);
    }
    animate.push(function (t) { core.rotation.y = t * 0.3; shell.rotation.y = -t * 0.15; });
  } else if (SCENE === 'waves') {
    var geo = new THREE.PlaneGeometry(40, 40, 80, 80);
    var mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: ACCENT, wireframe: true, transparent: true, opacity: 0.55 }));
    mesh.rotation.x = -Math.PI / 2.3; root.add(mesh);
    var pos = geo.attributes.position, base = pos.array.slice();
    animate.push(function (t) {
      for (var k = 0; k < pos.count; k++) {
        var px = base[k * 3], py = base[k * 3 + 1];
        pos.array[k * 3 + 2] = Math.sin(px * 0.35 + t) * 0.7 + Math.cos(py * 0.3 + t * 0.8) * 0.7;
      }
      pos.needsUpdate = true;
    });
  } else if (SCENE === 'galaxy') {
    var n = 6000, g = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (var j = 0; j < n; j++) {
      var arm = j % 3, rr = Math.pow(Math.random(), 0.7) * 9, ang = rr * 0.9 + arm * 2.094 + rnd(-0.3, 0.3);
      arr[j * 3] = Math.cos(ang) * rr; arr[j * 3 + 1] = rnd(-0.4, 0.4) * (1 - rr / 10); arr[j * 3 + 2] = Math.sin(ang) * rr;
      var c = ACCENT.clone().lerp(new THREE.Color(0xffffff), 1 - rr / 9); col[j * 3] = c.r; col[j * 3 + 1] = c.g; col[j * 3 + 2] = c.b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    root.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, vertexColors: true })));
    camera.position.set(0, 7, 14);
  } else {  // globe
    var globe = new THREE.Mesh(new THREE.SphereGeometry(3, 48, 32), new THREE.MeshStandardMaterial({ color: 0x0f1d33, roughness: 0.7 }));
    root.add(globe);
    var pts = new THREE.BufferGeometry(), parr = new Float32Array(1600 * 3);
    for (var q = 0; q < 1600; q++) { var v = new THREE.Vector3().setFromSphericalCoords(3.03, Math.acos(rnd(-1, 1)), rnd(0, Math.PI * 2)); parr.set([v.x, v.y, v.z], q * 3); }
    pts.setAttribute('position', new THREE.BufferAttribute(parr, 3));
    root.add(new THREE.Points(pts, new THREE.PointsMaterial({ color: ACCENT, size: 0.05 })));
    var halo = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.02, 8, 160), new THREE.MeshBasicMaterial({ color: ACCENT }));
    halo.rotation.x = Math.PI / 2.6; root.add(halo);
  }

  // background stars for depth
  var sg = new THREE.BufferGeometry(), sa = new Float32Array(900 * 3);
  for (var w = 0; w < sa.length; w++) sa[w] = rnd(-120, 120);
  sg.setAttribute('position', new THREE.BufferAttribute(sa, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x64748b, size: 0.25 })));

  var mx = 0, my = 0;
  window.addEventListener('pointermove', function (ev) { mx = ev.clientX / window.innerWidth - 0.5; my = ev.clientY / window.innerHeight - 0.5; });
  function resize() {
    var w2 = canvas.clientWidth, h2 = canvas.clientHeight;
    renderer.setSize(w2, h2, false); camera.aspect = w2 / Math.max(h2, 1); camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clock = new THREE.Clock(), look = new THREE.Vector3(0, SCENE === 'city' ? 2 : 0, 0);
  (function loop() {
    var t = still ? 0 : clock.getElapsedTime();
    root.rotation.y = t * 0.08 + mx * 0.6;
    root.rotation.x = my * 0.15;
    for (var a = 0; a < animate.length; a++) animate[a](t);
    camera.lookAt(look);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();
})();
"""
