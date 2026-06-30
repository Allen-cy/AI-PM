import { ProjectWorkflowRunner } from "@/components/project-workflow-runner";
import { takeoverWorkflow } from "@/lib/project-workflows";

export default function MidProjectTakeoverPage() {
  return <ProjectWorkflowRunner workflow={takeoverWorkflow} />;
}
