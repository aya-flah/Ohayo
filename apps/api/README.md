# @sonae/api (owners: P4, P1)

The server: computes and publishes plans, sends SMS, talks to Claude (with a hard $20 budget guard), keeps the ledger, and acts as the delivery oracle for the Yui contract.

Secrets (Claude key, oracle key) live only in `.env` here, never in the apps.
