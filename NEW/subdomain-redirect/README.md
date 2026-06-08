# Numbered-subdomain redirect

Tiny shim that bounces visitors from `https://<N>.plantoid.org` to
`https://feed.plantoid.org/?p=<N>`. The same file works on every numbered
subdomain because it reads `<N>` from the hostname.

## Files

- `.htaccess` — server-side 302 redirect (recommended). LiteSpeed/Apache.
- `index.html` — JS fallback if `.htaccess` overrides aren't honored.

## Deploy

For each numbered subdomain (13, 14, 16, 17, 18, ...):

1. Open the 1984.is file manager (or SFTP) for that hosted site.
2. Upload `.htaccess` to the document root.
3. Test: `curl -I https://18.plantoid.org` should return `302` with
   `Location: https://feed.plantoid.org/?p=18`.
4. If you see a `200` with placeholder content instead, the `.htaccess` isn't
   being read on that plan — fall back to uploading `index.html` instead.
