import { loadDashboardData } from "@/data/load";
import { DashboardShell } from "@/components/dashboard-shell";

/**
 * Single-page dashboard.
 *
 * The artifacts are read and Zod-validated here, on the server, at build time —
 * there is no analyzer API, no database and no client fetch. A malformed
 * artifact fails the build rather than rendering a plausible-looking lie.
 */
export default function Page() {
  const data = loadDashboardData();
  return <DashboardShell data={data} />;
}
