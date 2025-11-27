# AccountBot

**Simple. Fast. Accurate.**

A Telegram bot for tracking transactions across multiple accounts.

## Features

- `/add` — Add a transaction (interactive account selection, amount, and description)
- `/balance` — View balance of all accounts
- `/history` — View recent transaction history
- `/undo` — Revert the last transaction

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
├── firebase.json
├── firestore.rules
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
        │   └── undo.ts           # /undo command handler
        ├── services/
        │   └── firestore.ts      # Firestore operations
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
   ```

6. Set webhook:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<region>-<project>.cloudfunctions.net/telegramBot"
   ```

## Firestore Data Model

### Collection: `accounts`
```
accounts/{accountId}:
  name: string        // Display name
  slug: string        // Technical ID (e.g., "cosmos", "cash")
  currency: string    // ISO 4217 code (EUR, USD, UAH)
  balance: number     // Current balance
  ownerId: string     // Telegram user ID
```

### Collection: `transactions`
```
transactions/{txId}:
  account: string        // Account slug
  amount: number         // Amount (positive or negative)
  currency: string       // ISO 4217 code (EUR, USD, UAH)
  description: string    // Description
  type: "add" | "subtract"
  timestamp: Timestamp
  reverted: boolean
  userId: string
```

### Collection: `sessions`
```
sessions/{chatId}:
  step: "amount" | "description"
  account: string
  amount?: number
  timestamp: Timestamp
```

## Development

```bash
cd functions

# Build TypeScript
npm run build

# Local emulator
npm run serve

# Deploy
npm run deploy

# Lint
npm run lint
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

## License

MIT
