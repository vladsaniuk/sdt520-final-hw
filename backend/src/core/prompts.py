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
    template="""
    You are the AWS Architecture Advisor. Using the AWS Well-Architected Framework and the provided context, 
    recommend a reference architecture for the following requirements:
    
    Requirements: {requirements}
    
    Context: {context}
    
    Provide:
    1. Architecture Overview (Natural Language)
    2. Service Selection & Reasoning
    3. Trade-off Analysis (at least 2 service comparisons)
    4. Mermaid.js diagram definition
    
    Ensure all advice aligns with the 6 pillars of Well-Architected.
    """
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
