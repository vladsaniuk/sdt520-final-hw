import pytest
from deepeval.metrics import FaithfulnessMetric, AnswerRelevancyMetric, ContextualRelevancyMetric, ContextualRecallMetric
from deepeval.test_case import LLMTestCase
from deepeval import assert_test

# Custom G-Eval for Architecture Correctness
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCaseParams

def test_aws_architecture_rag():
    # Example test case (this would be populated with real data during implementation)
    test_case = LLMTestCase(
        input="How do I build a scalable web app on AWS?",
        actual_output="Use ALB + Auto Scaling Groups with EC2 and RDS Multi-AZ.",
        retrieval_context=["ALB provides load balancing.", "RDS Multi-AZ ensures high availability."],
        expected_output="A scalable web app on AWS typically uses an ALB, ASG for EC2, and RDS Multi-AZ."
    )

    # 1. Faithfulness
    faithfulness_metric = FaithfulnessMetric(threshold=0.7)
    
    # 2. Answer Relevancy
    relevancy_metric = AnswerRelevancyMetric(threshold=0.7)
    
    # 3. Contextual Relevancy
    contextual_relevancy_metric = ContextualRelevancyMetric(threshold=0.7)
    
    # 4. Contextual Recall
    contextual_recall_metric = ContextualRecallMetric(threshold=0.7)
    
    # 5. G-Eval: Architecture Correctness
    correctness_metric = GEval(
        name="Architecture Correctness",
        criteria="Verify the technical soundness of the AWS architecture based on SAA-C03 standards.",
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        threshold=0.7
    )

    # Assert all metrics
    assert_test(test_case, [
        faithfulness_metric, 
        relevancy_metric, 
        contextual_relevancy_metric, 
        contextual_recall_metric,
        correctness_metric
    ])
