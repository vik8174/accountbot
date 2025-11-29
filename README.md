# AccountBot

**Simple. Fast. Accurate.**

A Telegram bot for tracking transactions across multiple accounts.

## Features

- `/add` — Add a transaction (interactive account selection, amount, and description)
- `/balance` — View balance of all accounts
- `/history` — View recent transaction history
- `/sync` — Sync account balance with actual (creates adjustment transaction)

## Tech Stack

- **Runtime:** Node.js 20
- **Framework:** Telegraf.js
- **Backend:** Firebase Cloud Functions
- **Database:** Firestore

## Project Structure

```
accountbot/
├── README.md
├── CLAUDE.md
├── package.json                  # Root scripts (deploy, build, etc.)
├── firebase.json
├── firestore.rules
├── remoteconfig.template.json    # Remote Config template
├── .firebaserc
└── functions/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts              # Cloud Function entry point
        ├── bot.ts                # Telegraf bot initialization
        ├── handlers/
        │   ├── add.ts            # /add command handler
        │   ├── balance.ts        # /balance command handler
        │   ├── history.ts        # /history command handler
        │   └── sync.ts           # /sync command handler
        ├── services/
        │   ├── firestore.ts      # Firestore operations
        │   └── logger.ts         # Structured logging
        ├── utils/
        │   ├── currency.ts       # Currency formatting
        │   ├── date.ts           # Date formatting
        │   └── keyboard.ts       # Telegram keyboard
        ├── i18n/
        │   ├── index.ts          # Translation function t()
        │   ├── uk.ts             # Ukrainian translations
        │   └── en.ts             # English translations
        └── types/
            └── index.ts          # TypeScript interfaces
```

## Installation

### Prerequisites

1. Node.js 20+
2. Firebase CLI (`npm install -g firebase-tools`)
3. Firebase project with Blaze plan (pay-as-you-go)
4. Telegram bot token from @BotFather

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd accountbot
   ```

2. Install dependencies:
   ```bash
   cd functions
   npm install
   ```

3. Connect Firebase project:
   ```bash
   firebase login
   firebase use --add
   ```

4. Set up secrets:
   ```bash
   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
   ```

5. Deploy:
   ```bash
   npm run build
   firebase deploy --only functions
   firebase deploy --only firestore:indexes
   firebase deploy --only firestore:rules
   ```

6. Configure bot for group chats (via @BotFather):
   - `/mybots` → select bot → **Bot Settings** → **Allow Groups** → Turn on
   - `/mybots` → select bot → **Bot Settings** → **Group Privacy** → Turn off
   - Remove and re-add bot to group for changes to apply

7. Set webhook:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<region>-<project>.cloudfunctions.net/telegramBot"
   ```

## Firestore Data Model

### Collection: `accounts`
```
accounts/{accountId}:
  name: string            // Display name
  slug: string            // Technical ID (e.g., "cosmos", "cash")
  currency: string        // ISO 4217 code (EUR, USD, UAH)
  balance: number         // Balance in minor units (cents)
```

### Collection: `transactions`
```
transactions/{txId}:
  accountSlug: string        // Account slug
  amount: number             // Amount in minor units (cents), positive or negative
  currency: string           // ISO 4217 code (EUR, USD, UAH)
  description?: string       // Description (optional for sync)
  type: "add" | "subtract"
  source: "manual" | "sync"  // Transaction source
  createdAt: Timestamp
  reverted: boolean
  createdBy: string          // Telegram user ID
  createdByName: string      // Telegram first name
```

### Collection: `sessions`
```
sessions/{chatId}:
  step: "amount" | "description" | "sync_amount"
  accountSlug: string        // Account slug
  amount?: number            // Amount in minor units (cents)
  createdAt: Timestamp
  createdBy: string          // Telegram user ID who started
```

## Development

```bash
# Build TypeScript
npm run build

# Lint code
npm run lint

# Local emulator
npm run serve

# View logs
npm run logs
```

## Deploy

```bash
# Deploy functions only
npm run deploy

# Deploy everything (functions, rules, indexes, config)
npm run deploy:all

# Deploy specific targets
npm run deploy:config    # Remote Config
npm run deploy:rules     # Firestore rules
npm run deploy:indexes   # Firestore indexes
```

## Firebase CLI

### Account Management

```bash
# Login
firebase login

# Add another account
firebase login:add

# List all accounts
firebase login:list

# Switch account
firebase login:use email@example.com

# Logout
firebase logout
```

### Project Management

```bash
# Add project to this directory
firebase use --add

# Switch between projects
firebase use <alias>

# List available projects
firebase use

# List all projects
firebase projects:list
```

Project aliases are stored in `.firebaserc`.

## Localization

Bot supports Ukrainian (uk) and English (en) languages via Firebase Remote Config.

### Change Language (without redeploy)

**Option 1: Firebase Console**
1. Firebase Console → Remote Config
2. Create parameter `bot_language` with value `uk` or `en`
3. Publish changes

**Option 2: Firebase CLI**
```bash
# Deploy remote config template
firebase deploy --only remoteconfig

# Or edit and get current config
firebase remoteconfig:get -o remoteconfig.template.json
# Edit file, then deploy
firebase deploy --only remoteconfig
```

Language cache clears on function cold start.

### Supported Languages

| Code | Language |
|------|----------|
| `uk` | Ukrainian (default) |
| `en` | English |

## License

MIT
