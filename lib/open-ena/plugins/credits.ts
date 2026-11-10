const developers3dEna = ["Mr. Ludwig Jianxing Yu", "Dr. Peter Hu Dongpin"];

export const pluginCreditNames = {
  longitudinal: "Dr. Peter Dongpin Hu Team",
  ena3d: developers3dEna.join(" & "),
  ona: "Wisconsin ENA Team",
  pending: "Still Under Development",
};

export function pluginCreditParties(name: string) {
  if (name === pluginCreditNames.pending) return [];
  if (name === pluginCreditNames.ena3d) return developers3dEna.map((name) => ({ "@type": "Person", name }));
  const isTeam = name === pluginCreditNames.longitudinal || name === pluginCreditNames.ona;
  return [{ "@type": isTeam ? "Organization" : "Person", name }];
}
