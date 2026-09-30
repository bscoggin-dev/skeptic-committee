# Committee rules (example)

This is the `rules` input the skeptic-committee workflow gets. The calling session reads the fenced
block below and passes it through word for word. It lives in its own file, not in the script, so the
script stays free of any one environment. Copy this file into your project, replace the block with
your own hard rules, and point the skill at it.

Good rules are things a reviewer could otherwise get wrong or do by accident: files it must never
read, how to run the tests safely, which database is read-only, who the operator is and what they
are trying to do, and how the artifact's author tends to fail.

```text
- NEVER read .env, credentials.json or any other secrets file.
- Tests run with: npm test. Do not run the integration suite; it writes to the staging database.
- Database access is read-only: SELECT queries against the reporting replica only.
- The operator is the project maintainer. The goal of this project is a reliable weekly report that the team trusts.
- The artifact's author is usually an AI coding session. Its known failure mode is asserting a conclusion from a check that could not support it.
```
