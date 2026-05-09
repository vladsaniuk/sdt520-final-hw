import os
import json
from langchain_openai import ChatOpenAI
from src.services.pricing import PricingService
from typing import Dict, Any, List

class CostAnalyzer:
    def __init__(self):
        self.pricing_service = PricingService()
        self.llm = ChatOpenAI(
            model="openai/gpt-4o",
            openai_api_key=os.getenv("LLM_API_KEY"),
            openai_api_base="https://openrouter.ai/api/v1"
        )

    def estimate_costs(self, architecture: str) -> Dict[str, Any]:
        """Estimates monthly costs for the given architecture."""
        # 1. Ask LLM to extract primary billable resources
        prompt = f"""
        Extract primary billable AWS resources (Compute/Storage only) from this architecture:
        "{architecture}"
        
        Output as a JSON list of objects: {{"service": "string", "instance_type": "string or null", "quantity": number, "region": "string (default: US East (N. Virginia))"}}
        """
        try:
            response = self.llm.invoke(prompt)
            content = response.content
            # Simple JSON extraction
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            resources = json.loads(content.strip())
            
            # 2. Calculate costs using Pricing API
            breakdown = []
            total = 0.0
            
            for res in resources:
                service_name = res.get("service", "")
                qty = res.get("quantity", 1)
                
                # Simplified: handle EC2 for now
                if "EC2" in service_name.upper():
                    instance = res.get("instance_type", "t3.micro")
                    price_data = self.pricing_service.get_ec2_price(instance, res.get("region"))
                    if price_data:
                        hourly = float(price_data['price'])
                        monthly = hourly * 730 * qty
                        breakdown.append({
                            "service": f"EC2 ({instance})",
                            "cost": round(monthly, 2),
                            "is_calculated": True
                        })
                        total += monthly
                    else:
                        breakdown.append({"service": service_name, "cost": 0.0, "is_calculated": False})
                else:
                    # Highlight non-calculated for other services for now
                    breakdown.append({"service": service_name, "cost": 0.0, "is_calculated": False})

            return {"total": round(total, 2), "breakdown": breakdown}

        except Exception as e:
            print(f"[CostAnalyzer] Error: {e}")
            return {"total": 0.0, "breakdown": []}
