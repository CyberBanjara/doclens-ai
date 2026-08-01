import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/terms-of-service")({
  component: TermsOfServiceAlias,
});

function TermsOfServiceAlias() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/terms", replace: true });
  }, [navigate]);

  return null;
}
