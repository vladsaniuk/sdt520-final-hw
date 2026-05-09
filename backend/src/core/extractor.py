import json
import os
from langchain_openai import ChatOpenAI
from src.core.prompts import EXTRACTION_PROMPT
from typing import Dict, Any

class RequirementExtractor:
    def __init__(self):
        # OpenRouter setup (OpenAI compatible)
        self.llm = ChatOpenAI(
            model="openai/gpt-4o",  # Default model on OpenRouter
            openai_api_key=os.getenv("LLM_API_KEY"),
            openai_api_base="https://openrouter.ai/api/v1"
        )

    def extract(self, description: str) -> Dict[str, Any]:
        """Extracts technical requirements from a natural language description."""
        try:
            formatted_prompt = EXTRACTION_PROMPT.format(description=description)
            response = self.llm.invoke(formatted_prompt)
            
            # Extract JSON from response (handling potential markdown formatting)
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            return json.loads(content.strip())
        except Exception as e:
            print(f"[Extractor] Error during requirement extraction: {e}")
            return {
                "traffic_pattern": "unknown",
                "data_residency": "global",
                "user_count": 0,
                "budget": "none",
                "high_availability": False
            }
