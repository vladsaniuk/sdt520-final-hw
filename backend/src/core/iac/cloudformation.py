import os
from langchain_openai import ChatOpenAI
from src.core.prompts import IAC_PROMPT

class CloudFormationGenerator:
    def __init__(self):
        self.llm = ChatOpenAI(
            model="openai/gpt-4o",
            openai_api_key=os.getenv("LLM_API_KEY"),
            openai_api_base="https://openrouter.ai/api/v1"
        )

    def generate(self, architecture: str) -> str:
        """Generates a CloudFormation snippet for the given architecture."""
        try:
            formatted_prompt = IAC_PROMPT.format(architecture=architecture)
            # Add instruction to focus ONLY on CloudFormation
            response = self.llm.invoke(f"{formatted_prompt}\n\nOnly output the CloudFormation (YAML) code block.")
            
            content = response.content
            if "```yaml" in content:
                content = content.split("```yaml")[1].split("```")[0]
            elif "```cloudformation" in content:
                content = content.split("```cloudformation")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            return content.strip()
        except Exception as e:
            print(f"[CloudFormationGenerator] Error: {e}")
            return "# Error generating CloudFormation snippet"
