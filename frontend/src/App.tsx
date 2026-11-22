// App shell: a top bar with Upload / Dashboard, routed by the URL hash (#/upload, #/dashboard).
// A successful upload switches to the dashboard, which then loads the new batch.
import { useEffect, useState } from "react";
import DataIngestion from "./pages/DataIngestion.jsx";
import Dashboard from "./pages/Dashboard";

type Page = "upload" | "dashboard";

const pageFromHash = (): Page => (window.location.hash === "#/upload" ? "upload" : "dashboard");

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (next: Page) => {
    window.location.hash = `#/${next}`;
  };

  const tab = (id: Page, label: string) => (
    <a
      href={`#/${id}`}
      aria-current={page === id ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-[13px] ${
        page === id ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </a>
  );

  return (
    <>
      <nav className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1180px] items-center gap-4 px-4">
          <span className="mr-auto text-[14px] font-semibold tracking-tight text-foreground">NxGen YMS</span>
          {tab("dashboard", "Dashboard")}
          {tab("upload", "Upload")}
        </div>
      </nav>
      {page === "upload" ? (
        <DataIngestion onUploaded={() => go("dashboard")} />
      ) : (
        <Dashboard onUploadClick={() => go("upload")} />
      )}
    </>
  );
}
