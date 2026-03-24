type CaseStudySectionProps = {
  title: string;
  children: React.ReactNode;
};

export default function CaseStudySection({
  title,
  children,
}: CaseStudySectionProps) {
  return (
    <section className="rounded-[2rem] border border-[color:var(--line)] bg-[var(--background-elevated)]/94 p-6 backdrop-blur-sm md:p-8">
      <h2 className="text-3xl font-semibold text-[var(--foreground)]">{title}</h2>
      <div className="mt-6 text-base leading-8 text-[color:var(--muted-foreground)]">{children}</div>
    </section>
  );
}
