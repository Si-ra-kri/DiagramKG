# DiagramKG 🧠

> **Upload any diagram → Build a knowledge graph → Chat with it**

DiagramKG converts complex visual diagrams (engineering schematics, biology diagrams, flowcharts, network topologies, org charts, circuit diagrams) into structured **Neo4j knowledge graphs**, then lets you ask natural-language questions answered precisely from the graph — not from hallucinated image memory.

---

## ✨ Features

- **Vision AI extraction** — sends your diagram to a vision LLM, extracts every labeled entity and relationship as structured JSON
- **Neo4j knowledge graph** — stores nodes + edges so answers are grounded in real graph traversal, not guesswork
- **Fast chat Q&A** — questions answered using Groq's Llama 3.3 70B (< 2s) via graph RAG
- **Interactive force graph** — animated 2D graph visualization with fullscreen mode, zoom/pan, hover tooltips, color-coded entity types
- **Multi-diagram support** — upload many diagrams, switch between them, each has its own isolated graph
- **50/50 split UI** — diagram panel on left, chat panel on right, clean dark theme

---

## 🖥️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Python 3.10+, FastAPI, uvicorn |
| Graph DB | Neo4j 5 (Docker) |
| Vision LLM | OpenRouter free-tier models (Gemini, Llama, Nemotron) |
| Chat LLM | Groq — Llama 3.3 70B (free, ~200 tok/s) |
| Graph viz | react-force-graph-2d |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- Docker Desktop

### 1. Clone
```bash
git clone https://github.com/Si-ra-kri/DiagramKG.git
cd DiagramKG
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and fill in:
- `OPENROUTER_API_KEY` — free at [openrouter.ai](https://openrouter.ai) (no credit card)
- `GROQ_API_KEY` — free at [console.groq.com](https://console.groq.com/keys)

### 3. Start Neo4j
```bash
docker-compose up -d
```

### 4. Start backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Backend runs at **http://localhost:8000**

### 5. Start frontend
```bash
cd frontend
npm install
npm run dev
```
App runs at **http://localhost:5173**

---

## 🔑 Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Provider: openrouter (recommended for vision)
LLM_PROVIDER=openrouter

# Free vision model via OpenRouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free

# Groq for fast chat Q&A (free)
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

# Neo4j (matches docker-compose defaults)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=diagramkg
```

### Free vision models (OpenRouter `:free` tier)
| Model ID | Notes |
|----------|-------|
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | Omni model, good reasoning |
| `google/gemma-4-31b-it:free` | Strong, sometimes rate-limited |
| `google/gemma-4-26b-a4b-it:free` | MoE variant, fast |

---

## 📁 Project Structure

```
DiagramKG/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + routes
│   │   ├── config.py            # Settings + provider validation
│   │   ├── models/diagram.py    # Pydantic schemas
│   │   └── services/
│   │       ├── llm_client.py    # Multi-provider LLM abstraction
│   │       ├── extraction.py    # Vision → knowledge graph pipeline
│   │       ├── chat.py          # Graph RAG chat service
│   │       └── graph_store.py   # Neo4j read/write
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.tsx              # Root layout (50/50 split)
│       ├── components/
│       │   ├── DiagramPanel.tsx     # Left panel: upload + graph viz
│       │   ├── ChatPanel.tsx        # Right panel: chat interface
│       │   ├── GraphVisualization.tsx # Force graph + fullscreen mode
│       │   ├── DiagramList.tsx      # Past diagrams list
│       │   └── ...
│       └── api/client.ts        # Backend API calls
├── docker-compose.yml           # Neo4j container
├── .env.example                 # Environment template
└── README.md
```

---

## 🧩 Architecture

```
[Image Upload]
      │
      ▼
[Vision LLM]  ← OpenRouter free-tier (Nemotron / Gemma 4)
      │
      ▼ JSON (nodes + edges)
      │
[Neo4j Graph] ← stored per diagram_id
      │
      ▼
[User Question]
      │
      ▼
[Keyword match → 2-hop subgraph retrieval]
      │
      ▼
[Groq Llama 3.3 70B] ← fast text answer grounded in graph
      │
      ▼
[Chat answer + sources cited]
```

---

## 🛠️ Supported Diagram Types

- Hydroelectric / mechanical engineering schematics
- Internal combustion engine exploded views
- MCU / microcontroller flowcharts
- Biology cell diagrams
- Circuit schematics
- Network topology diagrams
- Org charts
- Software architecture diagrams
- Any dense labeled visual

---

## 📝 License

MIT
