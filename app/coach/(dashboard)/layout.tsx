import { CoachNav } from "@/components/coach/CoachNav";

export default function CoachDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CoachNav />
      {children}
    </>
  );
}
