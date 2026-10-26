# Math-Trainer
Download all dependecies with: npm i;
npm i --prefix server;
npm i --prefix client;
Run with: 
npm run dev; # at the repo root after setting .env

## Multiplication practice

Log in and select **Start practice** on `/home`. Each round contains three distinct
multiplication facts using factors from 0 through 12. Each question has four shuffled,
distinct choices. Wrong choices are products of nearby factors, increasing or decreasing
one or both factors within 0–12 and expanding the range when necessary.

Each question has 10 seconds (base time 10 seconds × difficulty 1). The browser displays
the countdown; the server enforces the saved deadline. A timeout counts as incorrect and
is saved with `chosenAnswer: null`, `isCorrect: false`, and `status: "expired"`.
Late selections are also incorrect. Refreshing resumes saved progress; if the active
question expired while the page was closed, loading practice records that timeout.

After three questions, the page shows accuracy (`correct / 3 × 100`) and an answer review.
MongoDB stores one current practice document per user, including every question, its
choices, correct answer, chosen answer, timestamps, and accuracy. **Retry practice**
replaces that user's previous practice with a fresh round and clears its results.

Practice API routes require the access token returned by login as a Bearer token.
Login tokens last one hour and include the user's database ID. Log in again if a token
expires or was issued before the practice feature was added.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/practice` | Load saved progress (or `null`) |
| POST | `/api/practice` | Start a round, or return the existing one |
| POST | `/api/practice/:practiceId/answers` | Submit `{ questionIndex, answer }`; `null` records no answer |
| POST | `/api/practice/retry` | Replace a completed round using `{ practiceId }` |

## Checks

```sh
npm test --prefix server
node --test client/tests/questionTimer.test.js
npm run lint --prefix client
npm run build --prefix client
```

The optional database integration test uses the MongoDB connection and token secrets in
the root `.env`. It creates a temporary user and practice, tests login, persistence,
timeouts, concurrent submissions, user isolation, and retry, then removes its own data:

```sh
npm run test:integration --prefix server
```

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.
