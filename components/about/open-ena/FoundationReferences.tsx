import { attributionSources } from "@/lib/open-ena-attribution";
import styles from "./AboutContent.module.css";

/** Foundational sources are separate from the Open ENA team's project publications. */
export default function FoundationReferences() {
  return (
    <ul className={styles["foundation-references"]} lang="en" dir="ltr">
      <li id="foundation-shaffer-2017">
        Shaffer, D. W. (2017). <cite>Quantitative ethnography.</cite> Cathcart Press.{" "}
        <a href={attributionSources.qe}>https://www.quantitativeethnography.org/</a>
      </li>
      <li id="foundation-shaffer-et-al-2016">
        Shaffer, D. W., Collier, W., &amp; Ruis, A. R. (2016). A tutorial on epistemic network analysis: Analyzing the structure of connections in cognitive, social, and interaction data.{" "}
        <cite>Journal of Learning Analytics, 3</cite>(3), 9–45.{" "}
        <a href={attributionSources.tutorial}>https://doi.org/10.18608/jla.2016.33.3</a>
      </li>
      <li id="foundation-shaffer-ruis-2017">
        Shaffer, D. W., &amp; Ruis, A. R. (2017). Epistemic network analysis: A worked example of theory-based learning analytics.
        In C. Lang, G. Siemens, A. F. Wise, &amp; D. Gašević (Eds.), <cite>Handbook of learning analytics</cite> (pp. 175–187). Society for Learning Analytics Research.{" "}
        <a href={attributionSources.theory}>https://doi.org/10.18608/hla17.015</a>
      </li>
      <li id="foundation-tan-et-al-2022">
        Tan, Y., Hinojosa, C., Marquart, C., Ruis, A. R., &amp; Shaffer, D. W. (2022). Epistemic network analysis visualization.
        In B. Wasson &amp; S. Zörgő (Eds.), <cite>Advances in quantitative ethnography</cite> (pp. 129–143). Springer.{" "}
        <a href={attributionSources.visualization}>https://doi.org/10.1007/978-3-030-93859-8_9</a>
      </li>
    </ul>
  );
}
