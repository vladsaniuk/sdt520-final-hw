import os
from langchain_openai import ChatOpenAI
from typing import List, Dict, Any

class TradeoffAnalyzer:
    def __init__(self):
        self.llm = ChatOpenAI(
            model="openai/gpt-4o",
            openai_api_key=os.getenv("LLM_API_KEY"),
            openai_api_base="https://openrouter.ai/api/v1"
        )

    def analyze(self, services: List[str]) -> str:
        """Provides a detailed trade-off analysis for selected services."""
        prompt = f"""
        Provide a detailed trade-off analysis for these AWS services in the context of a scalable architecture:
        {', '.join(services)}
        
        Compare alternatives (e.g., ALB vs NLB, RDS vs DynamoDB) and explain the performance/cost implications.
        """
        try:
            response = self.llm.invoke(prompt)
            return response.content
        except Exception as e:
            print(f"[TradeoffAnalyzer] Error: {e}")
            return "Trade-off analysis unavailable."
