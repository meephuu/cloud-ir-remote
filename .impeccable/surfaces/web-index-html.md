---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: []
---

# Dashboard (web/)

Scope: the single-page web dashboard in `web/` (React + Vite). Visitor mode: Operate.

Audience and task: the two-person team and the lab TA. Send a saved IR button in one tap, learn a new one, read room temperature and humidity with history, and set the automation rule. Used on a phone at home and on a laptop/projector during the demo. First screen on a laptop: buttons and climate side by side; on a phone, buttons first.

Constraints: works before hardware exists (demo mode with synthetic data, clearly labelled); commands are asynchronous (pending, done, error); English only.

## Direction contract

THESIS: The dashboard reads like a microcontroller datasheet, and every saved button is drawn as its own IR timing diagram. It refuses the category's rounded card grid with tile buttons and a blue line chart.

OWN-WORLD: White sheet, near-black ink #111418, one link blue #1F4E9A for actions, header rows in #E8EDF3, red #C8102E for errors and the rule threshold. Hairline rules, tables with grey header rows, captioned figures ("Table 1.", "Figure 1."). Archivo, tabular figures throughout. Square corners, no shadows.

STORY: The visitor sees which buttons exist, what each signal looks like, and whether the device is online; presses Send and watches the row go pending, then done or error; reads the room's conditions and sees when the rule would fire.

FIRST VIEWPORT: Top bar: product name, document-style revision line, device online state, demo badge. Left (7/12): Table 1, saved IR codes, each row with name, mark/space waveform, duration count with budget out of 600, and a Send button; "Learn new button" in the table heading. Right (5/12): room station, the bulletin layout in datasheet colours: large temperature readout with humidity and 24 h range in ruled cells, Figure 1 temperature history over tinted temperature bands (cool bands blue-grey, warm bands red tint) with the rule threshold as a dashed red line; below it the automation rule and the activity log.

FORM: Datasheet, position 1 on the ordered list, with the user's steer that the right column takes the Weather Bulletin's station layout in datasheet colours. seed:3d1c32e15ddc419f. Signature move: each code rendered as its timing diagram from its real timings; pressing Send draws a cursor across the waveform while the command is pending. Raised lines kept: hairline-ruled modules instead of padded cards; code length shown as n / 600; learning takes over Table 1 as one complete state; one 12-column grid.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
