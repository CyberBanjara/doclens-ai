import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/privacy-policy")({
  component: PrivacyPolicyAlias,
});

function PrivacyPolicyAlias() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/privacy", replace: true });
  }, [navigate]);

  return null;
}
