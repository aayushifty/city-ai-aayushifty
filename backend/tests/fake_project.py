"""A scripted model that speaks the project builder's protocol (requirements, plan, files, review), so the
whole pipeline can be tested without a real model. It writes a small but genuine 3D site: three distinct
Three.js object modules, a scene, two pages and a stylesheet, each tagged with its requirement ids."""

import json
import re
from types import SimpleNamespace

REQS = [
    {"id": "R1", "kind": "3d_object", "name": "rocket", "text": "A rocket with a body, nose cone and fins"},
    {"id": "R2", "kind": "3d_object", "name": "launch_tower", "text": "A lattice launch tower next to the rocket"},
    {"id": "R3", "kind": "3d_object", "name": "planet", "text": "A planet with rings in the background"},
    {"id": "R4", "kind": "3d_scene", "name": "scene", "text": "Orbit-controlled scene with lights and animation"},
    {"id": "R5", "kind": "page", "name": "home", "text": "Home page with the 3D hero and launch schedule"},
    {"id": "R6", "kind": "section", "name": "tours", "text": "A tours section that says tours run daily"},
    {"id": "R7", "kind": "page", "name": "about", "text": "An about page"},
]
PLAN = {"files": [
    {"path": "index.html", "purpose": "Home page", "requirements": ["R5", "R6"]},
    {"path": "about.html", "purpose": "About page", "requirements": ["R7"]},
    {"path": "css/styles.css", "purpose": "Styles", "requirements": []},
    {"path": "js/main.js", "purpose": "Scene", "requirements": ["R4"]},
    {"path": "js/objects/rocket.js", "purpose": "Rocket", "requirements": ["R1"]},
    {"path": "js/objects/launch_tower.js", "purpose": "Tower", "requirements": ["R2"]},
    {"path": "js/objects/planet.js", "purpose": "Planet", "requirements": ["R3"]},
]}
IMPORT_MAP = '<script type="importmap">{"imports": {"three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>'

FILES = {
    "index.html": f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Lumen Space Port</title>
<link rel="stylesheet" href="css/styles.css">{IMPORT_MAP}</head>
<body><nav><a href="index.html">Home</a> <a href="about.html">About</a></nav>
<main data-req="R5"><h1>{{HEADLINE}}</h1><canvas id="scene"></canvas>
<section id="tours" data-req="R6"><h2>Tours</h2><p>Guided tours run daily at 10:00 and 15:00.</p></section></main>
<script type="module" src="js/main.js"></script></body></html>
""",
    "about.html": """<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>About</title><link rel="stylesheet" href="css/styles.css"></head>
<body><nav><a href="index.html">Home</a> <a href="about.html">About</a></nav>
<main data-req="R7"><h1>About the port</h1><p>A civic space port for visitors and crews.</p></main></body></html>
""",
    "css/styles.css": """/* REQ:R8 */
:root { --accent: #f59e0b; }
body { margin: 0; font-family: system-ui; }
@media (max-width: 700px) { nav { display: flex; flex-direction: column; } }
""",
    "js/main.js": """import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRocket } from './objects/rocket.js';
import { createLaunchTower } from './objects/launch_tower.js';
import { createPlanet } from './objects/planet.js';
// REQ:R4
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 500);
camera.position.set(0, 6, 18);
const controls = new OrbitControls(camera, canvas);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
const rocket = createRocket(); rocket.position.set(-2, 0, 0); scene.add(rocket);
const tower = createLaunchTower(); tower.position.set(1.5, 0, 0); scene.add(tower);
const planet = createPlanet(); planet.position.set(8, 6, -20); scene.add(planet);
renderer.setAnimationLoop((t) => { planet.rotation.y = t / 4000; controls.update(); renderer.render(scene, camera); });
""",
    "js/objects/rocket.js": """import * as THREE from 'three';
