FROM python:3.13-slim

WORKDIR /app

ARG TERRAFORM_VERSION=1.9.5

RUN apt-get update && apt-get install -y \
    build-essential \
    unzip \
    curl \
    && curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" \
       -o /tmp/terraform.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin/ \
    && rm /tmp/terraform.zip \
    && chmod +x /usr/local/bin/terraform \
    && rm -rf /var/lib/apt/lists/*

ENV TF_PLUGIN_CACHE_DIR=/tmp/tf-plugin-cache

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
