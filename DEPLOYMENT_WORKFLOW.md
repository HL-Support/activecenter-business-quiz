# Deployment Workflow

Production is promoted from a tested Vercel Preview deployment.

## Preview First

1. Make changes locally.
2. Run `npm run deploy:preview`.
3. Test the returned Preview URL, including a real coach slug like `/markus`.
4. Commit the intended changes.
5. Push `main` to GitHub.
6. Promote the tested Preview URL with:

```bash
npm run promote:prod -- <preview-url>
```

`npm run deploy:preview` runs `npm run build`, `npm run verify`, then creates a Vercel Preview deployment. It does not overwrite `https://quiz.activecenter.info`.

`npm run promote:prod` runs the production guard before Vercel. The guard blocks promotion if the working tree is dirty, the current branch is not `main`, or `HEAD` is not already on `origin/main`.

`npm run deploy:prod -- <preview-url>` is kept as an alias for the same guarded promotion flow.

Do not run `npx vercel deploy --prod` directly. Production should only receive a Preview deployment that was tested first.
