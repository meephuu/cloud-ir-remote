---
name: Cloud IR Remote
description: A remote-control dashboard that reads like a microcontroller datasheet.
colors:
  sheet-white: "#ffffff"
  ink: "#111418"
  ink-secondary: "#47505b"
  ink-tertiary: "#626b76"
  rule-hairline: "#c8cdd4"
  rule-soft: "#e3e7ec"
  field-stroke: "#8a939e"
  table-head: "#e8edf3"
  row-tint: "#f4f7fb"
  signal-blue: "#1f4e9a"
  signal-blue-deep: "#163b76"
  signal-blue-soft: "#cfdcf0"
  fault-red: "#c8102e"
  fault-red-soft: "#fbe7ea"
  fault-red-deep: "#8e0b20"
  ok-green: "#1e6b3a"
  band-cool: "rgb(222, 230, 240)"
  band-warm: "rgb(248, 218, 223)"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(48px, 5vw, 68px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
rounded:
  control: "2px"
  pill: "11px"
spacing:
  gutter: "32px"
  gutter-phone: "16px"
  column-gap: "40px"
  module-gap: "44px"
  cell: "10px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.signal-blue-deep}"
  button-send:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.signal-blue}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-send-hover:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.sheet-white}"
  button-secondary:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.fault-red}"
    textColor: "{colors.sheet-white}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "36px"
  table-header:
    backgroundColor: "{colors.table-head}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    padding: "7px 10px"
---

# Design System: Cloud IR Remote

## Overview

**Creative North Star: "The Datasheet"**

The dashboard is set like a microcontroller datasheet: a white sheet, near-black ink, hairline rules, grey table header rows, and every block captioned as a numbered table or figure ("Table 1. Saved IR codes", "Figure 1. Room temperature"). It is a working remote, so the datasheet lends only type, palette, density and one signature move; the layout and controls are ordinary web controls.

The signature move is the **timing diagram**: every saved IR button is drawn from its real mark/space durations, and while a send is pending a blue cursor sweeps across that diagram. The room-conditions side borrows a weather bulletin's station layout (big reading, ruled cells, a history graph over temperature bands) but stays in the datasheet palette.

**Key Characteristics:**
- White sheet, ink text, one action blue, red only for faults and the rule threshold.
- Captioned tables and figures instead of cards.
- Tabular figures everywhere numbers appear.
- Square corners, no shadows on surfaces.
- Each IR code shown as its own timing diagram with a length budget (n / 600).

## Colors

A restrained datasheet palette: neutrals do the structure, blue means "you can act", red means "fault or limit".

### Primary
- **Signal Blue** (`signal-blue`): every action: primary buttons, Send buttons, links, focus rings, the pending-send cursor, the humidity series. Deepens to `signal-blue-deep` on hover.

### Secondary
- **Fault Red** (`fault-red`): errors, offline device state, the automation rule's threshold line and handle, and the temperature reading when it is above the threshold. Soft variant for error banners.
- **OK Green** (`ok-green`): "Done", "Sent", "Saved" and the online dot. Text only, never a fill.

### Neutral
- **Sheet White** (`sheet-white`): the page ground. Never cream, never grey.
- **Ink** (`ink`): body text, the temperature series, axis lines, the 2px rule under the page header and 1px rules under module headings.
- **Ink Secondary / Tertiary** (`ink-secondary`, `ink-tertiary`): labels, captions, tick labels, secondary text. Tertiary is the lightest text allowed (4.5:1 on white).
- **Table Head** (`table-head`): table header rows, the demo banner, icon-button hover.
- **Row Tint** (`row-tint`): row hover and the pending row.
- **Hairline / Soft rules** (`rule-hairline`, `rule-soft`): table and cell dividers.
- **Field Stroke** (`field-stroke`): input, select, segmented-control and secondary-button borders (3:1 for UI components).
- **Temperature bands** (`band-cool` → white at 28 °C → `band-warm`): only behind temperature data (graph bands, the rule scale).

### Named Rules
**The Blue-Means-Act Rule.** Signal Blue appears only on things that act or on the act in progress. Status text that is not an action is green, red or ink.

