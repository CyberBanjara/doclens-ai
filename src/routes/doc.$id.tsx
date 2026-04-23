import { createFileRoute } from "@tanstack/react-router";
import { DocWorkspace } from "@/components/DocWorkspace";

export const Route = createFileRoute("/doc/$id")({
  component: DocPage,
  ssr: false,
  head: () => ({
    meta: [
      { title: "DocLens — Document Workspace" },
      {
        name: "description",
        content:
          "Inspect, extract, and run AI operations on a PDF in your browser. All processing is local; AI calls go directly to OpenRouter using your key.",
      },
    ],
  }),
});

function DocPage() {
  const { id } = Route.useParams();
  return <DocWorkspace id={id} />;
}
