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
| `functions/src/handlers/*.ts` | Command logic: /add, /balance, /history, /sync |
| `functions/src/services/firestore.ts` | Firestore CRUD operations |
| `functions/src/types/index.ts` | TypeScript interfaces |
| `functions/src/i18n/*.ts` | Localization (uk/en) |
| `functions/src/utils/keyboard.ts` | Reply keyboard with emoji buttons |
| `functions/src/utils/currency.ts` | Amount/balance formatting |
| `functions/src/utils/date.ts` | Date formatting |

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
- **Date format:** `15 січ` (localized short month)
- **Amount format:** `+1,234.56 $` (symbol, thousand separators)
- **Currency:** ISO 4217 codes (EUR, USD, UAH)
- **Comments:** English

---

## Display Formats

### Balance
```
💰 Account Balances

┌ Card
└ +1,234.56 $

┌ Cash
└ +500.00 ₴
```

### History
```
📋 Recent Transactions

┌ 29 Jul
└ Cash · +4.00 € · Andrew · Transaction description
```

### Add Success
```
✅ Transaction Added

┌ +264.40 €
└ Cash · Viktor · Test transaction
```

---

## Currency Format: ISO 4217

Supported currencies:
| Code | Name |
|------|------|
| `EUR` | Euro |
| `USD` | US Dollar |
| `UAH` | Ukrainian Hryvnia |

TypeScript type:
```typescript
type CurrencyCode = "EUR" | "USD" | "UAH";
```
