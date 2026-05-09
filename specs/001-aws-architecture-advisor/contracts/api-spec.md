# API Contract: AWS Architecture Advisor

The backend exposes a FastAPI REST API for the chat interface and knowledge base management.

## Endpoints

### 1. Chat & Advice
**POST** `/api/v1/chat`
- **Request Body**:
  ```json
  {
    "message": "string",
    "conversation_id": "uuid (optional)"
  }
  ```
- **Response**:
  ```json
  {
    "recommendation_id": "uuid",
    "text": "Natural language advice...",
    "diagram": "mermaid string",
    "iac": [
      {"type": "terraform", "content": "..."},
      {"type": "cloudformation", "content": "..."}
    ],
    "costs": {
      "total": 1250.50,
      "breakdown": [
        {"service": "RDS", "cost": 400.0, "is_calculated": true},
        {"service": "Egress", "cost": 0.0, "is_calculated": false}
      ]
    }
  }
  ```

### 2. Knowledge Base Upload
**POST** `/api/v1/knowledge/upload`
- **Request**: `multipart/form-data`
  - `file`: Binary
- **Response**:
  ```json
  {
    "document_id": "uuid",
    "filename": "well-architected.pdf",
    "status": "indexing"
  }
  ```

### 3. Knowledge Base Status
**GET** `/api/v1/knowledge/status/{document_id}`
- **Response**:
  ```json
  {
    "document_id": "uuid",
    "status": "indexed",
    "chunk_count": 142
  }
  ```

### 4. Health Check
**GET** `/health`
- **Response**: `{"status": "ok", "services": {"neo4j": "up", "llm": "up"}}`
