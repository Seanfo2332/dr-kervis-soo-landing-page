# /admin for the Insights section — owner's guide

Editors publish articles for **drkervis.com/insights/** from **drkervis.com/admin/**, without touching code.

## How it works

1. An editor signs in at `/admin/` with one shared password.
2. They paste an article, upload a photo and press publish. The photo is resized in their own browser.
   Text copied from Word, Google Docs or ChatGPT is converted on paste (`admin/paste.js`): headings become `##` / `###`,
   short bold-only lines become `###`, lists become `- `. In the stored text, `## ` is a big heading (listed in the
   reading navigation), `### ` a small heading inside a section, `- ` a bullet, any other line a paragraph.
3. A Vercel function saves the article (`content/insights/<slug>.json`) and the two photo files
   (`images/insights/<slug>.webp` and `<slug>-640.webp`) as **one commit** on GitHub `master`.
4. Vercel rebuilds the site (`python3 scripts/build_site.py`, set in `vercel.json`). The page, the `/insights/`
   list, the home page cards and `sitemap.xml` are all generated from the stored articles. Live in about 1 minute.

The three original articles stay written inside `scripts/build_site.py` and are not managed in `/admin`.

## One-time setup (Vercel → project `dr-kervis-soo-landing` → Settings → Environment Variables)

| Name | Value | Needed |
|------|-------|--------|
| `ADMIN_PASSWORD` | The shared password (20+ random characters is best) | yes |
| `SESSION_SECRET` | A long random string (32+ characters). Changing it signs everyone out | yes |
| `GITHUB_TOKEN` | Fine-grained token, **only** this repository, permission **Contents: Read and write**, 1-year expiry | yes |
| `ANTHROPIC_API_KEY` | Powers the "自动生成摘要和搜索设置" button. Without it the button still works, using the start of the article | no |
| `GITHUB_BRANCH` | Branch to publish to. Defaults to `master`. Use another branch only for testing | no |
| `ANTHROPIC_MODEL` | Defaults to `claude-haiku-5-5` | no |

Add them for **Production** (and Preview if you want to test there), then redeploy.

Never put these values in the code or in this repository: the repository is public.

## Safety design

- Passwords are compared in constant time; wrong passwords are slowed down and an address is locked out after 8
  failures in 15 minutes (best effort per server instance).
- The session cookie is `HttpOnly; Secure; SameSite=Strict`, signed, and expires after 12 hours.
- Every change from another website is refused (Origin check). `/admin/` is `noindex` and has a strict
  Content-Security-Policy (see `vercel.json`).
- **The GitHub client can only write `content/insights/*.json` and `images/insights/*`.** It cannot change the page
  generator, the functions, `vercel.json` or the workflows, even if the password were stolen.
- Every article is validated again at build time (`scripts/insights_data.py`) and all text is HTML-escaped.
  A bad file is skipped with a `WARNING` in the build log instead of breaking the whole site.
- Photos are checked by file signature and size, and never decoded on the server.

## Everyday tasks

- **Change the password:** edit `ADMIN_PASSWORD` in Vercel, redeploy. Change `SESSION_SECRET` too to sign out everyone now.
- **Remove someone's access:** change the password (it is shared, so everyone gets the new one).
- **Token about to expire:** create a new one the same way, replace `GITHUB_TOKEN`, redeploy.
- **An article went live that should not have:** delete it in `/admin`, or `git revert` the commit named
  `chore: publish insight <slug>`.
- **Roll the whole feature back:** remove `buildCommand` and `outputDirectory` from `vercel.json` (the site goes
  back to serving the committed files as before).
- **Pulling articles to your computer:** `git pull` first. Editors commit to `master` directly, so pull before you
  push, then `python scripts/build_site.py` to preview. The build also deletes the page of any article that no
  longer exists.

## Checking it yourself

```bash
python -m unittest discover -s tests -p "test_*.py"     # page generator
node --test "tests/api/*.test.cjs"                        # login, validation, GitHub and AI helpers
python scripts/preview_server.py --port 8000              # then, in another terminal:
node tests/verify_site.cjs                                # the original site checks
node tests/verify_paste.cjs                               # formatted-paste conversion (Word / Google Docs / ChatGPT)
node tests/verify_admin.cjs                               # /admin in a real browser (no GitHub needed)
node tests/verify_publish.cjs                             # publish → build → read the live pages
node tests/admin_harness.cjs 3100                         # try /admin by hand at http://127.0.0.1:3100/admin/
```

The browser tests need Playwright (`NODE_PATH` pointing at a folder that has it). They use a local stand-in for
GitHub, so nothing is sent to GitHub, Vercel or Anthropic.

## Known limits

- One shared password: you cannot tell who published what (the Git history shows the token owner).
- Two editors publishing the same hand-typed web address in the same second could overwrite each other.
- The 1-minute delay is the Vercel rebuild. The article list in `/admin` updates at once, but the photos only
  appear after the rebuild (the list shows "图片稍后显示" meanwhile).
