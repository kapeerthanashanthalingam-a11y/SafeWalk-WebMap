# SafeWalk — Western Province Pedestrian Safety Map

## ⚠️ Two things you must do before the map fully works

### Step A — Get the Google Form entry IDs

1. Open your Google Form in edit mode:
   `https://docs.google.com/forms/d/1vaI_n_PsaTVzYlfzbBh4mVnpD1UG5B_SPdKiAbKVHGQ/edit`

2. Click the **⋮ (three-dot menu)** in the top-right → **"Get pre-filled link"**

3. Fill in a dummy answer for **every question**, then click **"Get link"**

4. Copy the URL. It looks like:
   ```
   https://docs.google.com/forms/d/1vaI_.../viewform?usp=pp_url
     &entry.123456789=Dummy+Answer
     &entry.987654321=Another
     ...
   ```

5. Open `js/script.js` and find the `ENTRY` block near the top:
   ```js
   const ENTRY = {
     latitude:    'entry.ENTRY_LATITUDE',
     longitude:   'entry.ENTRY_LONGITUDE',
     issueType:   'entry.ENTRY_ISSUE_TYPE',
     severity:    'entry.ENTRY_SEVERITY',
     description: 'entry.ENTRY_DESCRIPTION',
     name:        'entry.ENTRY_NAME',
   };
   ```
   Replace each `ENTRY_XXXXXXX` with the matching `entry.XXXXXXXXX` from your prefill URL.
   Match them to the right question by the dummy answer you entered.

6. **Important — your Google Form must have these 6 questions** (in any order):
   | Question label in form | Maps to |
   |---|---|
   | Latitude | `latitude` |
   | Longitude | `longitude` |
   | Issue Type | `issueType` |
   | Severity | `severity` |
   | Description | `description` |
   | Name (optional) | `name` |

   If your form uses different question labels, update them to match,
   or adjust the ENTRY mapping in script.js accordingly.

---

### Step B — Publish the Google Sheet as CSV

1. Open the Google Sheet linked to your form
   (Form editor → Responses tab → the green Sheet icon)

2. In the Sheet: **File → Share → Publish to web**

3. Under "Link", choose:
   - First dropdown: **Sheet1** (or whatever your tab is named)
   - Second dropdown: **Comma-separated values (.csv)**

4. Click **Publish** → confirm → **copy the URL**

5. In `js/script.js`, paste it here:
   ```js
   const SHEET_CSV_URL = 'YOUR_PUBLISHED_SHEET_CSV_URL_HERE';
   ```

6. **Your Sheet column headers must match these names exactly**
   (they're auto-created by Google Forms — check your Sheet row 1):
   - `Timestamp`
   - `Latitude`
   - `Longitude`
   - `Issue Type`
   - `Severity`
   - `Description`
   - `Name`

   If the headers differ, update the column name mapping in `renderReports()`
   inside `script.js` (look for the "Column name mapping" comment).

---

## How it works

### Submitting a report
1. User clicks **"Report issue"** in the top bar
2. Clicks the map to drop a pin (or uses GPS)
3. Fills in issue type, severity, description, name
4. Reviews and clicks **Submit**
5. The web map silently POSTs to Google Forms via a hidden iframe — no
   page redirect, no Google Form page opens
6. The pin appears on the map **immediately** (locally)
7. After a few seconds, the next `fetchReports()` (or manual Refresh)
   will pull the new row from the Sheet and re-render it

### Viewing reports
- All submissions from the Google Sheet appear as **colored circle markers**:
  - 🟢 Green = Low severity
  - 🟡 Amber = Medium severity
  - 🔴 Red = High severity
- Click any marker for a popup: issue type, description, reporter name, date
- The **Dashboard** (button in top bar) shows charts by issue type, by
  severity, a count of reports this month, and a list of the 6 most recent

### As the form owner
- Open the linked Google Sheet to see every submission in rows
- Google Forms Responses tab shows summary charts of all answers
- You can filter, sort, export to Excel, or connect to Google Data Studio

---

## Running locally

```bash
cd SafeWalk-WebMap
python3 -m http.server 8000
# open http://localhost:8000
```

Note: `fetch()` is blocked on `file://` pages, so you must serve the folder.

## Deploying on GitHub Pages

1. Push this entire folder to your repo's `main` branch (as the root, or in `/docs`)
2. Go to Repo → **Settings → Pages** → set source branch and folder
3. Your map will be live at `https://<username>.github.io/<repo-name>/`

The Sheet CSV URL and form submission will work on GitHub Pages with no
extra configuration needed.
