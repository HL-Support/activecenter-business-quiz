# Deployment Workflow

Production is only allowed from a clean, pushed `main` branch.

1. Make changes locally.
2. Run `npm run verify` and `npm run build`.
3. Commit the intended changes.
4. Push `main` to GitHub.
5. Deploy with `npm run deploy:prod`.

`npm run deploy:prod` runs the deploy guard before Vercel. The guard blocks production if the working tree is dirty or if `HEAD` is not already on `origin/main`.

Do not run `npx vercel deploy --prod` directly from an uncommitted local state.
