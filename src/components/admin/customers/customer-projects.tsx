import Link from "next/link";
import StatusBadge from "@/components/admin/status-badge";
import { formatDate } from "@/lib/admin/format";
import { getDeadlineState, projectStatusLabels, projectStatusTone, type Project } from "@/lib/admin/projects/types";

const day = (key: string) => formatDate(`${key}T12:00:00+02:00`);

/** The projects of one customer, with a way to start the next one. */
export default function CustomerProjects({
  customerId,
  projects,
  todayKey,
}: {
  customerId: string;
  projects: Project[];
  todayKey: string;
}) {
  return (
    <div className="border-t border-line pt-6">
      <h2 className="label-mono text-ink">Projecten</h2>
      {projects.length === 0 ? (
        <p className="mt-3 text-[0.9rem] text-muted">Nog geen projecten voor deze klant.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {projects.map((project) => {
            const deadline = getDeadlineState(project, todayKey);
            return (
              <li key={project.id} className="flex items-center justify-between gap-3 py-2 text-[0.9rem]">
                <span className="min-w-0">
                  <Link href={`/admin/projecten/${project.id}`} className="link-static block truncate font-medium text-ink">
                    {project.name}
                  </Link>
                  <span className="block text-[0.82rem] text-muted">
                    {project.deadline ? `Deadline ${day(project.deadline)}` : "Geen deadline"}
                    {deadline === "overdue" ? " · verstreken" : deadline === "today" ? " · vandaag" : ""}
                  </span>
                </span>
                <StatusBadge tone={projectStatusTone[project.status]}>{projectStatusLabels[project.status]}</StatusBadge>
              </li>
            );
          })}
        </ul>
      )}
      <Link href={`/admin/projecten/nieuw?klant=${customerId}`} className="link-static mt-3 inline-block text-[0.92rem] text-ink">
        Nieuw project voor deze klant
      </Link>
    </div>
  );
}
