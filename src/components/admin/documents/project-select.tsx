import { SelectField } from "@/components/admin/form-field";
import { projectStatusLabels, type Project } from "@/lib/admin/projects/types";

type ProjectSelectProps = {
  /** Projects of the customer on the document; the only ones it may name. */
  projects: Project[];
  value: string;
  onChange: (projectId: string) => void;
  /** No customer chosen yet, so there is nothing to pick from. */
  disabled?: boolean;
  hint?: string;
};

/**
 * Filing a document under a project. Optional by design: a quote or invoice
 * without a project is a complete document, and the database keeps it that
 * way. The list is already narrowed to the customer's own projects, because a
 * project of another customer is refused by the composite foreign key.
 */
export default function ProjectSelect({ projects, value, onChange, disabled, hint }: ProjectSelectProps) {
  return (
    <SelectField
      id="projectId"
      label="Project"
      optional
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      hint={hint ?? (disabled ? "Kies eerst een klant." : projects.length === 0 ? "Deze klant heeft nog geen projecten." : undefined)}
    >
      <option value="">Geen project</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name} · {projectStatusLabels[project.status]}
        </option>
      ))}
    </SelectField>
  );
}
