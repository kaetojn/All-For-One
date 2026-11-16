---
name: All For One
description: A private training journal on ivory paper, kept in ink, with a bear cub who turns up for the good moments.
colors:
  paper: "#f6f4ef"
  card: "#fffefb"
  ink: "#1b1a17"
  muted: "#6f6a61"
  faint: "#efebe4"
  line: "rgba(27, 26, 23, .1)"
  leather: "#9a5c32"
  leather-soft: "#f5ece3"
  amber: "#c99a5b"
  good: "#4d7f69"
  good-soft: "#ebf1ec"
  warn: "#7d5418"
  warn-bg: "#f7efdf"
  stop: "#8c2f25"
  stop-bg: "#f8e9e6"
  paper-dark: "#121110"
  card-dark: "#1a1917"
  ink-dark: "#f1ede6"
  muted-dark: "#948e84"
  faint-dark: "#24221f"
  line-dark: "rgba(241, 237, 230, .12)"
  leather-dark: "#cf9a6c"
  leather-soft-dark: "#2b2119"
  good-dark: "#86b8a0"
  good-soft-dark: "#1b2621"
  warn-dark: "#e2bd7e"
  warn-bg-dark: "#2b2418"
  stop-dark: "#f0a79c"
  stop-bg-dark: "#331c19"
  bear-fur: "#b98250"
  bear-cream: "#f4e4c9"
  bear-ink: "#2a211c"
  bear-band: "#5f8f79"
  bear-blush: "#e59f8c"
typography:
  display:
    fontFamily: 'ui-serif, "New York", "Iowan Old Style", "Palatino Linotype", Georgia, serif'
    fontSize: "2.3rem"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  headline:
    fontFamily: 'ui-serif, "New York", "Iowan Old Style", "Palatino Linotype", Georgia, serif'
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  title:
    fontFamily: 'ui-serif, "New York", "Iowan Old Style", "Palatino Linotype", Georgia, serif'
    fontSize: "1.3rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  stat:
    fontFamily: 'ui-serif, "New York", "Iowan Old Style", "Palatino Linotype", Georgia, serif'
    fontSize: "1.7rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: '"tnum"'
  label:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.14em"
  button:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.9rem"
    fontWeight: 600
    letterSpacing: "0.01em"
rounded:
  sm: "8px"
  button: "10px"
  md: "12px"
  stage: "14px"
  card: "18px"
  pill: "99px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "22px"
  card: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 20px"
    height: "44px"
  button-go:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 20px"
    height: "48px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 20px"
    height: "44px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.leather}"
    padding: "0"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 15px"
    height: "34px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 15px"
    height: "34px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "0"
    padding: "8px 0 10px"
  notice:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn}"
    rounded: "{rounded.md}"
    padding: "16px 18px"
  alert:
    backgroundColor: "{colors.stop-bg}"
    textColor: "{colors.stop}"
    rounded: "{rounded.md}"
    padding: "16px 18px"
  note:
    backgroundColor: "{colors.leather-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px 18px"
  tick:
    backgroundColor: "transparent"
    rounded: "50%"
    size: "36px"
  tick-done:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "50%"
    size: "36px"
  nav-tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    height: "46px"
  nav-tab-active:
    textColor: "{colors.ink}"
---

# Design System: All For One

## Overview

**Creative North Star: "The Training Journal"**

All For One looks like a well-kept personal notebook: ivory paper, dark ink, hairline rules, totals set in a book serif. It is a private record its one owner opens every day, so it is calm, legible and quick, not loud or gamified. The pages are mostly ink on paper; colour shows up only when it means something (done, rest, caution, stop), and the single warm accent, Tanned Leather, is used about as sparingly as a bookmark ribbon.

