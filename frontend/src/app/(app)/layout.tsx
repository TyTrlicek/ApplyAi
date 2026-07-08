import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-h-full flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
