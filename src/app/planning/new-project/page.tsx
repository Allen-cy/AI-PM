import { ProjectWorkflowRunner } from "@/components/project-workflow-runner";
import { newProjectWorkflow } from "@/lib/project-workflows";

export default function NewProjectBestPracticePage() {
  return <ProjectWorkflowRunner workflow={newProjectWorkflow} />;
}