**The Bands-Are-Temperature Rule.** The cool-to-warm band colours paint temperature and nothing else.

## Typography

**Body Font:** Archivo (self-hosted via @fontsource, fallback system-ui)

**Character:** One sturdy grotesque at three weights, like the body face of a technical manual. Tabular numerals are on for the whole page so readings and tables line up.

### Hierarchy
- **Display** (700, clamp(48px, 5vw, 68px), 1.02, -0.03em): the live temperature reading only.
- **Headline** (700, 24px): the page title in the header.
- **Title** (700, 17px): module headings, with the "Table n." prefix in 600 ink-secondary.
- **Body** (400, 15px, 1.45): text, table cells; button text is 600 14px.
- **Label** (600, 12.5px): table header cells, readout labels. Captions are 400 13px ink-tertiary, max 70ch.

### Named Rules
**The Caption Rule.** Every table and figure is numbered and named in its heading or caption; no label ever sits above a heading.

## Layout

A 12-column grid inside a page that caps at 1640px with a 32px gutter (16px on phones). On wide screens the left 7 columns hold the remote (Table 1) and Activity; the right 5 hold Room conditions and the Automation rule; columns are 40px apart and modules within a column 44px apart. Below 1180px it becomes one column ordered: buttons, room, rule, activity. Below 720px each code row stacks into name and actions, then the full-width timing diagram, then the length budget, and rule rows stack label over control.

## Elevation & Depth

Flat. Surfaces have no shadows; depth comes from rules (2px ink under the page header, 1px ink under module headings, hairlines between rows) and the grey table-head tone. The only shadows are functional: the soft blue trail behind the sweep cursor and the chart tooltip.

### Named Rules
**The Flat Sheet Rule.** Nothing on the page floats except the chart tooltip.

## Shapes

Square-cornered: buttons, inputs, segmented controls and badges use a 2px radius. The only round shapes are the status dot, the rule switch (11px pill) and the chart hover dot. No cards; modules are open blocks separated by rules.

## Components

### Buttons
- **Shape:** nearly square (2px), 36px tall, 600 14px.
- **Primary:** Signal Blue fill, white text ("Learn new button", "Save rule", "Start learning").
- **Send:** white with blue border and text; fills blue on hover and while the send is pending ("Sending"). Becomes "Retry" with a rotate icon after an error or no reply.
- **Secondary:** white with field-stroke border; row-tint on hover.
- **Danger:** Fault Red fill, only inside the inline delete confirm.
- **Icon buttons:** 34px, ink-tertiary, table-head on hover (rename, delete). Lucide icons, 16px.

### Inputs / Fields
- **Style:** 36px, field-stroke border, 2px radius, white.
- **Focus:** 2px Signal Blue outline, 2px offset (global).
- **Error:** border turns Fault Red with a red message below.

### Segmented control
Joined buttons with field-stroke dividers; the selected segment is ink with white text. Used for chart series and range.

### Timing diagram (signature)
A 1.25px ink square wave drawn from the code's durations; long frame gaps are clamped and marked with a small double-slash break. Pending send: wave turns blue and a 2px blue cursor sweeps left to right (1.1s, repeating). The learn panel uses the same sweep over a flat line while listening. Reduced motion replaces the sweep with a still blue wash.

### Room readout and Figure 1
Big reading on the left, three ruled cells on the right (humidity, 24 h range, updated). The graph sits on temperature bands with a dashed red threshold line labelled "Rule 30.0 °C"; hover shows a crosshair and an ink tooltip. Gaps over 20 minutes break the line instead of bridging it.

## Do's and Don'ts

### Do:
- **Do** caption every module as a numbered Table or Figure.
- **Do** show every command's round trip in the row and the Activity table: pending (blue), done (green), error or no reply (red), with the device's error explained in words.
- **Do** keep numbers in tabular figures and units after values (30.0 °C, 59 %).
- **Do** label demo or synthetic data on screen.

### Don't:
- **Don't** use cards, rounded tiles or shadows for modules.
- **Don't** use Signal Blue for anything that is not an action.
- **Don't** put a label or eyebrow above a heading.
- **Don't** use the temperature band colours for anything but temperature.
