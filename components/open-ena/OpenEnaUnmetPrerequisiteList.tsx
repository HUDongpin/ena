export function OpenEnaUnmetPrerequisiteList({
  id,
  title,
  items,
  testId,
}: {
  id: string;
  title: string;
  items: readonly { id: string; label: string }[];
  testId?: string;
}) {
  if (items.length === 0) return null;
  return <div id={id} className="ena-unmet-prerequisite-list" data-testid={testId}>
    <p>{title}</p>
    <ul>{items.map((item) => <li key={item.id} data-unmet-predicate={item.id}>{item.label}</li>)}</ul>
  </div>;
}