The density is that of a phone journal: one narrow column (480px max), generous margins, small precise controls, and numbers in tabular figures so weights and reps line up. Serif carries meaning (headlines, totals, the day's workout title, the effort win line); the system sans carries the work (labels, buttons, body). Small uppercase tracked labels act like the printed headings of a ruled page.

The one exception to the restraint is the bear cub, a toon-shaded companion drawn in its own palette. It earns that exception by being rare: it appears only at moments worth marking, in a slot of its own, and is still the rest of the time.

**Key Characteristics:**
- Ivory paper and near-black ink; light and dark themes are first-class.
- Hairline borders (10–12% ink) do most of the structuring; shadows are faint.
- Serif for headlines and numbers, system sans for everything operational.
- Small uppercase tracked labels as section markers.
- Ink-filled pills and circles for "selected" and "done"; no colour fills for state.
- One leather accent, plus semantic tints for good, warning and stop.
- The bear's colours appear nowhere but the bear, and the bear appears only at moments.

## Colors

A near-monochrome paper-and-ink palette with one warm leather accent and quiet semantic tints. Every colour has a dark-theme counterpart (the `-dark` tokens), swapped through `prefers-color-scheme`.

### Primary
- **Tanned Leather** (`leather`, dark: `leather-dark`): focus rings, text links, the dot under the active tab, the selected first-run option, chart data points. On a light ground its soft tint (`leather-soft`) backs Claude's notes and the "rest day" anchor card.

### Secondary
- **Worn Brass** (`amber`): streak segments beyond the goal ("extra" days) and celebration sparks. A quieter, yellower cousin of leather; never used for text.

### Semantic
- **Sage** (`good`, `good-soft`): progress meters and the "workout done" anchor card.
- **Tobacco** (`warn`, `warn-bg`): `notice` blocks: aggressive-pace warnings and ordinary advice.
- **Oxblood** (`stop`, `stop-bg`): `alert` blocks for warning-sign symptoms, and form errors.

### Neutral
- **Ivory Paper** (`paper`): the page background, and the text colour on ink-filled controls.
- **Cream Leaf** (`card`): card surfaces, one step lighter than the page.
- **Ink** (`ink`): all primary text, primary buttons, selected chips and ticks, chart lines.
- **Pencil** (`muted`): secondary text, captions, labels, inactive tabs, chart axes.
- **Vellum** (`faint`): image placeholders, code blocks, the 3D stage gradient.
- **Hairline** (`line`): every border and rule, translucent ink.

### Bear palette (companion only)
- **Cub** (`bear-fur`, `bear-cream` belly and muzzle, `bear-ink` outline and eyes, `bear-band` sweatband, `bear-blush` cheeks): toon-shaded with an ink outline, so it reads as drawn rather than rendered.

### Named Rules
**The Ink-Means-Chosen Rule.** Selected and done states are shown by filling with ink (`ink` background, `paper` text). Never use leather or a semantic colour to mark a selection.

**The Bookmark Rule.** Tanned Leather is a ribbon, not a theme. It marks focus, links and one active indicator per view; it never fills a button or a large surface (only its soft tint may back a note card).

**The Cub's Colours Rule.** The bear's colours belong to the bear alone. UI chrome, buttons, charts and icons never borrow them.

**The Stop Is Unmistakable Rule.** Oxblood is reserved for stop messages and errors. Caution uses Tobacco. The two must never be swapped or blended, and a stop message is never softened into a notice.

## Typography

**Display Font:** the platform book serif (`ui-serif`, i.e. New York on Apple devices, falling back to Iowan Old Style, Palatino, Georgia)
**Body Font:** the platform system sans (`system-ui`, San Francisco on Apple devices)

**Character:** a journal's printed serif for anything worth reading twice, paired with the phone's own sans for everything you tap. No web fonts are loaded; the app inherits the device's best faces.

### Hierarchy
- **Display** (500, 2.3rem, 1.05): today's workout title on the home anchor card.
- **Headline** (500, 2rem, 1.12, balanced wrap): page `h1`, the day counter; 2.1rem on the celebration screen.
- **Title** (500, 1.3rem, 1.2): card headings (`h2`).
- **Stat** (500, 1.7rem, 1.1): headline numbers in stat blocks. A smaller serif (1.1–1.15rem) also sets stepper values, first-run option titles and the post-workout win line.
- **Body** (400, 15px, 1.55, tabular figures): everything else. Secondary sizes are .84–.92rem.
- **Label** (600, .75rem, .12–.14em tracking, uppercase, Pencil): section labels (an `h2.label` or a `legend`, so the outline runs h1 then h2), form labels, stepper captions, tab labels. 12px is the floor for any text.

### Named Rules
**The Serif-For-Meaning Rule.** Serif is for headlines and numbers the owner reads as results. Controls, labels and running text stay in the system sans.

**The Tabular Figures Rule.** All numbers render with tabular figures (set on `body`) so columns of weights, reps and dates align.

## Layout

A single centred column, `max-width: 480px`, padded 22px at the sides and respecting safe-area insets top and bottom (bottom padding clears the fixed tab bar: inset + 112px). Sections stack in a grid with a 22px gap; inside cards the gap is 18px, in stacks 14px, between chips 10px.

There are no breakpoints: the column simply centres on wider screens. Two-up content uses a `split` (two equal columns, 16px gap) or `choice` grid; exercise rows use a three-column grid (60px thumbnail, flexible name, tick). Lists are separated by hairline top rules rather than gaps or boxes.

Full-bleed moments (sign-in, celebration, first run) drop the tab bar and centre content vertically in `100dvh`.

## Elevation & Depth

Mostly flat, structured by hairlines and tonal steps (page → card). Cards carry one barely-there ambient shadow; the only pronounced shadow is on sticky action buttons that float above the scroll. Status-coloured anchor cards (done, rest) drop the shadow entirely, as if printed on the page.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 1px rgba(27,26,23,.03), 0 12px 32px -12px rgba(27,26,23,.1)`; dark: `0 12px 32px -12px rgba(0,0,0,.5)`): every card and the sign-in card.
- **Layers:** the bear canvas sits in the page at z-index 1, the sticky button at 2, the tab bar at 3, the toast at 5.
- **Sticky lift** (`box-shadow: 0 10px 30px -8px rgba(27,26,23,.35)`): the sticky "finish" style button pinned near the bottom of a workout.

### Named Rules
**The Hairline-First Rule.** Separate with a 1px Hairline before reaching for a shadow or a fill. A new surface earns a shadow only if it floats over scrolling content.

## Shapes

Soft, consistent corners that tighten as elements get smaller: cards 18px, the 3D stage 14px, notices and image frames 12px, buttons 10px, effort-scale cells and code blocks 8px. Chips, segmented controls, the toast and swatches are full pills or circles. Inputs have no box at all: a single bottom rule, square-cornered. Ticks and stepper buttons are circles.

## Components

### Buttons
Small, precise and quiet; they read as printed text in a box until chosen.
- **Shape:** gently rounded (10px), 44px tall (48px for the main "go" action), 0 20px padding.
- **Primary / Go:** Ink fill, Ivory Paper text. Go adds .04em tracking.
- **Secondary (default):** transparent with a Hairline border, Ink text.
- **Ghost:** no border.
- **Link:** Tanned Leather text, 35% leather underline offset 4px, no box.
- **States:** press dims to 65% opacity; focus shows a 2px Tanned Leather ring offset 3px; disabled is 35% opacity.
- **Hit areas:** controls drawn smaller than 44px (ticks, chips, link buttons, segmented buttons) get an invisible `::before` that extends the tappable area to 44px without changing layout.
- **Destructive actions ask twice:** the first tap turns the button into a plain statement in Oxblood ("Tap again to discard. Progress is lost.") and it resets after 4 seconds. Deletes that can be reversed (a weight entry, a health note) act at once and offer Undo in the toast instead.

### Chips
- **Style:** 34px pills, Hairline border, Ink text at .86rem/500.
- **State:** selected chips (via `aria-pressed`) fill with Ink and invert to Paper text. The same pattern drives `choice` pairs, the 1–10 effort scale and the segmented control.

### Cards / Containers
- **Corner Style:** 18px.
- **Background:** Cream Leaf on Ivory Paper.
- **Shadow Strategy:** the Card shadow (see Elevation).
- **Border:** 1px Hairline.
- **Internal Padding:** 24px, 18px between children. Collapsible cards (`details`) put the padding on the summary row and draw a thin chevron in Pencil.

### Inputs / Fields
- **Style:** bare: transparent, no box, a single bottom Hairline, 1rem text. Labels above in the uppercase Label style.
- **Focus:** the bottom rule darkens to Ink. No glow.
- **Selects:** a custom thin chevron in Pencil.

### Navigation
A fixed bottom tab bar: Paper at 86% with an 18px backdrop blur and a Hairline top rule. Tabs are uppercase Label text in Pencil; the current tab turns Ink and gets a 4px Tanned Leather dot beneath it.

### Notices
Three inline message blocks, 12px corners, 16px 18px padding, .88rem:
- **Note:** Leather Soft tint, Ink text. Claude's notes and explanations.
- **Notice:** Tobacco on its tint. Advice and pace warnings.
- **Alert:** Oxblood on its tint. Stop messages after warning-sign symptoms.

### Exercise Row (signature)
A 60px square looping photo thumbnail (start and end frames alternate every 1.3s), the exercise name in 600 sans with the dose (`3 × 10 · 40 kg`) in Pencil below, and a 36px circular tick (48px hit area) on the right. Ticking fills the circle with Ink, draws a Paper checkmark and pops from 80% scale; the name strikes through in Pencil. Expanding a row reveals a 3:2 demo, a stepper block with one row per value (sets, reps, weight: label left, 44px circular − and + around a serif value), and numbered steps.

### Finish Screen
One question at a time: a 5 × 2 grid of 48px effort cells, then "How do you feel?" once effort is chosen. Symptoms stay behind a "Something hurt or felt off?" link; when opened, body areas and **Warning signs** are separate groups, and picking a warning sign shows the Oxblood alert at once. A stop result replaces the celebration with "Workout saved" and the alert: no sparks, no bear.

### Progress Segments (signature)
A row of 3px rounded bars, one per planned session: Hairline when empty, Ink when done, Worn Brass for sessions beyond the goal. A single 3px Sage meter is used for continuous progress.

### Bear Cub (signature)
A toon-shaded 3D bear with an ink outline (`public/mascot.js`), drawn on a canvas that stands on any element marked `data-mascot`. It appears in three places only: 64px at the right of the Today greeting when a workout is done today or the streak hits a milestone (3, 7, 14, 21, 30, 60, 100 days and on), and 150px on the celebration screen. Never on the workout list, sign-in, first run or locked cards, never over data, and never when a stop warning is showing. It waves on arrival, cheers on finish, breathes for about six seconds after appearing or reacting, then holds still and stops drawing. Under reduced motion it is drawn once in its resting pose.

### Toast
An Ink pill near the bottom, above the tab bar and sticky button (in the thumb zone, clear of the workout progress bar), Paper text at .84rem, rising 16px and fading in. With an Undo action it carries a small pill button and stays for 6 seconds instead of 2.8.

## Do's and Don'ts

### Do:
- **Do** mark selected and completed states by filling with Ink and inverting text to Ivory Paper.
- **Do** separate list items and sections with a 1px Hairline (`line`) before adding boxes or shadows.
- **Do** set headlines, totals and stepper values in the serif at weight 500 with slight negative tracking.
- **Do** keep every new colour paired with a `-dark` counterpart and swap it under `prefers-color-scheme: dark`.
- **Do** make every tap target at least 44px, extending small controls with an invisible hit area; the app is used mid-set.
- **Do** ask twice before anything destructive that cannot be undone, and offer Undo for anything that can.
- **Do** honour `prefers-reduced-motion`: every animation and transition switches off, and exercise photos show only the first frame.
- **Do** keep motion short and physical: 0.15–0.5s fades, a .3s pop on tick, the bear's brief settle.

### Don't:
- **Don't** use the bear's colours, `#ff5a1f`, or any saturated orange in UI chrome, buttons, charts or illustrations.
- **Don't** put the bear on every screen, over data, or in a place where it keeps animating; it is for moments.
- **Don't** set any text below 12px or muted text below 4.5:1.
- **Don't** fill buttons or large surfaces with Tanned Leather; it marks focus, links and the active indicator only.
- **Don't** use Oxblood for anything but stop messages and errors, or style a stop message as a notice.
- **Don't** load web fonts; the system serif and sans are the faces.
- **Don't** box inputs; fields are a single bottom rule.
- **Don't** add heavy shadows to static cards; only floating sticky controls get a pronounced lift.
- **Don't** widen the column beyond 480px or introduce multi-column desktop layouts.
