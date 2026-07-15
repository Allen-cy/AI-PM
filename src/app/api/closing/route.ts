// Compatibility entry: the formal closure gate and knowledge-reuse state machine
// live in one governed implementation. Old callers no longer submit free-form
// checklists to a separate AI-only review.
export { GET, POST } from "@/app/api/closure-knowledge/route";
