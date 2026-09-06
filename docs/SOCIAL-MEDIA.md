# Social Media module

Working source: `C:\Users\User\Documents\AI AGENT AKILIMATIC SAAS`.

## Deploy

The new database tables must exist before starting the API or worker with this version. From the deployed server directory:

```sh
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart sales-api sales-worker
```

Build the frontend in the working project with `npm run build:cpanel` and deploy that newly generated `out` directory using your existing process. The new route is `/social/`.

No production database migration or live social post is performed by the coding tests.

## Connect Meta

The first release supports Facebook Pages and professional Instagram accounts linked to those Pages, using Meta's Facebook Login flow. It does not publish to personal profiles. Either connect using a Page access token in Accounts or configure OAuth on the backend:

```dotenv
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_REDIRECT_URI=https://apiagent.akilimatic.com/api/v1/social/oauth/callback
META_GRAPH_VERSION=v23.0
```

Set the identical redirect URI in the Meta app. Request `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, and `instagram_content_publish`. Accounts and app roles must be eligible for the granted access; serving customers outside app roles requires the relevant Meta review/access. Validate your app's supported Graph version before changing `META_GRAPH_VERSION`.

Meta's official references:
- https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api

The connection check proves account access, not every publishing permission. Meta may reject publication for missing scope, media requirements, account restrictions or expired tokens; the returned reason appears in Results. Reconnect to replace an expired token. Only connected accounts selected for a post receive that post.

## First post

1. Add a real product, audience, approved claims, brand voice and HTTPS landing page.
2. Connect the Page and linked professional Instagram account.
3. Choose a product and account in Studio. Enter an idea or use Growth to develop a 7-day plan.
4. Optionally research recent news using an existing Brave Search credential or add dated source notes. News results are not proof of popularity. Verify notes before using them.
5. Generate a draft using the organization's selected AI model, or write a manual draft. Review copy and supply a public image URL. Instagram image publishing requires JPEG media meeting Meta's requirements; Facebook also supports text-only posts.
6. Save changes. Approve and publish now, or choose a local scheduled time and approve.
7. Check Calendar/Results. A scheduled scan runs every 15 seconds in `sales-worker`. Successful publication records Meta's ID and link when available. Refresh engagement for available like/comment counts.

Saving and AI generation never publish. Each platform has its own post for independent copy, status and failures. Generation uses supplied product facts and sources; review remains required. Growth plans are stored on the product. They are recommendations, not guaranteed follower growth.

## Delivery behavior

Database state is the schedule source of truth; the dedicated `social-publishing` queue scans due records. An atomic claim prevents multiple workers from publishing the same scheduled row. Cancel works only before publishing starts. Disconnect cancels scheduled posts for that account.

`DRAFT → SCHEDULED → PUBLISHING → PUBLISHED / FAILED / UNCERTAIN`.

Safe failures can be corrected and explicitly rescheduled. Uncertain requests are never automatically repeated because Meta may already have published them. Check the platform before creating any replacement. A worker interrupted during publishing is marked uncertain after 15 minutes. This favors avoiding duplicates over automatic recovery of an ambiguous request.

Engagement counts depend on Meta permissions and field availability. They are not leads, sales, reach, or follower growth. Facebook drafts include UTM links for your website analytics; Instagram caption links are not clickable. No website conversion integration is claimed by this release. Video, generated images and automatic follower-count collection are not part of this image/text release.

## Tests

```sh
npm run build
node --experimental-vm-modules --test tests/social.test.mjs tests/social-worker.test.mjs
```

Tests use simulated Meta responses. Validate one approved post on each connected live account after deployment; no live posts are sent automatically during development.
