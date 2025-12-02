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
| `functions/src/services/logger.ts` | Firebase structured logging |
| `functions/src/services/firestore.ts` | Firestore CRUD operations |
| `functions/src/types/index.ts` | TypeScript interfaces |
| `functions/src/i18n/*.ts` | Localization (uk/en) |
| `functions/src/utils/keyboard.ts` | Reply keyboard with emoji buttons |
| `functions/src/utils/currency.ts` | Amount/balance formatting |
| `functions/src/utils/date.ts` | Date formatting |
| `functions/src/utils/topics.ts` | Forum topics (supergroups) support |
| `functions/src/cli/add-account.ts` | CLI script for adding accounts |
| `functions/src/cli/list-accounts.ts` | CLI script for listing accounts |
| `functions/src/cli/utils/validation.ts` | Input validation utilities |
| `functions/src/cli/utils/prompts.ts` | Interactive prompts |

---

## Interactive /add Flow

1. User: `/add` or 💸 button
2. Bot: inline buttons with accounts (reply to user's message)
3. User: clicks button → callback `add:account:<slug>`
4. Bot: creates session (key: `chatId:userId`), asks for amount
5. User: enters number
6. Bot: updates session, asks for description
7. User: enters text
8. Bot: creates transaction with `balanceAfter`, updates balance atomically, deletes all intermediate messages, shows result

### Session Key
Sessions use `chatId:userId` as key to support multiple users in group chats simultaneously.

### Topic Preservation
Bot preserves topic context throughout the flow by storing `message_thread_id` in the session and using it for all replies.

### Message Cleanup
In `/add` flow, all intermediate messages (command, keyboard, prompts) are deleted after successful transaction. Only the final confirmation remains.

---

## Group Chat Behavior

- Bot requires **admin rights** in group to delete messages (for `/add` cleanup)
- `/add` flow collects all message IDs and deletes them after completion
- Multiple users can run `/add` simultaneously (separate sessions per user)

### Topics Support (Forum Supergroups)

Bot fully supports Telegram Topics (forum supergroups):
- All commands respond in the same topic where they were invoked
- `message_thread_id` is extracted from incoming messages and stored in sessions
- All bot replies use the stored `message_thread_id` to maintain topic context
- Implementation: `utils/topics.ts` provides `getTopicOptions()` helper

---

## Common Tasks

### Add a new command
1. Create handler in `handlers/`
2. Register in `bot.ts`
3. Update `/start` message

### Add a new account
Use CLI script (recommended):
```bash
npm run add-account
```

Or manually in Firebase Console: Firestore → accounts → Add document

See `functions/CLI_SETUP.md` for authentication setup.

### List all accounts
```bash
npm run list-accounts
```

### Change message formatting
Edit the corresponding handler in `handlers/`

### Verify data integrity
Use `verifyAccountIntegrity(slug)` from `services/firestore.ts` to check account consistency.

---

## NPM Scripts Organization

### Root Scripts (Developer Interface)

All commands should be run from project root:

**Development:**
```bash
npm run build        # Compile TypeScript
npm run build:watch  # Compile in watch mode
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
npm run serve        # Start local emulator
```

**Deployment:**
```bash
npm run deploy            # Deploy functions only
npm run deploy:all        # Deploy everything
npm run deploy:config     # Deploy remote config
npm run deploy:rules      # Deploy Firestore rules
npm run deploy:indexes    # Deploy Firestore indexes
npm run logs              # View function logs
```

**CLI Utilities:**
```bash
npm run add-account      # Add new account (interactive)
npm run list-accounts    # List all accounts
```

### Functions Scripts (Low-Level)

Located in `functions/package.json`. These are called by root scripts:

**TypeScript:**
- `build` - Direct TypeScript compilation (`tsc`)
- `build:watch` - Watch mode compilation

**Linting:**
- `lint` - ESLint check
- `lint:fix` - ESLint auto-fix

**CLI:**
- `add-account` - Direct CLI execution
- `list-accounts` - Direct CLI execution

**Architecture:**
- ✅ Root = Firebase commands + delegation to functions
- ✅ Functions = TypeScript/ESLint/CLI implementation
- ✅ No duplication between root and functions
- ✅ Clear separation of concerns

---

## Data Model

### Transaction
```typescript
interface Transaction {
  accountSlug: string;
  amount: number;           // Minor units (cents/kopiykas)
  currency: CurrencyCode;
  description?: string;     // Optional for sync
  type: "add" | "subtract"; // Inferred from amount sign
  source: "manual" | "sync";
  createdAt: Timestamp;
  createdById: string;
  createdByName: string;
  balanceAfter: number;     // Account balance after transaction (minor units)
}
```

### Account
```typescript
interface Account {
  name: string;
  slug: string;
  currency: CurrencyCode;
  balance: number;  // Denormalized, in minor units
}
```

**Important:** `slug` must be unique across all accounts. This uniqueness is enforced at application level in `createAccount()` function, which checks for existing slugs before creating new accounts.

### Session
```typescript
interface Session {
  step: SessionStep;
  accountSlug: string;
  amount?: number;           // Minor units
  createdAt: Timestamp;
  createdById: string;       // Telegram user ID
  messageIds?: number[];     // For cleanup
  messageThreadId?: number;  // For topics support
}
```

### Atomic Transaction Creation
Transactions are created using `createTransactionAndUpdateBalance()` which:
1. Reads current account balance
2. Calculates new balance
3. Writes transaction with `balanceAfter`
4. Updates account balance

All operations are atomic (Firestore Transaction), ensuring data consistency.

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

Cash +345.00 €
Visa card +506.00 $
```

### History
```
📋 Recent Transactions

30 Nov +50.00 $
Visa card · Viktor · Description

30 Nov +50.00 €
Cash · Viktor · Another one
```

### Add Success
```
✅ Transaction Added

Visa card +456.00 $
Viktor · Groceries
```

### Sync Success
```
✅ Balance Synced

Visa card
Previous +729.00 $
Adjustment -679.00 $
New balance +50.00 $
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

---

## CLI Scripts for Account Management

### Overview

Interactive command-line scripts for managing accounts locally. Located in `functions/src/cli/`.

### Setup

See `functions/CLI_SETUP.md` for detailed authentication setup.

**Quick setup:**
1. Download service account key from Firebase Console
2. Save as `functions/serviceAccountKey.json`
3. Run scripts via npm commands

### Available Scripts

**List all accounts:**
```bash
cd functions
npm run list-accounts
```

Output:
```
=== Accounts ===

📊 Cash
   Slug: cash
   Balance: +345.00 €

📊 Visa card
   Slug: visa-card
   Balance: +506.00 $

Total: 2 account(s)
```

**Add new account (interactive):**
```bash
cd functions
npm run add-account
```

Interactive prompts:
1. Account name (e.g., "Cash", "Visa Card")
2. Slug (auto-suggested from name, e.g., "visa-card")
3. Currency (EUR/USD/UAH)
4. Initial balance (default: 0)
5. Confirmation

### Validation Rules

**Slug:**
- Pattern: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
- Lowercase only, alphanumeric + hyphens
- No leading/trailing hyphens
- Length: 2-50 characters
- **Must be unique** (enforced by `createAccount()` in `firestore.ts`)
- ⚠️ **Warning:** When creating accounts manually in Firebase Console, you must ensure slug uniqueness yourself - there are no database-level constraints

**Amount:**
- Decimal format: `100.50`, `0`, `-50.25`
- Max 2 decimal places
- Range: ±1,000,000,000 (major units)

**Currency:**
- Valid values: `EUR`, `USD`, `UAH`
- Case-insensitive input

### Architecture

```
functions/src/cli/
├── add-account.ts          # Main CLI script
├── list-accounts.ts        # List accounts script
└── utils/
    ├── prompts.ts          # Interactive prompts (uses 'prompts' library)
    └── validation.ts       # Input validation logic
```

**Dependencies:**
- `prompts` - Lightweight interactive CLI prompts
- `ts-node` - Execute TypeScript directly
- Reuses existing services: `firestore.ts`, `currency.ts`

### Firebase Admin Initialization

The CLI scripts use automatic credential detection:

1. **Local development:** Uses `serviceAccountKey.json` if present
2. **Cloud Functions:** Uses Application Default Credentials
3. **Fallback:** Environment variable `GOOGLE_APPLICATION_CREDENTIALS`

Implementation in `services/firestore.ts`:
```typescript
if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
} else {
  admin.initializeApp(); // ADC or Cloud Functions
}
```

### Firestore Service Functions

**New function added:**
```typescript
createAccount(account: Account): Promise<string>
```

- **Validates slug uniqueness** (throws error if duplicate exists)
- Creates account document in Firestore
- Returns document ID
- Logs operation for audit trail

**Uniqueness enforcement:** Application-level check via `getAccountBySlug()`. Firestore does not have built-in unique constraints.
