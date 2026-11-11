# Gift List

Gift lists that anyone can make and share. Each person gets an account and a list at their own address (for example `gift.mgriffioen.com/mark`). They share that link with friends and family, who can mark what they're getting so nobody buys the same thing twice.

- **Home page (`/`)**: explains the site, has a box to look up someone's list by username, and links to sign up or log in.
- **Shared list (`/<username>`)**: the list's gifts as cards, grouped under the owner's own sections, with a thumbnail, title, description, price and a button that opens the store's page. A username typed in capitals redirects to the lowercase address, and a name with no account shows "There's no list here".
- **Your list (`/admin`)**: log in (or sign up at `/signup`) to add, edit, reorder, hide and delete gifts; paste a product link and click **Fetch details** to fill in the title, description, price and image; manage your sections; set the page title and intro; change your password; or delete your account.

## Avoiding duplicate gifts ("I'll get this")

Each gift on a shared list has an **I'll get this** button. A visitor taps it and can add their name (optional). After that:

- **Other visitors** see the gift greyed out with "✓ Aunt Sue is getting this" (or "Someone is getting this"). Gifts nobody has taken are listed first.
- **The list's owner never sees claims.** When you're logged in and view your own list, it shows a note instead of claim marks, so gifts stay a surprise. You also can't claim gifts on your own list.
- **Only the person who claimed a gift can undo it.** Their browser keeps a secret token that the server checks. If they clear their browser data or switch devices, they can't undo it. The owner's **Clear all "I'll get this" marks** button, on the admin page, resets every claim without showing them, for example after a birthday.

Anyone with the link can claim gifts, so a stranger could mark everything as taken. That seems an acceptable risk for lists shared with family and friends. Each IP address can make up to 60 claims an hour.

## Sections

Each list has its own sections (like "Books", "Kitchen" or "Board games"), managed in the **Sections** panel: add, rename, reorder with ↑/↓, or delete. Deleting a section keeps its gifts, now without a section. Gifts without a section appear last on the shared page, under "Other ideas". If a list has no sections at all, its gifts are shown in a single grid with no headings.

When you add a gift, the admin page guesses its section from the title, description and store link. It matches words from your section names ("Books" picks up "hardcover book"), and common names also come with related words. For example, a section called "Tech", "Electronics" or "Gadgets" picks up headphones and chargers, "Games" picks up board games, and "Decks" or "Playing cards" picks up theory11 decks. Kitchen, clothing, toys, music, books and outdoors work the same way. Change the guess in the **Section** dropdown before saving. Once you pick one yourself, it stops guessing.

## Accounts

- **Usernames** become list addresses, so they're 3–30 lowercase letters, numbers or dashes. Names used by the site's own pages (like `admin`, `login`, `api`) are reserved.
- **Passwords** need at least 8 characters and are stored as scrypt hashes. Changing your password signs you out everywhere else.
- **Sign-ups** are open to anyone unless you set `SIGNUP_CODE`. Then people need that code to create an account, so you can hand it to family. Each IP address can create up to 5 accounts an hour.
- **Forgotten passwords**: there's no email, so a **site admin** resets it. Usernames listed in `SITE_ADMIN` see a **Site admin** panel on their admin page. It lists every account, gives a new temporary password to send to the person, and can delete accounts.
- Wrong passwords are limited per IP address, as before (5 in 15 minutes, then a 15-minute lockout).

## Upgrading from the single-list version

On first start, if the server finds the old `data/items.json` / `data/settings.json`, it moves that list into an account named by the first username in `SITE_ADMIN`. The account's password is your existing `ADMIN_PASSWORD`. So to upgrade gift.mgriffioen.com:

1. In the host's settings, add `SITE_ADMIN=mark` and keep `ADMIN_PASSWORD` as it is.
2. Deploy. The log says "Moved the existing gift list (N gifts) into the account "mark"".
3. Log in at `/admin` with username `mark` and your old password. Your gifts are in sections Decks, Tech, Games and Other, as before, and are now at `/mark`.
4. Optionally change your password from the Account panel. `ADMIN_PASSWORD` isn't used after the move, so you can remove it.

The old files are renamed to `items.json.migrated` and `settings.json.migrated` rather than deleted, and uploaded pictures move to `data/uploads/mark/`. **Note:** the bare address `gift.mgriffioen.com` now shows the home page, so send people the new `/mark` link.

## Running it

Requires Node.js 22 (pinned in `package.json` and `.nvmrc`, so hosts like Railway pick the right version).

```bash
npm install
SITE_ADMIN=yourname npm start
```

Then open http://localhost:3000, sign up as `yourname`, and you're a site admin.

| Environment variable | Purpose | Default |
| --- | --- | --- |
| `SITE_ADMIN` | Comma-separated usernames that can manage all accounts. The first one also receives a pre-accounts list (see above). | none |
| `SIGNUP_CODE` | If set, people need this code to create an account. | none (open sign-up) |
| `ADMIN_PASSWORD` | Only used once, as the password for the account created when upgrading from the single-list version. | none |
| `SESSION_SECRET` | Key used to sign login cookies. If unset, a random key is created in `DATA_DIR/session-secret` and reused. | generated |
| `PORT` | Port to listen on. | `3000` |
| `DATA_DIR` | Where accounts, lists and uploaded images are stored. | `./data` |
| `LOGIN_MAX_FAILURES` | Wrong passwords allowed from one IP address (within 15 minutes) before it's locked out of logging in for 15 minutes. | `5` |
| `SIGNUPS_PER_HOUR` | New accounts allowed per IP address per hour. | `5` |
| `TRUST_PROXY_HOPS` | How many proxies sit in front of the app, used to find each visitor's real IP address. Railway and Render use one. Set it to `0` if the app is exposed directly to the internet with no proxy. | `1` |

## How data is stored

There's no database. Accounts are in `data/accounts.json`. Each list is in `data/users/<username>/` (`items.json`, `categories.json`, `settings.json`, and `claims.json` for "I'll get this" marks), and uploaded images are in `data/uploads/<username>/`. To back up everything, copy the `data/` folder. It's listed in `.gitignore`, so lists aren't committed. JSON files suit a family-and-friends site. With many active users, a database would be the next step.

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

Any host that runs Node.js and has **a persistent disk** will work, because lists are saved to files. Examples are Render (with a disk mounted at `DATA_DIR`), Fly.io (with a volume), Railway (with a volume), or a small VPS. Set `SITE_ADMIN` (and `SIGNUP_CODE` if you want sign-ups limited) in the host's environment settings, and serve over HTTPS so the login cookie is sent securely.

## Tests

```bash
npm test
```

Runs the scraper tests against sample retailer-style HTML, plus tests for accounts, sessions, sections, claims, the section guesses and the upgrade from the single-list version.
