# Coding Conventions

**Analysis Date:** 2025-07-14

---

## Overview

This is a full-stack project with a **Python/FastAPI backend** and a **TypeScript/React frontend**. Each has its own toolchain and conventions. Both live under their respective `backend/` and `frontend/` directories.

---

## FRONTEND (TypeScript / React)

### Formatting — Prettier

Config: `frontend/.prettierrc`

| Setting | Value |
|---|---|
| Semicolons | `false` (no semicolons) |
| Quotes | Single quotes |
| Trailing commas | `"all"` |
| Print width | 80 |
| Tab width | 2 spaces |

**Example:**
```tsx
const handleSend = async () => {
  if (!input.trim()) return
  setMessages((prev) => [...prev, userMessage])
}
```

### Linting — ESLint

Config: `frontend/eslint.config.js` (flat config format)

- `@eslint/js` recommended
- `typescript-eslint` recommended
- `eslint-plugin-react-hooks` (hooks rules enforced)
- `eslint-plugin-react-refresh` (Vite React refresh compat)
- Targets: `**/*.{ts,tsx}` only
- Ignored: `dist/`

Run: `npm run lint` (from `frontend/`)

### TypeScript Strictness

Config: `frontend/tsconfig.app.json`

- `"noUnusedLocals": true` — unused variables are errors
- `"noUnusedParameters": true` — unused function params are errors
- `"noFallthroughCasesInSwitch": true`
- `"erasableSyntaxOnly": true`
- Target: `ES2023`, module: `esnext`, moduleResolution: `bundler`
- JSX: `react-jsx` (no need to import React for JSX)

### Naming Conventions (Frontend)

**Files:**
- Components: PascalCase matching the export name — `ChatBox.tsx`, `CostTable.tsx`, `MermaidViewer.tsx`
- Pages: PascalCase — `KnowledgeBase.tsx`
- Styles: lowercase — `mermaid.css`, `index.css`

**Directories:**
- Feature-grouped under `src/components/` with subdirectory per domain: `Chat/`, `Cost/`, `Code/`, `Diagram/`, `Tradeoff/`
- Pages under `src/pages/`
- Assets under `src/assets/`

**Variables & Functions:** `camelCase`
**Types & Interfaces:** `PascalCase`
**React Components:** Named exports using `export const ComponentName: React.FC = ...`

### Component Pattern

All components use named exports (not default exports, except `App`):

```tsx
// Correct pattern
export const ChatBox: React.FC = () => {
  const [input, setInput] = useState('')
  // ...
  return (...)
}

// App.tsx uses default export (entry point only)
export default App
```

### Interface / Type Definitions

Interfaces are defined in the same file as their consuming component, above the component function:

```tsx
interface Message {
  role: 'user' | 'assistant'
  content: string
  diagram?: string
  iac?: IaC[]
  costs?: Costs
}
```

- Use `interface` (not `type`) for object shapes
- Optional properties use `?`
- Union types for constrained strings: `role: 'user' | 'assistant'`

### Import Organization

```tsx
import React, { useState } from 'react'           // External packages first
import { MermaidViewer } from '../Diagram/MermaidViewer'  // Local imports second
import { CodeSnippet } from '../Code/Snippet'
```

No path aliases detected — all local imports use relative paths.

### Async / Error Handling Pattern

```tsx
const handleSend = async () => {
  setLoading(true)
  try {
    const response = await fetch('/api/v1/chat', { ... })
    const data = await response.json()
    setMessages((prev) => [...prev, assistantMessage])
  } catch (error) {
    console.error('Error sending message:', error)
  } finally {
    setLoading(false)
  }
}
```

- `try/catch/finally` for all async fetch calls
- `console.error` for caught errors (no custom error logging)
- Loading state with boolean `useState`

### Styling

