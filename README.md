# FORGE AI & city_ai_aayushifty — Autonomous 3D AI Metropolis & Software Engineering Factory

**city_ai_aayushifty** is an autonomous, local-first 3D AI metropolis powered by **FORGE AI**. Specialized AI citizen personas live, communicate in natural human dialogue, collaborate across municipal DAG workflows, and build verified software and interactive 3D presentations with a **100% work completion guarantee**.

---

## 🌟 Key Features

- **🌆 Autonomous 3D Metropolis**:
  - Explorable 3D city built with Three.js & React with first-person navigation (`WASD`), orbital camera, daytime/nighttime lighting, and ambient particle effects.
  - 10 specialized citizen humanoid avatars with articulated limb animations, designated workplaces, and district landmarks.
- **🗣️ Natural Human Language Comms**:
  - Direct 2-way communication addressing you as the **Supreme Governor**.
  - Local GPU-accelerated inference via Ollama (`llama3.2:latest`) with automatic model residency to eliminate VRAM swapping stalls.
- **🪐 100% Work Guarantee & 3D Deliverables**:
  - Autonomous synthesis of interactive 3D presentations (Three.js), responsive web apps, and domain code.
  - Sandboxed workspace isolation with Git version tracking and automated verification evidence gates.
- **⚡ Full Multi-Agent Coordination**:
  - Citizen workforce: Kernel Diagnostics, Citadel Spire Orchestration, Product Vision Lab, Architecture Systems, Implementation, Test Engineering, Security Auditing, Site Reliability, Infrastructure Engineering, and Municipal Healthcare.
- **🛑 Safety & Governance**:
  - Global Emergency Stop, strict state machine transitions, bounded repair loops, and token budgeting.

---

## 🏗️ Architecture Overview

```
city_ai_aayushifty / FORGE AI
├── backend/                  # FastAPI REST & WebSocket server, SQLite persistence, Agent Engine
│   ├── app/agents/           # Multi-agent orchestrator, state machine, verifier & repair loops
│   ├── app/execution/        # Agent service, computer automation, and workspace isolation
│   ├── app/providers/        # Local Ollama adapter and deterministic test providers
│   └── tests/                # 33-test automated test suite (100% pass rate)
├── frontend/                 # 3D Metropolis & Engineering Command Center (React + Vite + Three.js + TS)
│   ├── src/components/city3d # 3D city scene, HUD, camera controls, workplace architect
│   └── src/simulation/       # City lifecycle engine, telemetry, and traffic closed-loop reduction
├── city_ai_aayushifty.bat   # One-click launcher for Windows (auto-detects Ollama, GPU, Python, Node)
└── docs/                     # Architecture RFCs and evaluation benchmarks
```

---

## 🚀 Quick Start

### Option 1: One-Click Windows Launcher (Recommended)
Double-click `city_ai_aayushifty.bat` in the root folder, or run:
```cmd
city_ai_aayushifty.bat
```
This automatically initializes the Ollama daemon, verifies the Python backend, launches Vite frontend dev server, and opens the 3D Metropolis in your default browser.

### Option 2: Manual Start

#### 1. Backend
```bash
cd backend
python run.py
```

#### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) to enter the 3D Metropolis.

---

## 🧪 Testing

Run the full verification test suite:
```bash
cd backend
python -m pytest tests -v
```
*(33/33 tests passing with 100% verified status)*
