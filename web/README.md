# Website

React + Vite dashboard for Cloud IR Remote. It reads and writes Firebase Realtime Database and is hosted on Firebase Hosting.

- Table 1: saved IR buttons, each drawn as its timing diagram, with Send, Rename and Delete
- Learn new button: type a name, then press the button on the real remote
- Table 2: live temperature and humidity, with a 6 h / 24 h / 7 day history graph
- Table 3: automation rule (if the room is above X °C, send button Y; on/off)
- Table 4: activity log of every command and its result

## Run it locally

Needs Node.js 18 or newer.

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173.

**Demo mode.** Without a Firebase config the site runs in demo mode: the database and the device are simulated in your browser (data is kept in localStorage, and "Reset" in the header restores it). A "Demo data" badge and a banner say so. In demo mode, learning a name that contains "fail" simulates a timeout, so you can see the error screen.

## Connect to Firebase

### 1. Create the project (Firebase console, once)

1. Go to https://console.firebase.google.com and click **Create a project** (for example `cloud-ir-remote`). Google Analytics is not needed.
2. **Build > Realtime Database > Create Database.** Pick the location **Singapore (asia-southeast1)**, the closest to Bangkok. Start in **locked mode**; step 4 uploads the real rules.
3. **Project settings (gear) > General > Your apps > Web (`</>`)**. Register an app (any nickname, no need to tick Hosting here). Firebase shows a `firebaseConfig` object.

### 2. Put the config in `web/.env.local`

```bash
cp .env.example .env.local
```

Fill each `VITE_FIREBASE_...` line from the `firebaseConfig` object. `databaseURL` looks like `https://<project>-default-rtdb.asia-southeast1.firebasedatabase.app`. `.env.local` is ignored by git, so the keys stay out of the public repo. Restart `npm run dev`; the "Demo data" badge disappears.

### 3. Add test data (optional)

To type data by hand: **Realtime Database > Data**, then use **+** on the root.

To load a full set of fake data at once: **⋮ > Import JSON** and choose `web/seed/demo-data.json`. **Import replaces everything in the database.** Regenerate the file with fresh timestamps with `node seed/make-seed.mjs`. All codes in it are synthetic, not captured from a real remote.

### 4. Deploy the rules and the website

```bash
npx firebase-tools login
npx firebase-tools use --add
npm run deploy
```

`use --add` asks for the project; pick yours and give it the alias `default`. `npm run deploy` builds the site and deploys both Hosting and the database rules in `database.rules.json`. The site is then live at `https://<project-id>.web.app`.

> **Security note.** There is no login yet, so the rules let anyone who knows the database URL read and write (the rules do check the shape of every write). That is fine for the lab, but anyone with the URL could send IR codes. Adding Firebase Authentication (and the same account on the ESP32) is the fix if we have time.

## Database layout

This is the contract between the website and the ESP32. It follows the team's draft, plus the fields marked *new*.

| Path | Value | Written by |
|---|---|---|
| `/codes/{id}` | `{ name, n, timings: "486,403,...", createdAt }` | ESP32 (after LEARN); website renames/deletes |
| `/env/latest` | `{ temp, hum, ts }` | ESP32 |
| `/env/history/{ts}` | `{ temp, hum }` | ESP32, about every 5 min |
| `/commands/{id}` | `{ type, codeId \| name, status, createdAt, doneAt, error }` | website creates, ESP32 updates `status` |
| `/rule` | `{ threshold, enabled, codeId }` | website |
| `/device/lastSeen` *(new)* | ms timestamp | ESP32 heartbeat, every ~10 s |

Details:

- **Timestamps** are milliseconds since 1970 (what JavaScript's `Date.now()` gives). The website writes `createdAt` with Firebase's server timestamp. The ESP32 can write `{".sv": "timestamp"}` to get server time too, or use NTP.
- **History keys** are those 13-digit timestamps as strings, so they sort by time and the site only downloads the range on screen.
- **`temp`** is in °C as a decimal (`28.5`). The STM32 sends it ×10 (`ENV,285,62`), so the ESP32 divides by 10. `hum` is a whole %.
- **SEND**: the website pushes `{ type: "SEND", codeId, status: "pending", createdAt }`. The ESP32 reads `/codes/{codeId}`, writes `SEND,<n>,<timings>` to the STM32, waits for `ACK,SEND`, then sets `status: "done"` and `doneAt`. On `ERR,...` it sets `status: "error"` and `error` to the raw line (for example `"ERR,SEND,BUSY"`); the site turns known errors into plain words.
- **LEARN**: the website pushes `{ type: "LEARN", name, status: "pending", createdAt }`. The ESP32 writes `LEARN`, and on `CODE,<n>,...` saves a new `/codes/{newId}`, then sets the command's `status: "done"` and *new* `codeId: newId` so the site can show the result. On `ERR,LEARN,TIMEOUT` or `ERR,LEARN,TOO_LONG` it sets `status: "error"` and `error`.
- **No reply**: if a command stays `pending` for 15 s (SEND) or 25 s (LEARN), the site shows "No reply from the device". It does not change the database.
- **Device online**: the header shows the ESP32 as online when `/device/lastSeen` is less than 60 s old.
- **Rule**: `threshold` is °C (one decimal), `codeId` points into `/codes`. The ESP32 forwards it to the STM32 as `RULE,<threshold×10>,<0/1>,<n>,<timings>` when it changes. Deleting the code a rule uses turns the rule off.

## Files

| Path | What |
|---|---|
| `src/App.jsx` | Page layout and header |
| `src/components/` | Codes table and learn flow, room conditions and chart, rule, activity |
| `src/lib/store.js` | Chooses Firebase or demo mode |
| `src/lib/firebaseStore.js` | Firebase Realtime Database access |
| `src/lib/demoStore.js` | In-browser database and simulated device |
| `src/lib/commands.js` | Writes SEND / LEARN commands and other changes |
| `src/lib/ir.js` | Parses timings and draws timing diagrams |
| `database.rules.json` | Database security and validation rules |
| `firebase.json` | Hosting and database config |
| `seed/` | Fake data for testing |
