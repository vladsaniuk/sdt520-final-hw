import boto3
import json
import os
from typing import Dict, Any, Optional

class PricingService:
    def __init__(self):
        # Pricing API is only available in us-east-1, ap-south-1, eu-central-1
        self.client = boto3.client('pricing', region_name='us-east-1')
        self.cache_dir = "data/cache/pricing"
        os.makedirs(self.cache_dir, exist_ok=True)

    def get_product_price(self, service_code: str, filters: list) -> Optional[Dict[str, Any]]:
        """Fetches the On-Demand price for a given service and filters."""
        cache_key = f"{service_code}_{hash(json.dumps(filters, sort_keys=True))}.json"
        cache_path = os.path.join(self.cache_dir, cache_key)

        if os.path.exists(cache_path):
            with open(cache_path, 'r') as f:
                return json.load(f)

        try:
            response = self.client.get_products(
                ServiceCode=service_code,
                Filters=filters,
                MaxResults=1
            )

            if not response['PriceList']:
                return None

            price_item = json.loads(response['PriceList'][0])
            terms = price_item['terms']['OnDemand']
            price_dimension_key = list(terms.values())[0]['priceDimensions']
            price_details = list(price_dimension_key.values())[0]

            result = {
                'description': price_details['description'],
                'unit': price_details['unit'],
                'price': price_details['pricePerUnit']['USD'],
                'currency': 'USD'
            }

            with open(cache_path, 'w') as f:
                json.dump(result, f)

            return result

        except Exception as e:
            print(f"[PricingService] Error fetching price for {service_code}: {e}")
            return None

    def get_ec2_price(self, instance_type: str, region: str = "US East (N. Virginia)") -> Optional[Dict[str, Any]]:
        filters = [
            {'Type': 'TERM_MATCH', 'Field': 'instanceType', 'Value': instance_type},
            {'Type': 'TERM_MATCH', 'Field': 'location', 'Value': region},
            {'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': 'Linux'},
            {'Type': 'TERM_MATCH', 'Field': 'tenancy', 'Value': 'Shared'},
            {'Type': 'TERM_MATCH', 'Field': 'preInstalledSw', 'Value': 'NA'},
            {'Type': 'TERM_MATCH', 'Field': 'capacitystatus', 'Value': 'Used'}
        ]
        return self.get_product_price('AmazonEC2', filters)
