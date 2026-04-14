export default function CoachDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col overflow-visible md:min-h-0 md:flex-1 md:overflow-hidden">
      {children}
    </div>
  );
}
