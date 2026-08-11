import type { AcademyLesson } from "./academy-types";

const sharedDownloads = [
  {
    label: "Synthetic design-talk dataset",
    href: "/data/academy/ena-design-talk-sample.csv",
    note: "A fictional 48-row CSV for learning the workflow, not for substantive inference.",
  },
  {
    label: "Codebook and coding examples",
    href: "/data/academy/ena-design-talk-codebook.csv",
    note: "Definitions, inclusion rules, exclusion rules, and one positive example for each code.",
  },
  {
    label: "Blank ENA decision record",
    href: "/data/academy/ena-analysis-decision-record.md",
    note: "A reusable worksheet for recording the question, units, conversations, codes, window, and claim boundary.",
  },
] as const;

const foundationalSources = [
  {
    label: "Shaffer, Collier, and Ruis: A Tutorial on Epistemic Network Analysis",
    url: "https://doi.org/10.18608/jla.2016.33.3",
  },
  {
    label: "Epistemic Analytics: official ENA resources",
    url: "https://www.epistemicnetwork.org/resources/",
  },
] as const;

const academyLessonRecords: AcademyLesson[] = [
  {
    id: "academy-005",
    slug: "audit-ena-normalization-projection-and-rotation",
    sequence: 5,
    title: "Audit ENA Normalization, Projection, and Rotation",
    track: "modeling",
    level: "intermediate",
    durationMinutes: 35,
    publishedAt: "2026-08-12",
    tags: ["sphere normalization", "SVD projection", "means rotation", "model audit"],
    visual: "model",
    visualAlt:
      "The same ENA units compared under an SVD projection and a two-group means rotation",
    shortSummary:
      "Separate connection accumulation from normalization and dimensional reduction, then justify whether an SVD or two-group means rotation answers the research question.",
    introduction: [
      "An ENA model contains more than a network picture. After coded connections are accumulated for each unit, the model may normalize those high-dimensional connection vectors and then project them into a low-dimensional space. Those operations affect what comparisons are visible and how strongly total connection volume influences distance among units.",
      "This lesson deepens the shared teacher-design example from Lessons 1 through 4. You will hold the data, units, conversations, codes, and moving window constant while auditing sphere normalization, a singular value decomposition projection, and a two-group means rotation. The objective is not to find the most dramatic plot. It is to choose and report a representation that matches the planned comparison.",
    ],
    learningObjectives: [
      "Explain what sphere normalization preserves and removes from an accumulated ENA connection vector.",
      "Distinguish an SVD projection that summarizes variance from a means rotation aligned to two prespecified groups.",
      "Record a reproducible projection decision without treating visual separation as inferential evidence.",
    ],
    caseStudy: {
      title: "One synthetic dataset, two defensible views",
      text: "The 48-row teaching dataset contains eight fictional teacher-design teams, four baseline and four scaffolded. The units, conversations, five codes, and moving-window specification remain unchanged. You will compare an exploratory SVD view with a means-rotated view of the same accumulated unit networks, then explain which question each view can answer.",
    },
    steps: [
      {
        title: "Freeze the accumulated model specification",
        text: "Open the existing ENA decision record and copy the dataset filename, file hash, unit field, conversation field, row-order field, five code columns, moving-window size, weighting rule, exclusions, and software version into a new run entry. Do not change any of these elements while comparing normalization or rotation. Otherwise, a shifted point could reflect a different evidence model rather than a different projection of the same networks.",
        checkpoint: "The SVD and means-rotation runs reference one identical accumulated connection matrix and one dated settings record.",
      },
      {
        title: "Inspect connection magnitude before normalization",
        text: "For each team, inspect the accumulated edge-weight vector or a complete edge table before normalization. Compare its Euclidean length and total connection weight with the number and density of coded lines. In this balanced teaching file, every team has six rows, yet teams can still produce different total connection weight because rows contain different combinations of codes. Mark any all-zero unit, because its direction is undefined and requires an explicit zero-network policy.",
        checkpoint: "Your audit table records every team's connection magnitude and confirms whether any unit has an empty network.",
      },
      {
        title: "Apply and explain sphere normalization",
        text: "Run the model with sphere normalization and record the setting. Sphere normalization divides a non-zero unit's accumulated connection vector by its Euclidean norm. The normalized vector keeps that unit's relative profile of stronger and weaker connections while removing overall vector magnitude. Compare normalized and unnormalized coordinates, but do not describe normalization as neutral: it changes the estimand from total connection volume toward connection composition.",
        checkpoint: "A short note states what magnitude information was removed, what relational profile was retained, and how zero networks were handled.",
      },
      {
        title: "Build an exploratory SVD baseline",
        text: "Using the normalized vectors and no group-directed rotation, create a singular value decomposition projection. Record the labels and variance represented by the first two displayed dimensions. SVD chooses orthogonal directions that summarize variation in the modeled unit networks; it does not automatically align the first axis with the baseline-versus-scaffolded contrast. Inspect points, mean networks, and node positions together so the plotted geometry remains connected to the edge data.",
        checkpoint: "The saved SVD view includes all eight units, both axis statistics, shared node positions, and an interpretation that does not assume a treatment axis.",
      },
      {
        title: "Apply a prespecified two-group means rotation",
        text: "Return to the same normalized vectors and define the baseline and scaffolded groups from the condition field. Apply means rotation only because the planned question explicitly compares these two groups. The first rotated dimension passes through their mean locations in the original high-dimensional space; subsequent displayed dimensions are computed from remaining variation. The rotation makes the planned contrast easier to inspect, but it does not create new connections or test whether the groups differ in a population.",
        checkpoint: "Exactly two prespecified groups determine the first rotated axis, and group membership matches the frozen decision record.",
      },
      {
        title: "Compare representations without mixing spaces",
        text: "Place the SVD and means-rotated outputs side by side and label them as separate projections of the same networks. Compare variance, group-mean positions, unit overlap, network subtractions, and the edges that support the first-axis interpretation. Never subtract coordinates or measure distances across separately fitted spaces. Within each space, confirm that every point and network uses the same rotation and node placement as the other units in that model.",
        checkpoint: "The comparison distinguishes stable edge evidence from projection-dependent axis orientation and avoids cross-space distance claims.",
      },
      {
        title: "Write the projection decision and claim boundary",
        text: "Choose the SVD view when the goal is an exploratory summary of dominant variation, or the means-rotated view when the planned two-group contrast is the analytic focus. Record the rejected alternative, the reason for the choice, normalization status, axis variance, group definitions, zero-network handling, and exported model artifact. Pair any statistical comparison with its sampling assumptions and inspect the underlying coded rows before writing a substantive interpretation.",
        checkpoint: "A second analyst can reproduce the chosen view and explain why its projection serves the stated research question.",
      },
    ],
    coreIdeas: [
      "Sphere normalization emphasizes connection composition by removing a non-zero unit vector's overall magnitude.",
      "SVD summarizes major variation, while a two-group means rotation aligns the first dimension to a planned contrast.",
      "Projection choices orient the view of existing networks; they do not create edges, validate codes, or prove group differences.",
    ],
    analysisChecks: [
      "Were the data, accumulation settings, units, conversations, codes, weighting, and window held constant across projections?",
      "Is the decision to normalize justified in relation to connection magnitude and the research question?",
      "Were exactly two prespecified groups used for means rotation, with every compared unit in one shared space?",
      "Does the report separate axis orientation and visual distance from statistical and substantive claims?",
    ],
    methodBoundary:
      "Normalization and rotation cannot repair invalid codes, inappropriate units, dependent observations, weak sampling, or a poorly justified conversation window. The synthetic eight-team dataset is suitable for learning the audit workflow, not for selecting a universally correct projection or making claims about real teachers. A visually clear means-rotated separation is still a representation of modeled networks, not evidence that a scaffold caused a difference.",
    sources: [
      {
        label: "Bowman et al.: The Mathematical Foundations of Epistemic Network Analysis",
        url: "https://doi.org/10.1007/978-3-030-67788-6_7",
      },
      {
        label: "Tan et al.: Epistemic Network Analysis and Ordered Network Analysis in Learning Analytics",
        url: "https://doi.org/10.1007/978-3-031-54464-4_18",
      },
      {
        label: "CRAN reference manual for rENA",
        url: "https://cran.r-project.org/web/packages/rENA/rENA.pdf",
      },
    ],
    downloads: [...sharedDownloads],
  },
  {
    id: "academy-004",
    slug: "interpret-ena-networks-with-qualitative-evidence",
    sequence: 4,
    title: "Interpret ENA Networks With Qualitative Evidence",
    track: "interpretation",
    level: "intermediate",
    durationMinutes: 25,
    publishedAt: "2026-08-09",
    tags: ["network interpretation", "difference graphs", "qualitative evidence", "evidence boundaries"],
    visual: "interpret",
    visualAlt:
      "An ENA network, a comparison plot, and coded excerpts linked in an evidence interpretation loop",
    shortSummary:
      "Read points, edges, and comparison networks as coordinated model outputs, then return to coded excerpts before writing a bounded claim.",
    introduction: [
      "An ENA plot is an entry point into the evidence, not a self-interpreting picture. A point locates a unit or group network in a shared projected space. A network graph shows the relative strengths of connections among codes. A comparison network emphasizes which connections are relatively stronger in one group than another. These views answer related questions, but they are not interchangeable.",
      "This tutorial completes the synthetic teacher-design example used across the ENA Academy pathway. You will move from a visible difference to the line-level records that produced it, test alternative explanations, and draft a claim whose strength matches the teaching dataset.",
    ],
    learningObjectives: [
      "Distinguish point positions, weighted networks, and comparison networks.",
      "Trace an apparent connection difference back to coded rows and raw text.",
      "Write an interpretation that separates description, model-based comparison, and causal explanation.",
    ],
    caseStudy: {
      title: "The same synthetic design-talk study",
      text: "Suppose the scaffolded teams show a relatively stronger Evidence-Revision connection than the baseline teams. Your task is not to celebrate the thicker edge. Your task is to determine what the edge represents, which units contribute to it, which excerpts support it, and what the small fictional design cannot establish.",
    },
    steps: [
      {
        title: "Name the view before interpreting it",
        text: "Record whether you are looking at individual points, group means, one weighted network, or a subtraction network. Note the axis labels, variance shown by the interface, scale settings, and whether node positions are shared across the compared networks. A thicker line in one network is not automatically the same object as a colored line in a difference graph.",
        checkpoint: "Your notes identify the exact plot, groups, settings, and visual encoding under discussion.",
      },
      {
        title: "Describe the pattern without explaining it",
        text: "Start with a literal observation: the scaffolded mean network has a relatively stronger Evidence-Revision connection under this model. Avoid language such as caused, improved, or learned. Description protects the boundary between what the model displays and why the pattern may exist.",
        checkpoint: "The first sentence reports a modeled relationship and contains no causal verb.",
      },
      {
        title: "Inspect unit-level variation",
        text: "Check whether the group pattern is broadly distributed or driven by one or two units. Compare group means with individual points and networks. If the interface provides uncertainty or statistical comparison tools, record the test, grouping, sample size, and result rather than treating visual separation as significance.",
        checkpoint: "You can state whether the visible mean difference is consistent across units or concentrated in a few teams.",
      },
      {
        title: "Return to the coded evidence",
        text: "Use Data View or the source CSV to inspect rows contributing to Evidence and Revision within the selected conversation window. Read the utterances before and around each coded row. Verify that the excerpts support the coding definitions and that the modeled proximity is meaningful in the activity context.",
        checkpoint: "At least two excerpts are linked to the edge, with unit, conversation, and row identifiers retained.",
      },
      {
        title: "Test plausible alternatives",
        text: "Ask whether the pattern changes under a defensible alternative window, after reviewing a borderline code, or when one influential unit is removed. Also inspect code frequencies: ENA focuses on relations, but a rare or unevenly applied code can still shape the network. Treat sensitivity checks as part of interpretation rather than as a search for the preferred picture.",
        checkpoint: "Your record includes at least one justified sensitivity check and its outcome.",
      },
      {
        title: "Write a layered claim",
        text: "Write three linked statements: what the ENA model shows, what the underlying excerpts suggest, and what the design cannot determine. For this tutorial, an appropriate conclusion is that the synthetic scaffolded records contain a stronger modeled connection between evidence and revision, illustrated by excerpts where teams revise a strategy in response to student work. The dataset cannot show that a real scaffold would cause better reasoning or learning.",
        checkpoint: "The final paragraph separates modeled pattern, contextual interpretation, and limitation.",
      },
    ],
    coreIdeas: [
      "Plots, networks, and subtraction graphs are coordinated but distinct representations.",
      "Interpretation should reconnect network features to units, coded rows, and raw evidence.",
      "A relational difference is not a causal effect and does not establish learning by itself.",
    ],
    analysisChecks: [
      "Were the compared networks created in the same analytic space with shared node positions?",
      "Is the pattern visible across units rather than only in a group mean?",
      "Do the source excerpts support the coding and the proposed contextual reading?",
      "Does the claim survive a defensible sensitivity check?",
    ],
    methodBoundary:
      "ENA quantifies and visualizes modeled co-occurrences under chosen units, conversation boundaries, codes, accumulation rules, normalization, and rotation. It does not independently validate the coding scheme, infer intent, or establish that an intervention caused a difference.",
    sources: [
      ...foundationalSources,
      {
        label: "Shaffer and Ruis: ENA worked example of theory-based learning analytics",
        url: "https://doi.org/10.18608/hla17.015",
      },
    ],
    downloads: [...sharedDownloads],
  },
  {
    id: "academy-003",
    slug: "build-and-compare-an-ena-model",
    sequence: 3,
    title: "Build and Compare an ENA Model",
    track: "modeling",
    level: "intermediate",
    durationMinutes: 30,
    publishedAt: "2026-08-09",
    tags: ["webENA", "moving stanza window", "group comparison", "model specification"],
    visual: "model",
    visualAlt:
      "Two groups of ENA points and networks compared in a shared analytic space",
    shortSummary:
      "Configure units, conversations, codes, and a stanza window in webENA, then compare networks without confusing visual separation with statistical evidence.",
    introduction: [
      "A reproducible ENA model begins with explicit choices. The software needs to know which rows form each network, where relational context begins and ends, which columns are codes, and how nearby rows may contribute to a connection. Those settings operationalize the research design from Lesson 1 and the table structure from Lesson 2.",
      "This tutorial uses the official webENA workflow as the main path. Interface labels may evolve, but the analytic record should remain stable: dataset version, units, conversation fields, codes, window, weighting, normalization, rotation, groups, and exported outputs.",
    ],
    learningObjectives: [
      "Map dataset columns to Units, Conversation, Codes, and comparison groups.",
      "Explain how the selected window changes which codes can become connected.",
      "Compare group networks in one analytic space while documenting the model specification.",
    ],
    caseStudy: {
      title: "Eight fictional teacher-design teams",
      text: "The teaching CSV contains eight team units, four baseline and four scaffolded. Each team has one ordered design-review conversation and five binary code columns: Goal, Evidence, Strategy, Tradeoff, and Revision. The values were authored to make the workflow visible, not to simulate a population.",
    },
    steps: [
      {
        title: "Create a set and inspect the import",
        text: "Open the official webENA application, create a project or set, and upload the teaching CSV. Confirm that the header row is recognized, rows remain in line-number order, and the raw utterance column is available for later evidence inspection. Do not proceed if unit, conversation, or code columns have missing values.",
        checkpoint: "The imported table has 48 ordered rows and the expected metadata and five binary code columns.",
      },
      {
        title: "Define the units",
        text: "Select team_id as the unit field so each team becomes one network. Keep condition as metadata for grouping rather than including it in the unique unit identifier for this teaching model. In a real study, use every field required to uniquely identify the analytic unit across the dataset.",
        checkpoint: "The model reports eight units, with four baseline and four scaffolded teams.",
      },
      {
        title: "Bound the conversation",
        text: "Use conversation_id as the conversation field and retain discussion_round as readable metadata plus line_number as the within-conversation order. The supplied conversation_id combines team_id and discussion_round so it is unique across the dataset. If your ENA interface accepts multiple conversation fields, selecting team_id and discussion_round together is equivalent. Choose a moving stanza window that includes the current line and up to four previous lines for the first run. This is a pedagogical choice for six-line conversations, not a universal default. Record the window and justify it from the interaction process.",
        checkpoint: "Each conversation_id belongs to exactly one team, connections cannot cross team or discussion-round boundaries, and the recorded window matches the model setting.",
      },
      {
        title: "Select the code columns",
        text: "Select goal, evidence, strategy, tradeoff, and revision as codes. Keep identifiers, condition, speaker, line number, and utterance as metadata. Confirm that the model-validity checklist is complete before reading a blank plot as a result.",
        checkpoint: "Exactly five intended code nodes appear and no metadata column is plotted as a code.",
      },
      {
        title: "Build the shared analytic space",
        text: "Generate the model and keep all eight units in the same space. Inspect the comparison plot, individual points, network graphs, axis variance, and line-weight display. Save a screenshot or export together with the complete settings record. Node placement helps make connection patterns visible; it is not a geographic map of the concepts.",
        checkpoint: "One documented model contains all units and retains coordinated point and network views.",
      },
      {
        title: "Compare conditions cautiously",
        text: "Group units by condition and add the baseline and scaffolded means to the same comparison plot. Inspect their mean networks and the comparison network. If you run statistical tools, label the analysis as a demonstration with a tiny synthetic sample. A visible distance or thick subtraction edge is a prompt for inspection, not proof of a reliable population difference.",
        checkpoint: "Your notes distinguish the visual comparison from any inferential test and retain the eight-unit sample size.",
      },
    ],
    coreIdeas: [
      "Units identify the networks being compared; conversations bound relational context.",
      "The window is a theoretical and temporal assumption about meaningful proximity.",
      "Groups must be compared in a shared analytic space with the model settings preserved.",
    ],
    analysisChecks: [
      "Does every row map to one valid unit and one bounded conversation?",
      "Can you justify the stanza window from the process that generated the data?",
      "Are all comparison groups modeled together rather than in separate spaces?",
      "Have you exported enough settings for another analyst to reproduce the model?",
    ],
    methodBoundary:
      "This tutorial teaches model configuration with deliberately patterned, synthetic data. The resulting plots are useful for checking the workflow only. They provide no basis for population inference, intervention evaluation, or claims about actual teachers.",
    sources: [
      ...foundationalSources,
      {
        label: "Official webENA application",
        url: "https://app.epistemicnetwork.org/login.html",
      },
      {
        label: "Siebert-Evenstone et al.: In Search of Conversational Grain Size",
        url: "https://learning-analytics.info/index.php/JLA/article/view/5416",
      },
      {
        label: "CRAN reference manual for rENA",
        url: "https://cran.r-project.org/web/packages/rENA/rENA.pdf",
      },
    ],
    downloads: [...sharedDownloads],
  },
  {
    id: "academy-002",
    slug: "prepare-coded-discourse-data-for-ena",
    sequence: 2,
    title: "Prepare Coded Discourse Data for ENA",
    track: "data-preparation",
    level: "beginner",
    durationMinutes: 25,
    publishedAt: "2026-08-09",
    tags: ["data formatting", "binary codes", "conversation order", "data audit"],
    visual: "prepare",
    visualAlt:
      "Ordered discourse rows transformed into metadata and binary code columns for ENA",
    shortSummary:
      "Turn ordered qualitative records into an auditable ENA table with complete unit, conversation, raw-evidence, and binary code fields.",
    introduction: [
      "ENA normally starts from rows of coded interaction or other ordered records rather than from a finished network. The table must preserve enough structure for the software to decide which rows belong to each network and which rows can contribute to a shared relational context.",
      "A clean file also keeps the qualitative evidence close. Identifiers and code columns make computation possible; speaker, line order, and raw text make interpretation and audit possible. Removing the raw evidence may produce a valid-looking network that is difficult to explain responsibly.",
    ],
    learningObjectives: [
      "Separate unit, conversation, ordering, raw-data, grouping, and code columns.",
      "Validate complete identifiers and binary code values before import.",
      "Document a transparent transformation from source records to an ENA-ready CSV.",
    ],
    caseStudy: {
      title: "A synthetic design-review transcript",
      text: "Each row represents one ordered turn from a fictional team discussing how to improve a feedback activity. The dataset includes four teams per condition and five codes: Goal, Evidence, Strategy, Tradeoff, and Revision. Several rows contain more than one code so connections can be inspected directly as well as across a moving window.",
    },
    steps: [
      {
        title: "Download and preserve the source file",
        text: "Save the teaching CSV without opening and resaving it in software that may change delimiters, encodings, or identifiers. Record the filename and date. For a real project, also retain a read-only source export and a scripted or logged transformation path to the analysis file.",
        checkpoint: "You can distinguish the untouched source, the analysis-ready file, and any later model export.",
      },
      {
        title: "Identify metadata columns",
        text: "team_id identifies the network unit. condition supports grouping. discussion_round is a readable round label, while conversation_id combines team_id and discussion_round to create a boundary that is unique across the full dataset. line_number preserves order. speaker and utterance retain context. These fields should not be selected as codes. Every row needs a complete unit and conversation value, even when a spreadsheet visually repeats the same group.",
        checkpoint: "All 48 rows have team_id, condition, discussion_round, conversation_id, line_number, speaker, and utterance values, and no conversation_id belongs to more than one team.",
      },
      {
        title: "Inspect the code matrix",
        text: "The five code columns contain 1 when the coded idea is present in a row and 0 when it is absent. Multiple 1 values are allowed when the coding scheme supports multiple ideas in one segment. Do not replace missing judgments with 0 unless absence has actually been established by the coding process.",
        checkpoint: "Every code cell is an explicit 0 or 1, and the difference between absent, missing, and not-applicable is documented.",
      },
      {
        title: "Verify order and boundaries",
        text: "Sort by team_id, conversation_id, and line_number, then look for duplicates and gaps. Confirm that each conversation_id maps to one team and one discussion round. Conversation boundaries prevent moving windows from leaking across unrelated teams or events. Ordering is essential because the window uses nearby rows as its operational definition of context.",
        checkpoint: "Each team has one uniquely keyed six-line conversation numbered 1 through 6 with no duplicate row identifiers or cross-team conversation keys.",
      },
      {
        title: "Audit the codebook against excerpts",
        text: "Choose at least one positive and one negative example for every code. Ask whether a second trained coder could apply the definition, whether two codes overlap by design or by ambiguity, and whether segmentation hides a meaningful connection. A binary table does not remove the need for a defensible qualitative coding process.",
        checkpoint: "Each code has a definition, inclusion rule, exclusion rule, and linked example outside the numeric matrix.",
      },
      {
        title: "Create a data dictionary and validation record",
        text: "Record every column name, role, type, allowed values, and missing-data rule. Note that this dataset is synthetic and tiny. In a real analysis, include consent and de-identification decisions, coding procedures, reliability or consensus processes where appropriate, transformations, exclusions, and the software-ready file hash.",
        checkpoint: "Another analyst can explain every column and reproduce the validation checks without guessing.",
      },
    ],
    coreIdeas: [
      "ENA-ready data combine complete metadata with explicit code columns on every row.",
      "Conversation boundaries and row order determine which proximities can become connections.",
      "Raw excerpts and a codebook keep the computed network connected to qualitative evidence.",
    ],
    analysisChecks: [
      "Are identifiers complete on every row rather than visually implied by blank cells?",
      "Are code cells valid values with missingness handled explicitly?",
      "Can each row be traced back to an auditable source excerpt?",
      "Are transformations, exclusions, and ordering rules recorded?",
    ],
    methodBoundary:
      "Correct formatting is necessary but not sufficient for a valid ENA study. A tidy code matrix cannot repair weak construct definitions, unreliable segmentation, inappropriate conversation boundaries, privacy problems, or a mismatch between the research question and analytic unit.",
    sources: [
      {
        label: "Shaffer: Formatting Data for Epistemic Network Analysis",
        url: "https://www.epistemicnetwork.org/pdfs/2019/09/ENA-data-formatting.pdf",
      },
      ...foundationalSources,
    ],
    downloads: [...sharedDownloads],
  },
  {
    id: "academy-001",
    slug: "frame-an-ena-study-units-conversations-and-codes",
    sequence: 1,
    title: "Frame an ENA Study: Units, Conversations, and Codes",
    track: "research-design",
    level: "beginner",
    durationMinutes: 20,
    publishedAt: "2026-08-09",
    tags: ["research question", "units", "conversations", "coding scheme"],
    visual: "frame",
    visualAlt:
      "A research question mapped to ENA units, conversation boundaries, and code nodes",
    shortSummary:
      "Translate a relational research question into aligned units of analysis, conversation boundaries, and theory-linked codes before opening the software.",
    introduction: [
      "ENA is useful when the organization of connections matters, not only the frequency of individual ideas or actions. The method models co-occurrences among codes within a defined context, accumulates those connections for each unit, and places the resulting networks in a shared space for comparison.",
      "The most consequential choices therefore happen before a plot appears. A research question, unit of analysis, conversation boundary, segmentation rule, and coding scheme should form one coherent design. If those pieces answer different questions, the software may still produce a network, but its meaning will be unstable.",
    ],
    learningObjectives: [
      "Recognize a research question that calls for relational rather than frequency-only analysis.",
      "Define units, conversations, and codes as distinct parts of an ENA design.",
      "Write an analysis specification that links every modeling choice to theory and evidence.",
    ],
    caseStudy: {
      title: "Do scaffolds change how design ideas connect?",
      text: "A fictional study asks how teacher-design teams connect goals, student evidence, strategies, tradeoffs, and revisions during a feedback-activity review. Four teams use a reflection scaffold and four do not. The dataset is intentionally small and synthetic so the pathway can teach model logic without presenting invented findings as research evidence.",
    },
    steps: [
      {
        title: "Write a relational question",
        text: "Ask about the structure of connections: How do scaffolded and baseline teams differ in how they connect student evidence with proposed strategies and revisions? This is more aligned with ENA than asking only which group mentions evidence more often. State why co-occurrence within interaction context represents a meaningful relation for the phenomenon.",
        checkpoint: "The question names a relational pattern, a comparison, and the context in which proximity is meaningful.",
      },
      {
        title: "Choose the unit of analysis",
        text: "The unit identifies the network that will be accumulated and compared. In the teaching study, each team is one unit because the question concerns team reasoning. Choosing individual speakers instead would answer a different question and would require an account of how shared talk is assigned to people.",
        checkpoint: "You can complete the sentence: one network represents all coded connections for one team.",
      },
      {
        title: "Bound the conversation",
        text: "A conversation prevents connections from crossing contexts that should remain separate. Here, each design-review round is a conversation within a team. For moving-window accumulation, line order also matters. The boundary and window should reflect how long ideas remain meaningfully connected in this activity, not a convenient software default.",
        checkpoint: "The design states where a conversation starts and ends and why links should not cross that boundary.",
      },
      {
        title: "Define theory-linked codes",
        text: "Use a small fixed set that represents the constructs in the question: Goal, Evidence, Strategy, Tradeoff, and Revision. Define inclusion and exclusion rules, examples, segmentation, and whether multiple codes can occur on one row. Codes are analytical claims about evidence, not neutral labels generated by the plot.",
        checkpoint: "Each code has a definition, a counterexample, and a reason it belongs in the relational model.",
      },
      {
        title: "Specify the comparison and metadata",
        text: "Condition is comparison metadata, not a code. Decide in advance which units belong to baseline and scaffolded groups, which contextual fields should be retained, and which contrasts are exploratory. In a real study, plan sample size and statistical strategy before interpreting group distance.",
        checkpoint: "Grouping fields are separate from the codes whose connections form the networks.",
      },
      {
        title: "Write the model specification before analysis",
        text: "Create a one-page record containing the question, unit, conversation fields, row order, code columns, window rationale, weighting, normalization, rotation, planned groups, exclusions, and sensitivity checks. Mark decisions made before viewing results. This record turns the model from a collection of clicks into an auditable analysis.",
        checkpoint: "A second analyst could configure the intended model from the specification alone.",
      },
    ],
    coreIdeas: [
      "ENA answers questions about the structure of connections among coded elements.",
      "Units determine which networks exist; conversations determine where context is bounded.",
      "Codes, windows, and comparisons are theory-linked modeling decisions rather than neutral defaults.",
    ],
    analysisChecks: [
      "Would a frequency table alone answer the research question?",
      "Does one network correspond exactly to the stated unit of analysis?",
      "Can you justify every conversation boundary from the activity or discourse structure?",
      "Are codes defined before looking for a preferred network pattern?",
    ],
    methodBoundary:
      "ENA is appropriate when modeled co-occurrence is theoretically meaningful. It should not be chosen only because network graphics are attractive. The method does not decide the construct, unit, context, or causal estimand for the researcher.",
    sources: [...foundationalSources],
    downloads: [...sharedDownloads],
  },
];