- Tailwind CSS v4 via `frontend/tailwind.config.js` and `frontend/postcss.config.js`
- All styles applied directly as Tailwind utility classes — no CSS Modules
- Global styles in `src/index.css` and `src/App.css`
- Component-specific CSS only for Mermaid: `src/styles/mermaid.css`

---

## BACKEND (Python / FastAPI)

### Formatting — Black

Config: `backend/pyproject.toml`

```toml
[tool.black]
line-length = 88
target-version = ['py313']
```

### Linting — Ruff

Config: `backend/pyproject.toml`

```toml
[tool.ruff]
line-length = 88
target-version = "py313"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "C90", "B"]
```

Active rule sets:
- `E` / `W` — pycodestyle errors/warnings
- `F` — Pyflakes (undefined names, unused imports)
- `I` — isort (import ordering)
- `N` — pep8-naming (naming conventions enforced)
- `C90` — McCabe complexity
- `B` — flake8-bugbear (common bugs and design problems)

Run: `ruff check .` and `black .` (from `backend/`)

### Naming Conventions (Backend)

| Item | Convention | Example |
|---|---|---|
| Classes | `PascalCase` | `RequirementExtractor`, `ArchitectureAdvisor` |
| Functions/methods | `snake_case` | `get_recommendation`, `extract_mermaid` |
| Variables | `snake_case` | `graph_context`, `formatted_prompt` |
| Constants/env vars | `UPPER_SNAKE_CASE` | `LLM_API_KEY`, `NEO4J_URI` |
| Modules/files | `snake_case` | `cost_analyzer.py`, `knowledge_base.py` |
| Pydantic models | `PascalCase` | `ChatRequest`, `ChatResponse` |

### Import Organization

```python
import json                          # stdlib
import os
from typing import Dict, Any

from fastapi import APIRouter         # third-party
from langchain_openai import ChatOpenAI

from src.core.extractor import RequirementExtractor  # local (src-prefixed)
```

All local imports use full `src.` prefix — e.g., `from src.core.prompts import ADVISOR_PROMPT`.

### Class Pattern (Services)

Service classes initialize dependencies in `__init__`, expose single public methods:

```python
class RequirementExtractor:
    def __init__(self):
        self.llm = ChatOpenAI(
            model="openai/gpt-4o",
            openai_api_key=os.getenv("LLM_API_KEY"),
            openai_api_base="https://openrouter.ai/api/v1"
        )

    def extract(self, description: str) -> Dict[str, Any]:
        """Extracts technical requirements from a natural language description."""
        ...
```

- Constructor reads from `os.getenv()` directly
- One-line docstrings on public methods
- Return type hints using `typing` module (`Dict[str, Any]`, `Optional[str]`, `List[...]`)

### Error Handling Pattern (Backend)

```python
try:
    result = self.llm.invoke(formatted_prompt)
    return {"advice": result.content}
except Exception as e:
    print(f"[ServiceName] Error during operation: {e}")
    return {"advice": "fallback message"}
```

- Broad `except Exception` with `print` logging (prefixed with `[ClassName]`)
- Returns safe fallback values on failure (never raises to caller)

### FastAPI Route Pattern

```python
router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    ...
```

- Pydantic `BaseModel` for request/response schemas
- Async route handlers
- Router objects included in `main.py` with prefix

### SQLAlchemy Models Pattern

File: `backend/src/models/`

```python
class Workload(Base):
    __tablename__ = "workloads"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    description = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    recommendations = relationship("Recommendation", back_populates="workload")
```

- UUID primary keys using `sqlalchemy.dialects.postgresql.UUID`
- `nullable=False` explicit on required fields
- Relationships defined bidirectionally with `back_populates`

### Comments

- Inline numbered comments for sequential steps in complex functions:
  ```python
  # 1. Extract requirements
  # 2. Get recommendation
  # 3. Extract diagram
  ```
- `TODO:` for unimplemented features: `# TODO: Implement vector retrieval`
- No docstrings on route handlers; docstrings only on service methods

---

*Convention analysis: 2025-07-14*
