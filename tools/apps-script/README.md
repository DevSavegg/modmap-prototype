# Test-data receiver (Google Apps Script)

The web prototype sends each finished test run here. The script saves it in **your** Google Drive:
- **One JSON file per run** in the folder "MOD MAP web tests".
- **One summary row per run** in the spreadsheet "MOD MAP web tests (summary)", in the same folder.

All of it is `web` data: browser sensors, no barometer. It is kept apart from the Sensor Logger and native-app data.

## Deploy (about 10 minutes, once)

1. Go to https://script.google.com and click **New project**. Rename it "MOD MAP web tests".
2. Delete everything in `Code.gs`, paste the contents of [Code.gs](Code.gs) and save (Ctrl+S).
3. Click **Deploy → New deployment**, then click the gear icon next to "Select type" and choose **Web app**.
   - Description: `v1`.
   - Execute as: **Me**.
   - Who has access: **Anyone**. The testers' phones have no Google sign-in, so the app must be able to post without one.
4. Click **Deploy**, then **Authorize access** and choose your account.
   - Google warns that it "hasn't verified this app", because the script is yours and unpublished.
   - Click **Advanced**, then **Go to MOD MAP web tests (unsafe)**, then **Allow**.
   - It asks for Drive and Sheets access to **your own** account only, to create the folder, the files and the sheet.
5. Copy the **Web app URL**, the one that ends in `/exec`, and send it to me. I'll put it in `config.js` as `TESTLOG_URL`.
6. **Check:** open that URL in a browser. It should show `{"ok":true,"service":"modmap-web-test",...}`.

## After the test days

- **Stop accepting data:** Deploy → Manage deployments → Archive.
- **Why it matters:** the URL is visible in the public repo. The script accepts only data shaped like a MOD MAP test and saves each run once, but it can't tell a real tester from someone else.
- **Keeping the data:** download the Drive folder as a zip and unpack it into `SE/N7-Pilot/data/raw/web-tests/<date>/` for analysis.
- **Never commit test data to the public repo.** It holds GPS points, motion and, for some testers, sign photos.
- **Deletion:** the consent text promises deletion when the project ends (March 2027), or earlier for any tester who asks with their tester code.

## What a run file holds (`schema: modmap-web-test/1`)

- **`session`:** tester code, optional height, whether photos may be kept, and the phone and browser census (OS, browser, motion rate, gyroscope yes/no, motion permission).
- **`run`:** the kind (scenario / free / calibration), mode (sim / real), times, outcome, a `summary`, and `events`:
  - screens, searches;
  - GPS fixes (outdoors only), steps, turns;
  - lift taps, "I'm at the door", corrections;
  - sign reading and the tester's yes/no on it.
- **`motion`:** raw accelerometer + gyroscope during real walks. Each column is a base64 string:
  - `dt`: int32 milliseconds since the previous sample;
  - `ax ay az`: int16 cm/s², acceleration including gravity;
  - `ra rb rg`: int16 0.1 °/s, rotation rate alpha/beta/gamma.
- **`photos`:** small JPEGs of sign photos, only when the tester ticked the box.
