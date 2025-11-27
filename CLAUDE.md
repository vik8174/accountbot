# AccountBot - Claude Code Context

## Project Overview

Telegram bot for transaction tracking. Runs via webhook on Firebase Cloud Functions.

**Stack:** TypeScript, Telegraf.js, Firebase Cloud Functions, Firestore

### Architecture

```
Telegram → Webhook → Cloud Function → Telegraf → Firestore
```

### Key Files

| File | Purpose |
|------|---------|
| `functions/src/index.ts` | HTTP endpoint for webhook |
| `functions/src/bot.ts` | Telegraf bot, command registration |
| `functions/src/handlers/*.ts` | Command logic: /add, /balance, /history, /undo |
| `functions/src/services/firestore.ts` | Firestore CRUD operations |
| `functions/src/types/index.ts` | TypeScript interfaces |

---

## Development Commands

```bash
cd functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Local emulator
npm run serve

# Deploy to Firebase
npm run deploy

# Lint code
npm run lint
```

---

## Firestore Collections

### accounts
User accounts. Created manually in Firebase Console.
- `name`: string — display name
- `slug`: string — technical ID (vitya_common, cosmos, cash...)
- `currency`: "EUR"
- `balance`: number
- `ownerId`: string — Telegram user ID

### transactions
Transaction history.
- `account`: string — account slug
- `amount`: number — amount (positive or negative)
- `currency`: "EUR"
- `description`: string
- `type`: "add" | "subtract"
- `timestamp`: Timestamp
- `reverted`: boolean
- `userId`: string

### sessions
Temporary state for interactive /add flow.
- `step`: "amount" | "description"
- `account`: string
- `amount?`: number
- `timestamp`: Timestamp

---

## Interactive /add Flow

1. User: `/add`
2. Bot: inline buttons with accounts
3. User: clicks button → callback `add:account:<slug>`
4. Bot: creates session, asks for amount
5. User: enters number
6. Bot: updates session, asks for description
7. User: enters text
8. Bot: creates transaction, updates balance, deletes session

---

## Secrets

Telegram token stored via Firebase Secrets:
```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
```

Access in code:
```typescript
import { defineSecret } from "firebase-functions/params";
const telegramToken = defineSecret("TELEGRAM_BOT_TOKEN");
```

---

## Common Tasks

### Add a new command
1. Create handler in `handlers/`
2. Register in `bot.ts`
3. Update `/start` message

### Add a new account
Manually in Firebase Console: Firestore → accounts → Add document

### Change message formatting
Edit the corresponding handler in `handlers/`

---

# Programming Principles

Always apply these fundamental programming principles when writing code:

## OOP (Object-Oriented Programming)

- Encapsulate related data and behavior in classes
- Use clear abstractions and interfaces
- Apply inheritance and composition appropriately
- Example: Strategy Pattern for multiple display variants

## SOLID Principles

- **S**ingle Responsibility: Each class/function has one clear purpose
- **O**pen/Closed: Open for extension, closed for modification
- **L**iskov Substitution: Derived classes must be substitutable for base classes
- **I**nterface Segregation: Small, focused interfaces over large ones
- **D**ependency Inversion: Depend on abstractions, not concrete implementations

## KISS (Keep It Simple, Stupid)

- Prefer simple solutions over complex ones
- Write clear, readable code
- Avoid over-engineering
- If it looks complicated, simplify it

## DRY (Don't Repeat Yourself)

- Extract repeated code into reusable functions/components
- Use utilities and helpers for common operations
- Maintain single source of truth for data and logic
- Avoid copy-paste programming

---

# Git Rules

## Commit Messages — Conventional Commits

Format:
```
<type>(<scope>): <short summary>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Formatting (no logic changes) |
| `refactor` | Code refactor without behavior change |
| `perf` | Performance improvements |
| `test` | Tests added or updated |
| `chore` | Configs, dependencies, minor tasks |
| `ci` | CI/CD changes |
| `build` | Build system changes |
| `revert` | Revert previous commit |

### Examples

```
feat(auth): add JWT refresh logic
fix(cart): correct rounding issue in total calculation
docs(readme): update installation section
refactor(user): simplify login validation
test(api): add integration tests for orders endpoint
```

## Branch Naming — Conventional Branch Names

Format:
```
<type>/<short-description>
```

### Examples

```
feat/user-auth
fix/payment-crash
docs/update-api-readme
chore/bump-react-18
refactor/cleanup-utils
test/user-service-mocks
```

---

## Code Conventions

- **Language:** TypeScript (strict mode)
- **Message formatting:** HTML parse mode
- **Date format:** `YYYY-MM-DD HH:mm`
- **Currency:** EUR (always)
- **Comments:** English
