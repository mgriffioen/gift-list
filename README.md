# 🎁 Gift List

A simple gift-idea page to share with friends and family, plus a password-protected admin page for adding and editing items.

- **Shared page (`/`)**: a grid of cards, each with a thumbnail, title, description, price and a button that opens the retailer's product page.
- **Admin page (`/admin`)**: paste a product link and click **Fetch details**. The title, description, price and image are pulled from the page, and you can change any of them before saving. You can also edit, reorder and delete items, upload your own thumbnail, change an item's button text (it says "View this item" unless you change it), and set the page title and intro message.

## Running it

Requires Node.js 22 (pinned in `package.json` and `.nvmrc`, so hosts like Railway pick the right version).

```bash
npm install
ADMIN_PASSWORD='pick-something-good' npm start
```

Then open http://localhost:3000 (shared page) and http://localhost:3000/admin (admin).

| Environment variable | Purpose | Default |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Password for `/admin`. **Required:** with no password set, every admin login is refused. | none |
| `PORT` | Port to listen on. | `3000` |
| `DATA_DIR` | Where items, settings and uploaded images are stored. | `./data` |
| `LOGIN_MAX_FAILURES` | Wrong passwords allowed from one IP address (within 15 minutes) before it's locked out of the admin login for 15 minutes. | `5` |
| `TRUST_PROXY_HOPS` | How many proxies sit in front of the app, used to find each visitor's real IP address. Railway and Render use one. Set it to `0` if the app is exposed directly to the internet with no proxy. | `1` |

## How data is stored

There's no database. Items live in `data/items.json`, page settings in `data/settings.json`, and uploaded images in `data/uploads/`. To back up your list, copy the `data/` folder. It's listed in `.gitignore`, so your list isn't committed.

## How "Fetch details" works

The server downloads the product page and reads, in order of preference:

1. schema.org `Product` structured data (JSON-LD), which most large retailers include
2. Open Graph and product meta tags (`og:title`, `og:image`, `product:price:amount`, …)
3. Microdata (`itemprop="price"`) and a few Amazon-specific elements
4. The page `<title>` and meta description

Some retailers (eBay and Amazon especially) block requests from servers, so "Fetch details" fails with an error such as HTTP 403. For those, use the **Add to gift list** bookmark from the admin page's "Add from any store" section:

1. Drag the button to your browser's bookmarks bar. In Safari, use **Copy bookmark code** and paste it as a bookmark's address instead.
2. On a product page, click the bookmark. It runs in your own browser, copies the product details from the page you're viewing, and opens the admin page with the form filled in. The server reads them the same way "Fetch details" would.

The bookmark contains your site's address, so add it again if that address changes. When neither method finds everything, the admin page says what's missing so you can fill it in by hand. Thumbnails can be any image URL (right-click the product photo → *Copy image address*) or a picture you upload.

## Deploying

Any host that runs Node.js and has **a persistent disk** will work, because the list is saved to files. Examples are Render (with a disk mounted at `DATA_DIR`), Fly.io (with a volume), Railway (with a volume), or a small VPS. Set `ADMIN_PASSWORD` in the host's environment settings, and serve over HTTPS so the admin login cookie is sent securely.

## Tests

```bash
npm test
```

Runs the scraper tests against sample retailer-style HTML.