// REQ:R1
export function createRocket() {
  const group = new THREE.Group();
  group.name = 'rocket';
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4, 24), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  body.position.y = 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0xff3b30 }));
  nose.position.y = 4.6;
  group.add(body, nose);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    fin.position.set(Math.cos(i * 2.09) * 0.55, 0.4, Math.sin(i * 2.09) * 0.55);
    fin.rotation.y = -i * 2.09;
    group.add(fin);
  }
  return group;
}
""",
    "js/objects/launch_tower.js": """import * as THREE from 'three';
// REQ:R2
export function createLaunchTower() {
  const tower = new THREE.Group();
  tower.name = 'launch_tower';
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.7 });
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7, 0.12), steel);
    leg.position.set(x, 3.5, z);
    tower.add(leg);
  }
  for (let y = 0.5; y < 7; y += 1) {
    const brace = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.04, 6, 4), steel);
    brace.rotation.x = Math.PI / 2;
    brace.position.y = y;
    tower.add(brace);
  }
  return tower;
}
""",
    "js/objects/planet.js": """import * as THREE from 'three';
// REQ:R3
export function createPlanet() {
  const planet = new THREE.Group();
  planet.name = 'planet';
  planet.add(new THREE.Mesh(new THREE.SphereGeometry(3, 48, 32), new THREE.MeshStandardMaterial({ color: 0x3b82f6 })));
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.8, 5.2, 64), new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2.4;
  planet.add(ring);
  return planet;
}
""",
}


class FakeProjectModel:
    """Stands in for the model router. Options:
    broken: set of paths whose FIRST draft is broken (syntax error / missing tag) so repair must fix them;
    review_issues: issues the reviewer reports once; headline: text for the home page <h1>."""

    def __init__(self, broken=(), review_issues=None, headline="Gateway to orbit", plan=None, reply="Understood.",
                 extra_req=None):
        self.broken = set(broken)
        self.review_issues = list(review_issues or [])
        self.headline = headline
        self.plan = plan or {"summary": "s", "subtasks": [
            {"id": "1", "title": "Research the space port", "assigned_agent_id": "agent-researcher", "expected_deliverable": "research.md", "dependencies": []}]}
        self.reply = reply
        self.extra_req = extra_req
        self.calls = []
        self.writes = {}

    def _write(self, path, repair):
        n = self.writes.get(path, 0)
        self.writes[path] = n + 1
        body = FILES[path].replace("{HEADLINE}", self.headline)
        if path in self.broken and not repair:
            body = body.replace("export function", "export functio n") if path.endswith(".js") else body.replace('data-req="R5"', "")
        return f"```\n{body}```"

    async def __call__(self, request, preferred_provider=None, interactive=False, **kwargs):
        p = request.prompt
        self.calls.append((p, interactive, request.json_mode))
        if "Decompose this mission" in p:
            out = json.dumps(self.plan)
        elif "requirements checklist" in p:
            if "CHANGES REQUESTED" in p:
                out = json.dumps({"requirements": [self.extra_req or {"kind": "content", "name": "new_headline", "text": "Headline says: " + self.headline}]})
            else:
                out = json.dumps({"project_name": "Lumen Space Port", "summary": "A 3D site for a space port.",
                                  "requirements": REQS})
        elif "Plan the file structure" in p:
            out = json.dumps(PLAN)
        elif "Which ONE file should implement" in p:
            out = json.dumps({"path": "index.html"})
        elif "WRITE THIS FILE:" in p:
            path = re.search(r"WRITE THIS FILE: (\S+)", p).group(1)
            out = self._write(path, "REPAIR ROUND" in p) if path in FILES else "```\n/* empty */\n```"
            if path == "index.html" and "R9 [" in p:      # a requirement added by a revision
                out = out.replace("<h1>", '<h1 data-req="R9">')
        elif "reviewing a teammate's web project" in p:
            issues, self.review_issues = self.review_issues, []
            out = json.dumps({"approved": not issues, "summary": "checked", "issues": issues})
        else:
            out = self.reply
        return SimpleNamespace(content=out, model_name="fake-model", provider_name="test")
