# SafeWalk — Western Province Pedestrian Safety Map

## ⚠️ Two things you must do before the map fully works

### Step A — Add Latitude/Longitude to your Google Form

Your form currently has no place to store *where* a pin was dropped. Open your
form in edit mode and add:

1. A **Short answer** question titled exactly `Latitude` (mark it required)
2. A **Short answer** question titled exactly `Longitude` (mark it required)

The map fills these in automatically before showing the form — visitors never
see or type into them by hand.

### Step B — Get those two entry IDs

1. In the Form editor, click **⋮ → "Get pre-filled link"**
2. Fill in dummy answers for **Latitude** and **Longitude** only (any numbers)
   → click **"Get link"**
3. Copy the resulting URL and look for `&entry.XXXXXXXXX=` next to each value
   you typed
4. Open `js/script.js`, find the `ENTRY` block near the top, and replace:
   ```js
   latitude:  'entry.ENTRY_LATITUDE',   // ← paste the real entry.NNNNNNNNN here
   longitude: 'entry.ENTRY_LONGITUDE',  // ← paste the real entry.NNNNNNNNN here
   ```

## Step C — Publish the Google Sheet as CSV

1. Open the Sheet linked to your form (Form editor → **Responses** tab → green
   Sheets icon)
2. **File → Share → Publish to web**
3. Choose your response sheet's tab, and **Comma-separated values (.csv)**
4. Click **Publish** → copy the URL
5. In `js/script.js`, paste it into:
   ```js
   const SHEET_CSV_URL = 'YOUR_PUBLISHED_SHEET_CSV_URL_HERE';
   ```

That's it — save, reload the page, and reports will start flowing both ways.

---

## How it works

### Submitting a report (any visitor to the map)
1. Click **"Report issue"** in the top bar
2. Step 1: click anywhere on the map (or use **"Use my current location"**) to
   drop a pin at the issue's location
3. Step 2: your **actual Google Form** appears embedded in the panel, already
   carrying the pinned Latitude/Longitude — the visitor fills in issue type,
   severity, date, description, photo, etc. exactly as you built the form, and
   clicks **Submit** themselves inside it
4. Google saves the response straight to your linked Sheet, same as any
   normal Form submission
5. Click **"Done / Close"** — the map refreshes from the Sheet so the new pin
   shows up (it also auto-refreshes every 60s for everyone else)

Note: Google requires the visitor to be signed into a Google account to use
the "Evidence (Upload a photo)" question, since file uploads aren't allowed
for anonymous form responses. If you want fully anonymous reporting, consider
making that question optional or removing it.

### Viewing reports (any visitor to the map)
- Every response in the Sheet renders as a colored circle marker:
  green = Low, amber = Medium, red = High severity
- Clicking a marker shows its issue type, description, reporter, and date
- The **Dashboard** panel (top bar) shows totals, a breakdown by issue type
  and severity, and the 6 most recent submissions — built from the same
  live Sheet data everyone else sees

### As the form owner
- The linked Google Sheet has one row per submission, coordinates included
- The Form's own **Responses** tab still shows Google's built-in summary charts
- Export, filter, or connect the Sheet to Data Studio same as any other Sheet

---

## Adding photos, or making the form fully anonymous (optional)

Photo upload works as your form intended, but Google requires the visitor to
sign into a Google account to use file-upload questions — that's a platform
rule for anonymous public forms, not something this map controls. If you'd
rather keep reporting fully anonymous, make "Evidence" optional (or remove
it) in the Form editor.

---

## Running locally

```bash
cd SafeWalk-WebMap
python3 -m http.server 8000
# open http://localhost:8000
```

`fetch()` is blocked on `file://` pages, so the folder must be served, not
opened directly.

## Deploying on GitHub Pages

1. Push this folder to your repo (as root, or in `/docs`)
2. Repo → **Settings → Pages** → set the source branch/folder
3. Live at `https://<username>.github.io/<repo-name>/` — no extra config needed,
   the Sheet CSV URL and Form submission both work as-is on GitHub Pages.
