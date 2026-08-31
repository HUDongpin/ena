# ENA Public Knowledge — Master Design System

> Route boundary: apply this system to Home, Mission, News, Academy, News topics,
> and News/Academy detail pages. OPEN ENA and About keep their existing page-level
> design systems. Shared navigation and footer remain visually stable.

**Project:** ENA Public Knowledge

**Direction:** premium scientific editorial publication + research-tool gateway

**Design dials:** variance 7/10 · motion 5/10 · density 4/10
**Source:** `ui-ux-pro-max` academic/research typography, institutional palette,
accessibility, interaction, responsive, and Next.js guidance; the tool's unrelated
App Store landing-page match was explicitly rejected after visual audit.

## Design thesis

ENA makes invisible relationships visible. The public site should therefore feel
like a rigorous research journal whose diagrams have come alive: authoritative,
precise, editorial, calm, and unmistakably relational. Hierarchy comes from scale,
spacing, rules, typography, and composition—not from repeating rounded cards.

### Experience principles

1. **Evidence before decoration.** Diagrams, citations, metadata, and learning
   sequences are first-class information, never ornamental filler.
2. **Editorial hierarchy.** Every page has one dominant idea, a clear supporting
   argument, and visibly subordinate details.
3. **Relational identity.** Fine rules, nodes, lines, and connected sequences echo
   ENA without turning the interface into a literal network diagram everywhere.
4. **Quiet confidence.** Baby Blue is a precise brand accent. Deep navy and warm
   paper provide authority; shadows and rounded corners are rare and intentional.
5. **Multilingual by construction.** Layouts tolerate long labels, RTL reading,
   CJK text, and system font fallbacks without fixed-height copy containers.

## Color tokens

| Role | Token | Value | Use |
|---|---|---:|---|
| Deep ink | `--ink` | `#101D2E` | Primary text, graphic structure |
| Navy | `--nav-deep` | `#0A1728` | Manifesto panels, high-authority surfaces |
| Body | `--muted` | `#35465B` | Long-form copy; AA contrast on light surfaces |
| Secondary | `--faint` | `#5F6F83` | Metadata only, never critical body text |
| ENA Baby Blue | `--accent` | `#89CFF0` | Primary action, nodes, active state |
| Accessible blue | `--accent-strong` | `#075985` | Links, labels, focus-adjacent text |
| Light blue | `--accent-soft` | `#E4F5FC` | Highlight field, not low-contrast text |
| Page | `--page` | `#F3F6F5` | Cool research-canvas background |
| Warm paper | `--premium-paper` | `#F3F2EC` | Editorial section contrast |
| White | `--surface-strong` | `#FFFFFF` | Reading surfaces |
| Research gold | `--premium-gold` | `#875817` | Small numeric/sequence accents only |
| Border | `--line` | `#D4DEE2` | Rules and quiet boundaries |
| Strong border | `--line-strong` | `#9FCBDC` | Active/meaningful boundaries |

Do not put normal-size white text on Baby Blue. Use deep ink on Baby Blue. Use
`#075985` rather than pale blue for links on light backgrounds. Gold is not a CTA
color and should remain a sparse editorial accent.

## Typography

The body and UI continue to use the optimized local Next.js Geist setup, with
existing Noto/system fallbacks for the site's multilingual range.

Display headings use an operating-system editorial serif stack so the redesign
does not add a blocking font request and still has CJK fallbacks:

```css
--premium-serif: "Iowan Old Style", "Palatino Linotype", "Songti TC",
  "Songti SC", "Noto Serif CJK TC", "Noto Serif CJK SC", "Noto Serif",
  Georgia, serif;
```

| Role | Size | Line height | Weight |
|---|---|---|---|
| Display | `clamp(4rem, 7.6vw, 7.8rem)` | `0.86–0.92` | `540–560` |
| Section heading | `clamp(3rem, 5.7vw, 6rem)` | `0.98` | `560` |
| Card heading | `clamp(1.8rem, 2.5vw, 2.6rem)` | `1.04` | `580` |
| Body | `1–1.19rem` | `1.7–1.92` | `400–650` |
| Metadata | `0.66–0.78rem` | `1.3–1.55` | `720–850` |

