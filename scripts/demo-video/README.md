# Demo video

Records the website scene by scene (Chrome screencast, visible cursor), adds animated title cards,
and cuts a montage under 3 minutes with transitions.

```bash
cd scripts/demo-video
npm init -y && npm i playwright-core@1.56.1   # uses your installed Chrome, no browser download
npm run dev:web & npm run dev:api              # from the repo root, both must be running
node record.mjs                                # all scenes → clips/ and marks.json (makes 3 AI calls)
node record.mjs plan twin                      # or only some scenes
node montage.mjs                               # → docs/video/Sonae_Zitoun_Demo.mp4
```

Needs ffmpeg on the PATH. Demo logins are read from `apps/api/.env`; nothing is printed.
