import { Suspense } from "react";
import Settings from "@/components/Settings";

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="px-4 pt-8 text-muted">Loading setup…</p>}>
      <Settings />
    </Suspense>
  );
}
