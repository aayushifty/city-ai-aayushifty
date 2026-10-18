# City AI — how the app works

City AI is a 3D city where 15 AI citizens do real work on your computer with local Ollama models. You are the Governor: you walk around, talk to citizens, give them tasks and missions, and approve anything they want to do outside their own workspace. Everything the HUD shows comes from the backend; when it is offline, the HUD says so instead of inventing activity.

## Start

- **Desktop app:** double-click the **City AI** shortcut (created once with `powershell -ExecutionPolicy Bypass -File desktop\install_shortcuts.ps1`). It starts the backend and opens the app in its own window.
- **Browser:** run `python run.py` in `backend/`, then open http://127.0.0.1:8000.
- Ollama must be running with at least one model (the citizens use `qwen3:4b-instruct`, `gemma3:4b` and `qwen2.5-coder:7b`).

## Controls

| Key | Action |
|---|---|
| Click the city | Look around with the mouse (Esc frees the mouse) |
| W A S D, Shift | Walk, run |
| Mouse wheel | Zoom the third-person camera |
| V | First / third person |
| E | Talk to the citizen next to you |
| T | Assign a task |
| F | Work order: the citizen's standard role task |
| Q | Inspect a citizen (status, task, model) |
| M | Mission board (publish missions) |
| P | Phone (contacts, missions, tasks, alerts, approvals, map, camera, settings, guide) |
| N | City map |
| G | Private jet |
| H | Hide / show the HUD |

The key hints on the left of the screen are clickable too.

## Talking to citizens

Walk up to a citizen (the card at the bottom shows who) and press **E**. Ask anything; replies come from the citizen's own model and are kept short. Chat goes ahead of queued background work, but a reply can still wait for the generation that is already running on the GPU.

**Change a citizen's model:** in the talk window, use the model picker next to their name.

## Tasks

Press **T** next to a citizen (or use the Assign tab in the talk window). Give a title, a description and the expected deliverable. The citizen:

1. writes the files in its own workspace (`backend/data/workspaces/...`),
2. verifies them for real: Python compiles, pytest runs when there are tests, HTML and JSON are checked,
3. repairs failures, up to 3 attempts, using the real error output,
4. reports **VERIFIED** or **FAILED** honestly.

Websites and 3D presentations get a link (`http://127.0.0.1:8000/deliverables/...`). Ask for a "3D website" and the hero gets a real Three.js scene.

### Request changes (revisions)

On any finished task, open **Phone → Tasks → Request changes** (or the button on its notification), or tell the citizen *"revise that: …"*. The same citizen edits its previous work in the same workspace, the result is verified again (with repairs), and it is saved as **v2, v3 …**. Every version keeps its own link.

## Missions and the mission channel

Press **M**, describe the mission and publish. The backend answers at once and the coordinator plans it in the background:

- the mission is split into steps assigned to suitable citizens; independent steps run in parallel, dependent ones wait; a step whose prerequisite failed is **BLOCKED**;
- when the mission asks for a website or presentation, the other steps only research and write content, and one final **assembly** step builds a single deliverable from everyone's work (it still runs if one contributor failed);
- the mission ends **COMPLETED**, **PARTIAL** or **FAILED**.

Every mission has a **channel**, one shared thread: open it from the objective card (top left), the mission tracker, the phone's Missions app or the mission board.

- Your briefing, the plan, each citizen's start / done / failed posts with links, and a final **mission report** all appear there live.
- **Write once to everyone:** your message reaches every citizen on the mission. Steps that have not started yet follow it; the channel tells you honestly which steps were already running.
- **@Name** asks one citizen directly; otherwise the coordinator answers for the team.
- After the mission, write **"revise: …"** in the channel to get a new, re-verified version of the deliverable.

## Approvals and safety

Citizens work freely inside their own workspace. Anything outside it (running a host command, opening an app, writing a file elsewhere) waits for you: an approval card appears at the top of the screen and in **Phone → Approvals**. Nothing happens until you click **Approve**; unanswered requests are denied after 10 minutes. There is no "always allow". **GLOBAL STOP** in the top bar halts the system.

## Links and history

- **Phone → Tasks** lists every task (chat deliverables, assigned tasks, mission steps, revisions) with live progress, verification results, repair attempts and deliverable links.
- Notifications pop up when a task is verified or fails, a host action needs approval, a mission finishes, or a citizen replies in a mission channel.

## Graphics and performance

**Phone → Settings:** graphics quality (High adds ambient occlusion, Medium is the default, Low is fastest), time of day (live clock, day, golden hour, night), and which HUD panels and the FPS counter to show. The desktop app runs on the dedicated GPU.

## The other tabs

The top bar also has the original FORGE views: Dashboard, Workspace & DAG, Agent Monitor, Timeline, Verification Center, Project Memory, Approvals and Model Router.
