# Quickstart: AWS Architecture Advisor

This document provides instructions for setting up and running the AWS Architecture Advisor locally.

## Prerequisites
- Docker & Docker-Compose
- OpenRouter API Key

## Setup & Run

1. **Clone and Navigate**:
   ```bash
   git clone <repo-url>
   cd aws-architecture-advisor
   ```

2. **Configure Environment**:
   Create a `.env` file in the root:
   ```env
   LLM_API_KEY=your_open_router_key_here
   NEO4J_PASSWORD=password
   ```

3. **Launch the Stack**:
   ```bash
   docker-compose up --build
   ```

4. **Access the Application**:
   - Frontend: `http://localhost:3000` (mapped to internal Vite port 5173)
   - API Docs (Swagger): `http://localhost:8000/docs`
   - Neo4j Browser: `http://localhost:7474` (login: neo4j/password)

## Initial Knowledge Ingestion
1. Open the UI at `http://localhost:3000`.
2. Navigate to the "Knowledge Base" section.
3. Upload the AWS Well-Architected Framework whitepaper (PDF).
4. Wait for the "indexed" status.

## Usage Example
1. In the chat interface, type:
   > "I need a scalable API for a mobile app with 10k DAU, low latency, and a $500 monthly budget."
2. Review the recommended services, diagrams, and IaC snippets.
3. Check the cost breakdown to see how the budget is allocated.
