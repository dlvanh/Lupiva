import type { ReactNode } from "react";
import { AdminOnly } from "@/lib/pageGuards";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminOnly nextPath="/admin">{children}</AdminOnly>;
}
