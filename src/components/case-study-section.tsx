type CaseStudySectionProps = {
  title: string;
  children: React.ReactNode;
};

export default function CaseStudySection({
  title,
  children,
}: CaseStudySectionProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 backdrop-blur md:p-8">
      <h2 className="text-3xl font-semibold text-white">{title}</h2>
      <div className="mt-6 text-base leading-8 text-white/70">{children}</div>
    </section>
  );
}
