import { RetiredPage } from "@/lib/pageGuards";

/** Retired sample-data page: the single review step is /registry. */
export default function RetiredLayout() {
  return <RetiredPage nextPath="/upload" />;
}