export const academyLessons = [...academyLessonRecords].sort((a, b) => a.sequence - b.sequence);

export const academyTracks = [...new Set(academyLessons.map((lesson) => lesson.track))];
export const academyLevels = [...new Set(academyLessons.map((lesson) => lesson.level))];

export function getAcademyLesson(slug: string) {
  return academyLessons.find((lesson) => lesson.slug === slug);
}

export function getRelatedAcademyLessons(lesson: AcademyLesson, limit = 3) {
  return academyLessons
    .filter((candidate) => candidate.id !== lesson.id)
    .map((candidate) => ({
      candidate,
      sameTrack: candidate.track === lesson.track ? 1 : 0,
      distance: Math.abs(candidate.sequence - lesson.sequence),
    }))
    .sort((a, b) => b.sameTrack - a.sameTrack || a.distance - b.distance || a.candidate.sequence - b.candidate.sequence)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export function getAcademyLessonText(lesson: AcademyLesson) {
  return [
    ...lesson.introduction,
    ...lesson.learningObjectives,
    lesson.caseStudy.title,
    lesson.caseStudy.text,
    ...lesson.steps.flatMap((step) => [step.title, step.text, step.checkpoint]),
    ...lesson.coreIdeas,
    ...lesson.analysisChecks,
    lesson.methodBoundary,
  ].join(" ");
}
