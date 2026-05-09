import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from src.core.extractor import RequirementExtractor
from src.core.advisor import ArchitectureAdvisor
from src.core.diagrammer import DiagramGenerator
from src.core.iac.terraform import TerraformGenerator
from src.core.iac.cloudformation import CloudFormationGenerator
from src.core.cost_analyzer import CostAnalyzer

router = APIRouter()
extractor = RequirementExtractor()
advisor = ArchitectureAdvisor()
diagrammer = DiagramGenerator()
tf_gen = TerraformGenerator()
cfn_gen = CloudFormationGenerator()
cost_analyzer = CostAnalyzer()

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None

class IaCSnippetResponse(BaseModel):
    type: str
    content: str

class ChatResponse(BaseModel):
    recommendation_id: str
    text: str
    diagram: str
    iac: List[IaCSnippetResponse]
    costs: dict

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    # 1. Extract requirements
    requirements = extractor.extract(request.message)
    
    # 2. Get recommendation
    result = advisor.get_recommendation(requirements)
    advice_text = result["advice"]
    
    # 3. Extract diagram
    diagram = diagrammer.extract_mermaid(advice_text)
    
    # 4. Generate IaC Snippets
    tf_snippet = tf_gen.generate(advice_text)
    cfn_snippet = cfn_gen.generate(advice_text)
    
    # 5. Estimate Costs
    costs = cost_analyzer.estimate_costs(advice_text)
    
    return {
        "recommendation_id": str(uuid.uuid4()),
        "text": advice_text,
        "diagram": diagram,
        "iac": [
            {"type": "terraform", "content": tf_snippet},
            {"type": "cloudformation", "content": cfn_snippet}
        ],
        "costs": costs
    }
