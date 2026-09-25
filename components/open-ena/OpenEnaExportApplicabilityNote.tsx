export function OpenEnaExportApplicabilityNote({
  id,
  action,
  text,
  reason,
  familyApplies,
}: {
  id: string;
  action: string;
  text: string;
  reason: string | null;
  familyApplies: boolean;
}) {
  return (
    <p
      id={id}
      className="ena-export-applicability"
      role="note"
      data-export-action={action}
      data-export-applicability-reason={reason ?? "applicable"}
      data-export-family-applies={familyApplies ? "true" : "false"}
      data-testid={id}
    >
      {text}
    </p>
  );
}
