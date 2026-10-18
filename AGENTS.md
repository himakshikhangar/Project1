# AGENTS.md: Campus Desk (student dashboard)

## Goal
A dashboard for a college student to manage timetable, attendance, exams, grades, focus time and notices. Colourful, animated, responsive. Frontend only.

## Hard constraints
- Plain HTML, CSS, JavaScript in 3 files: `index.html`, `style.css`, `app.js`. No frameworks, no npm, no build step, no backend.
- 3D effects use CSS 3D transforms only. Three.js r128 is allowed in fx.js only; Anime.js v4 is allowed in anime-fx.js only.
- Data lives in `localStorage` key `sd.v1` (one object). Nothing is sent anywhere.
- Must work by double-clicking `index.html`. Fonts load from Google Fonts with `system-ui` fallbacks.
- Keep code readable: short functions, one-line comment above anything non-obvious.

## Views (hash routing: #overview, #timetable, #attendance, #exams, #grades, #focus, #notices, #profile)
| View | Features |
|---|---|
| Overview | Stats (attendance, classes today, next exam, CGPA), shortage alerts, today's schedule, to-do preview |
| Timetable | Add classes once (day, start, end, subject, room); weekly grid; today highlighted; reminder 10 min before class (toast plus browser notification while the tab is open) |
| Attendance | Subject-wise Present/Absent counters on flip cards; back side shows counts and advice; alert below 75% with classes needed to recover |
| Exams | Exam schedule plus live flip-style countdown (days, hrs, min, sec) |
| Grades | Marks per subject, grade points on a 10-point scale, GPA per semester, CGPA |
| Focus | Pomodoro (25/5) with progress ring and session count, daily to-do list |
| Notices | Add, pin and delete notices (manual, since there is no backend) |
| Profile | Name, course, semester, theme, load demo data, clear data |

## Rules (implement once, reuse)
- Attendance % = present / total * 100. Shortage when below 75%.
- Classes needed to reach 75%: `max(0, 3*total - 4*present)`. Classes that can be skipped: `floor((4*present - 3*total) / 3)`.
- Grade points: >=90 is 10, >=80 is 9, >=70 is 8, >=60 is 7, >=50 is 6, >=45 is 5, >=40 is 4, else 0. GPA = credit-weighted mean.
- Validation: end time after start time; marks not above max marks; a subject must exist before adding classes or exams.

## Design
- Light and Dark themes through CSS variables on `[data-theme]`. No hard-coded colours outside the tokens and the subject colour list.
- Deep-blue sidebar (bottom tab bar under 760px), yellow active tab, colourful buttons: blue, green, red, yellow.
- Each subject has its own colour, used on timetable rows, attendance cards and exam cards.
- Fonts: Bricolage Grotesque (headings), Public Sans (body). Tabular numbers.
- Motion: cards fade up on view change, cards tilt toward the pointer (max 8 degrees, hover devices only), attendance cards flip in 3D, countdown digits flip, spinning cube logo. All off under `prefers-reduced-motion`.
- Never use: decorative gradients, glass blur, emoji as icons, lorem ipsum.
- Text contrast at least 4.5:1 in both themes.

## How to work
1. Change only what was asked. Keep to the 3 files.
2. After every edit run `node --check app.js`.
3. You cannot see the browser. List anything visual you could not verify.
4. Never break saved data: if you change the data shape, migrate it on load.
