from langchain_core.prompts import PromptTemplate

# Extraction Prompt: Pulling requirements from natural language
EXTRACTION_PROMPT = PromptTemplate(
    input_variables=["description"],
    template="""
    You are an AWS Cloud Architect. Extract technical requirements from the following workload description:
    
    "{description}"
    
    Identify:
    1. Traffic Pattern (e.g., static, bursty, steady)
    2. Data Residency (e.g., EU, US, Global)
    3. User Count (MAU)
    4. Budget Constraints
    5. High Availability needs
    
    Output as JSON.
    """
)

# Advisor Prompt: Generating recommendations based on Well-Architected docs
ADVISOR_PROMPT = PromptTemplate(
    input_variables=["context", "requirements"],
    template="""You are the AWS Architecture Advisor. Using the AWS Well-Architected Framework and the provided context, recommend a reference architecture for the following requirements.

Requirements: {requirements}

Context (AWS services, Well-Architected pillars, relevant documentation):
{context}

Respond with a JSON object matching the ArchitecturePlan schema:
- summary: 2-3 sentences describing the overall architecture approach
- diagram: a valid Mermaid.js flowchart (start with "flowchart TD") showing service relationships
- services: list of selected AWS services, each with name, description of its role, and rationale for choosing it over alternatives
- iac_snippet: Terraform HCL for the core infrastructure (provider block + 2-4 key resource definitions)
- cost_estimate: estimated monthly USD costs with per-service breakdown (mark is_calculated: false — these are LLM estimates)

Ensure all recommendations align with the 6 pillars of the AWS Well-Architected Framework."""
)

# IaC Generation Prompt
IAC_PROMPT = PromptTemplate(
    input_variables=["architecture"],
    template="""
    Generate syntactically correct Terraform (HCL) and CloudFormation (YAML) snippets for the following AWS architecture:
    
    "{architecture}"
    
    Include:
    - Provider configuration
    - Core resource definitions
    - Output values
    - Best practices (e.g., tagging, least privilege)
    """
)

# Compact Prompt: Summarizes conversation history for context window compression
COMPACT_PROMPT = """You are summarizing an AWS architecture advisory conversation.
Produce a concise summary of the conversation so far, covering:
1. The architecture decisions made (services chosen and why)
2. Key constraints and trade-offs identified
3. Any refinements requested and how they were addressed

This summary will replace the conversation history as the system context for future turns.
Keep it under 500 words. Preserve all specific AWS service names, decisions, and constraints.
Do not include pleasantries — only architectural facts."""
