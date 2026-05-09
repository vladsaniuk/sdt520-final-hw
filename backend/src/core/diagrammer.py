import re

class DiagramGenerator:
    def extract_mermaid(self, text: str) -> str:
        """Extracts Mermaid.js diagram definition from LLM text output."""
        # Look for code blocks with 'mermaid' or 'graph'
        mermaid_pattern = re.compile(r"```(?:mermaid)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)
        match = mermaid_pattern.search(text)
        
        if match:
            return match.group(1).strip()
        
        # Fallback: check if text itself looks like mermaid code
        if "graph TD" in text or "graph LR" in text:
            return text.strip()
            
        return "graph TD\n    A[User Request] --> B[Architecture Recommendation]"
