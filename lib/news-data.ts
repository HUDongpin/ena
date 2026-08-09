import type { NewsArticle } from "./news-types";

export const newsArticles: NewsArticle[] = [
  {
    id: "ena-006",
    slug: "geriatric-caregiving-empathy-training-networks",
    title: "ENA mapped an empathy gap between real geriatric caregiving and training narratives",
    authors: ["Behdokht Kiafar", "Salam Daher", "Shayla Sharmin", "Asif Ahmmed", "Ladda Thiamwong", "Roghayeh Leila Barmaki"],
    venue: "6th International Conference on Quantitative Ethnography (ICQE 2024)",
    year: 2024,
    type: "conference",
    tags: ["geriatric care", "health professions education", "empathy", "interview data", "training design"],
    image: "/images/research/covers/ena-006-geriatric-caregiving.png",
    imageAlt: "A nursing assistant listens to an older adult while educators review connected patterns from caregiving interviews",
    summaryImage: "/images/research/summary/ena-006-geriatric-caregiving-summary.png",
    summaryImageAlt: "A nursing assistant listens to an older adult while educators review connected patterns from caregiving interviews",
    summaryAudio: "/audio/research/ena-006-geriatric-caregiving-summary.m4a",
    summaryAudioTitle: "Listen to the reviewed conference-paper summary",
    shortSummary:
      "Interviews with ten nursing assistants showed different relational patterns in accounts of real caregiving and prior training. ENA linked empathy strongly with communication in real-life narratives, while training narratives emphasized communication with critical thinking and gave empathy a weaker role.",
    fullSummary: `Kiafar and colleagues asked whether the experience of caring for older adults is represented adequately in nursing assistants' training. Their ICQE 2024 conference paper uses Epistemic Network Analysis to compare how ten nursing assistants described real caregiving with how they described previous training. The purpose was exploratory and practical: identify patterns that could inform more realistic geriatric-care simulations.

The participants were nine women and one man, aged 19 to 28, with between five months and five years of caregiving experience. Each completed an approximately one-hour online interview covering daily work, interactions with older adults, challenging incidents, prior training, and recommendations for simulation design. The cleaned transcripts contained more than 810 utterances. Two researchers coded each utterance for the possible presence of communication, empathy, flexibility, and critical thinking. More than one code could be assigned to an utterance. The reported coding agreement was 93.7 percent, with Cohen's kappa of .863.

The researchers used ENA Web Tool version 1.7.0. Each interview question formed a stanza, and individual caregivers were the units used to calculate ENA scores. The analysis normalized networks for different numbers of coded lines, used singular value decomposition, and compared Real and Training response categories. The first ENA dimension explained 30.6 percent of variance and separated the two categories in the reported test. Real-life narratives were characterized by a strong connection between empathy and communication. Training narratives showed their strongest connection between communication and critical thinking, while empathy was small and weakly connected.

The pattern suggests a concrete design question. If empathy and communication are closely coupled in everyday geriatric care but are weakly coupled in remembered training, simulation designers may need scenarios in which learners must understand an older adult's perspective while making and communicating decisions. ENA made that gap visible as a relationship among codes rather than as isolated counts.

The evidence must remain bounded. This was an exploratory sample of ten caregivers, based on recalled accounts rather than observed behavior. Older adults were not interviewed, and the participants represented a narrow age and experience range. The same caregivers contributed Real and Training responses, yet the reported group comparison used an unequal-variance two-sample test; the paper does not establish that the patterns generalize to a wider workforce. The defensible contribution is therefore a preliminary network-based account and an actionable hypothesis for training design, not proof that existing geriatric education systematically lacks empathy.`,
    keyTakeaways: [
      "Real-world caregiving accounts connected communication strongly with empathy.",
      "Training accounts connected communication more strongly with procedural critical thinking and gave empathy little prominence.",
      "The small interview sample supports an exploratory design signal, not a population-wide conclusion about geriatric training.",
    ],
    whyItMatters:
      "The study shows how ENA can turn stakeholder interviews into a concrete training-design question while making the limits of a small qualitative sample visible.",
    sourceUrl: "https://doi.org/10.1007/978-3-031-76335-9_14",
    sourceUrls: [
      { label: "Springer proceedings chapter", url: "https://doi.org/10.1007/978-3-031-76335-9_14" },
      { label: "NSF-hosted full text", url: "https://par.nsf.gov/servlets/purl/10555538" },
    ],
    doi: "10.1007/978-3-031-76335-9_14",
    createdAt: "2026-08-09",
  },
  {
    id: "ena-005",
    slug: "adaptive-scaffolding-learning-strategy-networks",
    title: "Learners valued adaptive scaffolds when suggestions fit their writing strategy",
    authors: ["Tongguang Li", "Jionghao Lin", "Sehrish Iqbal", "Zachari Swiecki", "Yi-Shan Tsai", "Yizhou Fan", "Dragan Gašević"],
    venue: "5th International Conference on Quantitative Ethnography (ICQE 2023)",
    year: 2023,
    type: "conference",
    tags: ["adaptive scaffolding", "self-regulated learning", "academic writing", "learner perception", "performance"],
    image: "/images/research/covers/ena-005-adaptive-scaffolding.png",
    imageAlt: "University learners use contrasting writing strategies while a researcher examines adaptive feedback networks",
    summaryImage: "/images/research/summary/ena-005-adaptive-scaffolding-summary.png",
    summaryImageAlt: "University learners use contrasting writing strategies while a researcher examines adaptive feedback networks",
    summaryAudio: "/audio/research/ena-005-adaptive-scaffolding-summary.m4a",
    summaryAudioTitle: "Listen to the reviewed conference-paper summary",
    shortSummary:
      "ENA linked university learners' reported writing strategies with whether they perceived automated scaffolds as adaptive. Reading first and then writing connected most strongly with perceived adaptivity and higher performance, but the small interview sample supports association rather than causation.",
    fullSummary: `Li and colleagues investigate a subtle problem in adaptive learning: a system can change its support, yet a learner may not experience that support as adaptive. Their ICQE 2023 paper uses Epistemic Network Analysis to model connections among reported writing strategies, perceptions of adaptivity, and essay performance after a two-hour source-based academic-writing task.

The broader task involved 253 university learners in a 16-week academic-writing course for non-native English speakers. Ninety-four learners received adaptive scaffolding, and 22 of them volunteered for follow-up interviews. The abstract calls the interviewees undergraduates, while the Methods section describes the course participants as graduate learners, so the safest public description is simply university learners. During the task, students read materials on artificial intelligence, differentiation, and scaffolding, then wrote a 300 to 400 word essay. Five prompts appeared at planned times. A rule-based mechanism withheld a suggestion if the relevant learner behavior had already been detected.

Mandarin interviews were transcribed, divided by conversational turn, and consensus-coded by two native-Mandarin researchers. The analysis used four strategy codes plus two perception codes: perceived as adaptive and not perceived as adaptive. ENA treated each participant as a unit and the whole interview as a stanza. That choice allowed strategy and perception statements made far apart in the interview to connect, but it also removed temporal locality. The overall network used an optimized unit-circle layout; the performance comparison used means rotation, network subtraction, and a Mann-Whitney U test.

The strongest connection to perceived adaptivity was a read-first-then-write strategy. The strongest connection to non-adaptivity was writing while reading and taking notes. High and low performers differed on the first ENA dimension in the reported test, with U equal to 98, p below .01, and r equal to .63. The second dimension did not differ. Learners who reported reading first, then writing, and who perceived the support as adaptive tended to perform better. However, some learners perceived the scaffolds as adaptive and still obtained lower scores.

The result is relational, not causal. The ENA corpus contains only 22 self-selected interviewees from the adaptive condition, strategies were self-reported rather than reconstructed from trace data, and the whole-interview stanza can connect ideas separated by many minutes. The paper therefore does not show that one strategy causes higher performance or that perceived adaptivity makes a scaffold effective. It shows how ENA can expose alignment and mismatch among learner strategy, system support, and outcome, generating sharper questions for larger, multimodal studies.`,
    keyTakeaways: [
      "Learners were more likely to describe support as adaptive when its suggestions aligned with the strategy they reported using.",
      "Reading first and then writing was connected with perceived adaptivity and higher performance, but perceived fit alone did not guarantee success.",
      "Whole-interview ENA revealed relational patterns while sacrificing the sequence and timing of strategy use.",
    ],
    whyItMatters:
      "The paper demonstrates how ENA can connect qualitative perceptions with performance data and help designers ask whether adaptive support actually fits the learner's ongoing strategy.",
    sourceUrl: "https://doi.org/10.1007/978-3-031-47014-1_1",
    sourceUrls: [
      { label: "Springer proceedings chapter", url: "https://doi.org/10.1007/978-3-031-47014-1_1" },
      { label: "Monash University record", url: "https://research.monash.edu/en/publications/do-learners-appreciate-adaptivity-anepistemic-network-analysis-of/" },
    ],
    doi: "10.1007/978-3-031-47014-1_1",
    createdAt: "2026-08-09",
  },
  {
    id: "ena-004",
    slug: "clinical-team-spatial-behaviour-networks",
    title: "ENA turned nursing students' movement traces into interpretable team patterns",
    authors: ["Gloria Milena Fernandez-Nieto", "Roberto Martinez-Maldonado", "Kirsty Kitto", "Simon Buckingham Shum"],
    venue: "11th International Conference on Learning Analytics and Knowledge (LAK21)",
    year: 2021,
    type: "conference",
    tags: ["nursing simulation", "spatial behavior", "multimodal data", "teacher interpretation", "learning analytics"],
    image: "/images/research/covers/ena-004-clinical-spatial-behaviour.png",
    imageAlt: "Nursing students coordinate around a simulation patient while educators review spatial network patterns",
    summaryImage: "/images/research/summary/ena-004-clinical-spatial-behaviour-summary.png",
    summaryImageAlt: "Nursing students coordinate around a simulation patient while educators review spatial network patterns",
    summaryAudio: "/audio/research/ena-004-clinical-spatial-behaviour-summary.m4a",
    summaryAudioTitle: "Listen to the reviewed conference-paper summary",
    shortSummary:
      "A LAK21 study applied ENA to wearable positioning traces from 25 nursing students in clinical simulations. Educators could build meaningful accounts from the networks after a short orientation, but often mistook ENA geometry for the physical ward layout.",
    fullSummary: `Fernandez-Nieto and colleagues ask whether high-frequency location data can become meaningful feedback for clinical educators. Their LAK21 paper applies Epistemic Network Analysis to the movement of nursing students during team simulations, then studies how teachers interpret the resulting diagrams. The work is both methodological and user-facing: it tests ENA on spatial rather than discourse data and examines whether the model communicates useful patterns to practitioners.

The study involved five third-year nursing classes and one volunteer team from each class. The five teams contained 25 students in total, with four to six students per team. Each team managed a manikin patient experiencing an allergic reaction. Wearable indoor-positioning tags captured x and y coordinates at two to three observations per second, which the researchers downsampled to one observation per second. Researchers and nursing teachers jointly defined nine meaningful spatial or activity codes, including the medicine room, proximity to the intravenous device, human patient or manikin, the bed footer, other classroom areas, asking for help, and receiving help.

Each second became a segment, while simulation phases formed stanzas. ENA nodes represented spaces or help activities, and connections represented transitions among those states. The team generated networks for all five groups. Five educators who had taught the simulation then completed recorded think-aloud sessions while examining the diagrams. The evaluation emphasized two intentionally contrasting teams.

Four of the five teachers could interpret prominent strong and weak connections after a brief walkthrough. They consistently read one team's network as showing unusually high reliance on teacher help and another as showing greater focus on the patient. Teachers saw possible uses for comparing teams, reflecting on their instruction, planning interventions, and revising the simulation. Yet every teacher at some point confused the abstract placement of ENA nodes with physical locations on the ward floorplan, and one teacher could not interpret the diagrams. The authors therefore proposed combining ENA-derived relationships with a familiar spatial map.

The findings are exploratory. The sample came from one course, involved five teams and five teachers, and the usability discussion foregrounded two cases selected for contrast. The study did not test whether network feedback improved learning, teamwork, or clinical performance, and it reports no inferential link between movement patterns and outcomes. Its defensible contribution is that ENA can summarize complex spatial traces in ways educators may find meaningful, while the visualization still requires careful translation for its intended audience.`,
    keyTakeaways: [
      "ENA can model meaningful relationships in high-frequency spatial sensor data, not only in coded discourse.",
      "Four of five educators derived useful team-performance narratives after a brief introduction to the diagrams.",
      "Abstract ENA node positions were easily mistaken for physical locations, so stakeholder-facing views should connect networks to familiar maps.",
    ],
    whyItMatters:
      "This study extends ENA into embodied, multimodal learning analytics and shows that analytical validity and human interpretability must be designed together.",
    sourceUrl: "https://doi.org/10.1145/3448139.3448176",
    sourceUrls: [
      { label: "ACM proceedings paper", url: "https://doi.org/10.1145/3448139.3448176" },
      { label: "Author-hosted full text", url: "https://simon.buckinghamshum.net/wp-content/uploads/2021/04/Fernandez-Nieto_etal_LAK21.pdf" },
    ],
    doi: "10.1145/3448139.3448176",
    createdAt: "2026-08-09",
  },
  {
    id: "ena-003",
    slug: "socioemotional-learning-community-ethnography",
    title: "ENA refined an ethnography of socioemotional development in a learning community",
    authors: ["Yotam Hod", "Shir Katz", "Brendan Eagan"],
    venue: "Computers & Education",
    year: 2020,
    type: "journal",
    tags: ["quantitative ethnography", "socioemotional learning", "knowledge building", "group development", "qualitative research"],
    image: "/images/research/covers/ena-003-socioemotional-ethnography.png",
    imageAlt: "Graduate learners discuss ideas while socioemotional connections form across their notes and conversation",
    summaryImage: "/images/research/summary/ena-003-socioemotional-ethnography-summary.png",
    summaryImageAlt: "Graduate learners discuss ideas while socioemotional connections form across their notes and conversation",
    summaryAudio: "/audio/research/ena-003-socioemotional-ethnography-summary.m4a",
    summaryAudioTitle: "Listen to the reviewed journal-article summary",
    shortSummary:
      "Researchers applied ENA to 1,170 Knowledge Forum notes from an 18-student graduate learning community. The networks distinguished four stages of group development, corroborated an earlier qualitative ethnography, and revealed additional socioemotional relationships.",
    fullSummary: `Hod, Katz, and Eagan examine how a computational model can strengthen, question, and extend a qualitative ethnography rather than replace it. Their 2020 Computers & Education article studies socioemotional development in a Humanistic Knowledge Building Community and uses Epistemic Network Analysis to revisit a previously developed stage-based interpretation.

The setting was an intensive 13-week graduate course at the University of Haifa with 18 students. The course was designed as a learning community in which participants investigated learning communities while also building one themselves. The researchers analyzed 1,170 notes posted to Knowledge Forum, producing 1,884 coded lines. Six socioemotional categories were used: desire, dynamics, feelings, life outside, empathy, and likeness. These codes represented patterns such as motivation, interpersonal dynamics, emotional expression, connections beyond the course, empathic attention, and perceived similarity.

The authors first drew on the existing qualitative ethnography, which described four stages of group development. They then used ENA Web Tool version 1.6.0 to model how socioemotional codes were connected within each stage. A note was the unit of analysis, indexed by its day, stage, author, codes, and readership. The moving window included each note and the three previous notes, allowing nearby contributions to contribute to one network. Networks were aggregated and compared visually, statistically, and by returning to the underlying discourse.

The ENA model robustly distinguished the four stages. It supported important parts of the original ethnography, including changing relationships among group dynamics, emotional expression, connectedness, and prior experience. It also refined the account by revealing connections that were less visible in the stage narrative alone. The method gave the researchers a shared geometric space in which every note-level network could be compared while still permitting close reading of the original messages.

The value of the paper is methodological as much as substantive. ENA did not independently discover a universal sequence of group development, nor did the network positions prove that one socioemotional pattern caused a group to advance. The model depended on a specific community, coding scheme, stanza choice, and moving window. The authors used the quantitative representation to test the coherence of an ethnographic interpretation and locate further qualitative questions. The study therefore provides a strong example of mixed-method reasoning: theory and close reading define meaningful codes; ENA compares their relational structure; and interpretation returns to the data and setting that gave those relationships meaning.`,
    keyTakeaways: [
      "ENA distinguished four stages of socioemotional group development in the coded learning-community discourse.",
      "The model corroborated parts of the earlier ethnography and also revealed relationships that invited further qualitative interpretation.",
      "Network results remained dependent on the coding scheme, moving window, stage definitions, and the specific classroom community.",
    ],
    whyItMatters:
      "The paper demonstrates a responsible quantitative-ethnography workflow in which ENA sharpens qualitative claims and directs researchers back to the source evidence.",
    sourceUrl: "https://doi.org/10.1016/j.compedu.2020.103943",
    sourceUrls: [
      { label: "Computers & Education article", url: "https://doi.org/10.1016/j.compedu.2020.103943" },
      { label: "Accessible full text", url: "https://www.epistemicanalytics.org/images/pdf/Refining-qualitative-ethnographies-using-Epistemic-Network-Analysis.pdf" },
    ],
    doi: "10.1016/j.compedu.2020.103943",
    createdAt: "2026-08-09",
  },
  {
    id: "ena-002",
    slug: "social-cognitive-presence-online-discussions",
    title: "ENA connected social presence with stages of cognitive presence in online discussions",
    authors: ["Vitor Rolim", "Rafael Ferreira", "Rafael Dueire Lins", "Dragan Gašević"],
    venue: "The Internet and Higher Education",
    year: 2019,
    type: "journal",
    tags: ["community of inquiry", "online discussion", "social presence", "cognitive presence", "instructional scaffolding"],
    image: "/images/research/covers/ena-002-community-of-inquiry.png",
    imageAlt: "Graduate learners and a researcher examine networks connecting online social and cognitive activity",
    summaryImage: "/images/research/summary/ena-002-community-of-inquiry-summary.png",
    summaryImageAlt: "Graduate learners and a researcher examine networks connecting online social and cognitive activity",
    summaryAudio: "/audio/research/ena-002-community-of-inquiry-summary.m4a",
    summaryAudioTitle: "Listen to the reviewed journal-article summary",
    shortSummary:
      "ENA modeled 1,747 coded Moodle messages from 81 graduate students across six online course offerings. Affective social presence connected more strongly with higher cognitive-presence phases, while interactive messages connected more with earlier phases of inquiry.",
    fullSummary: `Rolim and colleagues use Epistemic Network Analysis to investigate a central claim in the Community of Inquiry framework: social presence and cognitive presence are related, but their relationship is not captured well by treating each indicator as an isolated frequency. Their 2019 article in The Internet and Higher Education models the connections among coded indicators in asynchronous online discussions.

The study used six offerings, from 2008 to 2011, of a fully online, research-intensive master's course in software engineering at a Canadian public university. Eighty-one students produced 1,747 Moodle discussion messages. The transcripts were coded for social-presence indicators and the four cognitive-presence phases: triggering event, exploration, integration, and resolution. The corpus also supported a comparison between a control group of 37 students with 845 messages and a scaffolded group of 44 students with 902 messages.

ENA was applied at the student level for three purposes. First, it modeled connections between social and cognitive presence. Second, it compared instructional roles and the scaffolded and control conditions. Third, it examined how the connections changed across the weeks of a course. This relational design let the authors inspect whether particular forms of social interaction tended to appear in the same local contexts as particular phases of inquiry.

The networks showed that affective social-presence indicators were more strongly associated with the higher cognitive-presence phases of integration and resolution. Interactive indicators were connected more closely with the earlier phases of triggering events and exploration. Students in the scaffolded condition were positioned closer to higher levels of cognitive presence than students in the control condition. The longitudinal networks also made it possible to see how the composition of relationships changed as course activity unfolded.

These results should not be reduced to a claim that social presence automatically produces deeper learning. The evidence comes from coded discourse in one graduate course design, and the network relationships depend on the Community of Inquiry coding scheme, the definition of local context, and the instructional conditions. The comparison is useful because it shows how an intervention corresponded with different relational patterns, but the network alone does not isolate a causal mechanism or establish learning beyond the discussion data. The contribution is a method for asking more precise questions about how social and cognitive processes co-occur over time, with visual and statistical comparisons that can be returned to the original messages for interpretation.`,
    keyTakeaways: [
      "Affective social-presence indicators connected more strongly with integration and resolution, the higher phases of cognitive presence.",
      "Interactive social messages connected more with triggering events and exploration, the earlier phases of inquiry.",
      "The course and scaffold comparisons reveal relational patterns in discourse but do not by themselves prove a causal effect on learning.",
    ],
    whyItMatters:
      "The study shows why ENA is useful for learning research: it represents how theoretically meaningful processes connect, change, and differ across instructional conditions.",
    sourceUrl: "https://doi.org/10.1016/j.iheduc.2019.05.001",
    sourceUrls: [
      { label: "The Internet and Higher Education article", url: "https://doi.org/10.1016/j.iheduc.2019.05.001" },
      { label: "Accessible full text", url: "https://www.epistemicanalytics.org/images/pdf/1-s2.0-S1096751619300235-main.pdf" },
    ],
    doi: "10.1016/j.iheduc.2019.05.001",
    createdAt: "2026-08-09",
  },
  {
    id: "ena-001",
    slug: "coordinated-gaze-collaboration-networks",
    title: "Coordinated gaze became a network of collaboration and repair",
    authors: ["Sean Andrist", "Wesley Collier", "Michael Gleicher", "Bilge Mutlu", "David Shaffer"],
    venue: "Frontiers in Psychology",
    year: 2015,
    type: "journal",
    tags: ["gaze coordination", "collaboration", "eye tracking", "multimodal interaction", "communication repair"],
    image: "/images/research/covers/ena-001-coordinated-gaze.png",
    imageAlt: "Two research participants coordinate gaze during a shared sandwich-making task as gaze targets form a network",
    summaryImage: "/images/research/summary/ena-001-coordinated-gaze-summary.png",
    summaryImageAlt: "Two research participants coordinate gaze during a shared sandwich-making task as gaze targets form a network",
    summaryAudio: "/audio/research/ena-001-coordinated-gaze-summary.m4a",
    summaryAudioTitle: "Listen to the reviewed journal-article summary",
    shortSummary:
      "Thirteen dyads completed 26 collaborative sandwich-making interactions while wearing synchronized mobile eye trackers. ENA modeled the two partners' gaze targets jointly, separating task phases and distinguishing sequences that involved communication breakdowns and repairs.",
    fullSummary: `Andrist and colleagues demonstrate that Epistemic Network Analysis can model coordinated behavior, not only coded speech. Their 2015 Frontiers in Psychology article examines how two people's gaze patterns unfold during a shared task and how those patterns differ when communication breaks down and must be repaired.

The researchers recruited 13 pairs of previously unacquainted participants. Each dyad completed a collaborative sandwich-making task twice, reversing the instructor and worker roles, for 26 interactions. The instructor verbally referred to visible ingredients, while the worker selected and assembled them. Synchronized mobile eye trackers recorded where both participants looked, and speech was transcribed so the interaction could be divided into reference-action sequences and phases.

ENA jointly modeled the gaze targets of both participants. Nodes represented the targets at which each partner could look, and connections represented the likelihood that gaze targets co-occurred within a 50 millisecond segment. The authors ran three analyses. One compared the structure of gaze across five phases of a reference-action sequence. A second examined how the time lag between partners' gaze changed across those phases. A third compared sequences containing breakdowns or verbal repairs with sequences that proceeded without repair.

The networks separated the interaction phases and revealed an orderly cycle in coordinated gaze. Leadership shifted between instructor and worker as a reference was introduced, interpreted, acted on, and completed. Alignment rose and fell rather than remaining constant. Sequences that eventually required repair also showed different gaze relationships, including differences visible before the verbal repair occurred. That observation suggests the possibility of detecting emerging misunderstanding from a relational pattern rather than from one person's gaze in isolation.

The findings are specific to a controlled, object-focused collaboration with a small sample of dyads. ENA did not prove that a particular gaze connection caused success or failure, and the paper's suggestion of early repair detection is a design implication rather than a deployed classifier. Gaze targets, time slices, task phases, and interaction roles were carefully defined for this study; other settings would require new theory and validation. The article's lasting contribution is methodological: by representing two streams of behavior in one network, ENA made their coordination, timing, and changing relational structure available for comparison while retaining a path back to the interaction sequences that produced the model.`,
    keyTakeaways: [
      "ENA jointly modeled both partners' gaze targets, avoiding a one-person-at-a-time view of collaboration.",
      "The networks distinguished five task phases and showed gaze leadership shifting as reference and action unfolded.",
      "Repair sequences had different gaze patterns, but the small controlled study does not establish a general-purpose breakdown detector.",
    ],
    whyItMatters:
      "The study is a clear demonstration that ENA can represent dynamic multimodal behavior and make coordination itself, rather than isolated events, the object of analysis.",
    sourceUrl: "https://doi.org/10.3389/fpsyg.2015.01016",
    sourceUrls: [
      { label: "Frontiers full article", url: "https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.01016/full" },
      { label: "DOI record", url: "https://doi.org/10.3389/fpsyg.2015.01016" },
    ],
    doi: "10.3389/fpsyg.2015.01016",
    createdAt: "2026-08-09",
  },
];

export const newsYears = [...new Set(newsArticles.map((article) => article.year))].sort((a, b) => b - a);

export function getNewsArticle(slug: string) {
  return newsArticles.find((article) => article.slug === slug);
}

export function getRelatedNewsArticles(article: NewsArticle, limit = 3) {
  const tags = new Set(article.tags);

  return newsArticles
    .filter((candidate) => candidate.id !== article.id)
    .map((candidate) => ({
      candidate,
      overlap: candidate.tags.filter((tag) => tags.has(tag)).length,
    }))
    .sort((a, b) => b.overlap - a.overlap || b.candidate.year - a.candidate.year || b.candidate.id.localeCompare(a.candidate.id))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
