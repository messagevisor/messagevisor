// Core and runtime evaluation must never drift: target specialization and
// `messagevisor evaluate --segment` use the exact SDK implementation.
export { evaluateCondition, evaluateGroupSegment, evaluateSegment } from "@messagevisor/sdk";
export type { MessagevisorEvaluationDataProvider as EvaluateConditionOptions } from "@messagevisor/sdk";