Body copy must remain at least 16px. Long-form prose stays at or below 72
characters per line where practical. Eyebrows use Geist Mono and may be uppercase;
paragraph copy must not use forced uppercase or tight tracking.

## Geometry and spacing

- Base rhythm: 4/8px. Section tiers: 48, 72, 96, 128, 176px.
- Public editorial panels use 2–7px corner radii. Pills are reserved for compact
  metadata and the pre-existing global language/navigation controls.
- Use one-pixel editorial rules more often than containers.
- Cards may translate at most 6px on hover and must retain their layout bounds.
- Reading surfaces use no shadow or a single quiet shadow tier. Hero plates may
  use a Baby Blue offset frame to create a recognizable ENA motif.

## Page patterns

### Home

- Oversized editorial proposition paired with a tilted research plate.
- Move directly from the hero into the dark OPEN ENA gateway; do not insert a
  separate principle statement band between them.
- Dark OPEN ENA gateway is a product proof section, not another generic card.
- Workflow reads as a numbered research sequence.
- Questions use an asymmetric editorial grid with one dominant card.

### Mission

- Full-bleed navy manifesto hero.
- Move directly from the manifesto hero into the model section; the former
  network-figure definition spread is intentionally omitted.
- Model and principles use numbered rules, not repeated soft cards.

### News and Academy collections

- Hero uses one full-width editorial title-and-intro column, without a side
  evidence/learning panel or vertical divider.
- Filter controls remain reachable but never dominate the first viewport.
- Every result uses the same card geometry in a two-column editorial grid,
  which collapses to one column on small screens.
- Search, select, reset, pagination, and cards have 44px-or-larger targets.

### Long-form detail

- Hero image/visual and title form one balanced editorial spread.
- Main prose uses a white reading sheet and a sticky supporting sidebar on desktop.
- Source links are visually primary; tags and metadata remain subordinate.
- Related content uses a calm grid on warm paper.

## Interaction and motion

- Standard transitions: 160–220ms; hero entry: 480–560ms.
- Animate transform and opacity only. Never animate layout dimensions.
- Hover is enhancement only: all content and actions work on touch/keyboard.
- Focus rings remain visible and use the accessible strong blue.
- `prefers-reduced-motion: reduce` removes entrance movement and hover transforms.
- Avoid parallax, scroll-jacking, carousel auto-play, and decorative GSAP sequences.

## Accessibility and responsive contract

- Normal text contrast ≥4.5:1; large text and graphic boundaries ≥3:1.
- Interactive targets ≥44×44px with at least 8px separation where adjacent.
- Sequential heading hierarchy; one H1 per page; meaningful image alt text.
- No information encoded by color alone.
- No horizontal page scroll at 320, 375, 390, 414, 768, 1024, or 1440px.
- Verify RTL at Arabic routes and long-copy tolerance on CJK/European locales.
- Sticky filters and sidebars become normal flow on narrower viewports.
- Browser zoom and text resizing must remain enabled.

## Forbidden patterns

- Repeating identical rounded cards for every level of information.
- Pale gray text on pale surfaces.
- Baby Blue used for long text or over large undifferentiated backgrounds.
- Emoji as structural icons; mixed icon families; raw ad-hoc colors in components.
- Hover-only affordances, invisible focus, fixed-height copy blocks, or clipped RTL.
- Decorative motion without meaning or any motion that causes layout shift.
- Changes to OPEN ENA or About page-specific styling under this design pass.

## Pre-delivery gate

- [ ] TypeScript, unit tests, and production build pass.
- [ ] 375, 768, 1024, and 1440px screenshots reviewed.
- [ ] No horizontal overflow or sticky-content occlusion.
- [ ] Keyboard focus, filter labels, current states, and touch targets checked.
- [ ] Reduced-motion screenshots/behavior checked.
- [ ] Arabic RTL and at least one CJK route checked.
- [ ] OPEN ENA and About page structure/source remain outside the scoped diff.
