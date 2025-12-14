# AccountBot - AI Code Assistant Context

> For project overview, installation, data model, and deployment commands, see [README.md](README.md)

---

## Documentation Files

| File | Audience | Contains |
|------|----------|----------|
| `README.md` | Users, Developers | Project overview, installation, data model, commands, deployment |
| `CLAUDE.md` | AI Assistant | Architecture patterns, non-obvious logic, gotchas, conventions |
| `functions/CLI_SETUP.md` | Developers | CLI authentication setup |

**Principles:**
- README.md is the single source of truth for "what" and "how to use". CLAUDE.md explains "why" and "how it works internally".
- All documentation must be written in English.

---

## Architecture & Key Files

```
Telegram → Webhook → Cloud Function → Telegraf → Firestore
```

| File                                  | Purpose                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `functions/src/index.ts`              | HTTP endpoint for webhook                            |
| `functions/src/bot.ts`                | Telegraf bot, command registration                   |
| `functions/src/handlers/*.ts`         | Command logic: /add, /balance, /history, /sync, /transfer, /cancel |
| `functions/src/services/firestore.ts` | Firestore CRUD operations                            |
| `functions/src/services/logger.ts`    | Firebase structured logging                          |
| `functions/src/services/currency-api.ts` | Exchange rate API (Frankfurter ECB rates)         |
| `functions/src/types/index.ts`        | TypeScript interfaces                                |
| `functions/src/i18n/*.ts`             | Localization (uk/en)                                 |
| `functions/src/utils/keyboard.ts`     | Adaptive keyboards (reply/inline) with emoji buttons |
| `functions/src/utils/chat.ts`         | Chat type detection (forum topics, private chats)    |
| `functions/src/utils/currency.ts`     | Amount parsing, formatting, minor units conversion   |
| `functions/src/utils/topics.ts`       | Forum topics (supergroups) support                   |

---

## Critical Patterns (Non-Obvious from Code)

### Minor Units Pattern

All monetary amounts in Firestore are stored as **integers in minor units** (cents/kopiykas):

```
User enters: 100.50 (major units - dollars/euros)
Stored as:   10050  (minor units - cents)
Displayed:   +100.50 $
```

**Input parsing:**
- `parseAmount(text, options)` — user input → validated major units

Supported formats: `2.25`, `2,25`, `2`, `2.`, `-5`

Options: `allowNegative` (default: true), `allowZero` (default: false), `maxAmount` (default: 1,000,000)

Returns `{ success: true, value }` or `{ success: false, error }`.

**Conversion functions:**
- `toMinorUnits(majorValue)` — major units → database (cents)
- `formatAmount(minorValue, currency)` — database → display

**Critical:** Never mix minor/major units in calculations. Always convert at entry/exit points.

### Session Key Design

Sessions use composite key `chatId:userId` to support **multiple users in the same group chat simultaneously**:

```typescript
const sessionKey = getSessionKey(chatId, telegramUserId);
```

Without composite key, users in group chats would interfere with each other's sessions.

### Message Cleanup Pattern

The `/add`, `/sync`, and `/transfer` flows collect all message IDs throughout the flow and batch-delete them at completion:

1. Collect IDs: command message, bot prompts, user inputs
2. Store in `session.messageIds[]`
3. Delete all at end (only confirmation remains)
4. **Catch deletion errors silently** — user may have already deleted messages

```typescript
for (const msgId of allMessageIds) {
  try {
    await ctx.telegram.deleteMessage(chatId, msgId);
  } catch { /* ignore */ }
}
```

### Dual Keyboard System

Bot uses **adaptive keyboards** based on chat type:

| Chat Type | Keyboard Type | Why |
|-----------|---------------|-----|
| Private chat | Reply keyboard | Persistent at bottom |
| Regular group | Reply keyboard | Persistent at bottom |
| Forum topic | Inline keyboard | Reply keyboards don't work in topics |

**Detection:** `isForumTopic(ctx)` checks for `message_thread_id`
**Implementation:** `getAdaptiveKeyboard(ctx)` returns appropriate keyboard

### Dual Entry Points

Each command has TWO entry points that must be maintained in sync:

```typescript
bot.command("add", handleAddCommand);           // /add command
bot.hears(/^💸/, handleAddCommand);              // Reply keyboard button
bot.action("cmd:add", handleAddCommand);        // Inline keyboard callback
bot.action(/^add:account:.+$/, handleCallback); // Account selection
```

### Atomic Transactions

`createTransactionAndUpdateBalance()` uses Firestore Transaction for atomicity:

1. Read current account balance
2. Calculate new balance
3. Write transaction with `balanceAfter` field
4. Update account balance

All 4 operations commit together or all fail.

### Transfer Atomic Transaction

`createTransferAndUpdateBalances()` creates 2 linked transactions in a single Firestore transaction:

1. Read both account balances
2. Create outgoing transaction (negative amount, `transferType: "outgoing"`)
3. Create incoming transaction (positive amount, `transferType: "incoming"`)
4. Link both via `linkedTransactionId`
5. Update both account balances

For cross-currency transfers, uses Frankfurter API for ECB exchange rates with fallback to manual input.

### Cancellation Reversal Pattern

`createCancellationAndUpdateBalance()` creates reversal instead of deleting:

1. Read original transaction
2. Verify not already cancelled
3. Create reversal transaction (opposite amount, `source: "cancellation"`)
4. Mark original with `cancelledAt` and `cancelledByTxnId`
5. Update account balance

**Two-way references:**
- Reversal has `cancelledTransactionId` → points to original
- Original has `cancelledByTxnId` → points to reversal

For transfers, `createTransferCancellation()` cancels both legs atomically.

### Async Localization

The `t()` function is **async** (fetches language from Firebase Remote Config):

```typescript
// ✅ Correct
const message = await t("add.selectAccount");

// ❌ Wrong - will return Promise object
const message = t("add.selectAccount");
```

---

## Interactive Flows

### /add Flow

1. User: `/add` or 💸 button
2. Bot: inline buttons with accounts (reply to user's message)
3. User: clicks button → callback `add:account:<slug>`
4. Bot: creates session (key: `chatId:userId`), asks for amount
5. User: enters number
6. Bot: updates session, asks for description
7. User: enters text
8. Bot: creates transaction atomically, deletes intermediate messages, shows result

### /sync Flow

1. User: `/sync` or 🔄 button
2. Bot: inline buttons with accounts
3. User: clicks button → callback `sync:account:<slug>`
4. Bot: creates session with `step: "sync_amount"`, asks for new balance
5. User: enters number (must be ≥ 0)
6. Bot: calculates adjustment, creates transaction, shows before/after

### /transfer Flow

1. User: `/transfer` or ↔️ button
2. Bot: FROM account selection
3. User: clicks account → callback `transfer:from:<slug>`
4. Bot: TO account selection (excludes FROM)
5. User: clicks account → callback `transfer:to:<slug>`
6. Bot: asks for amount
7. User: enters amount
8. **(Cross-currency)** Bot: fetches exchange rate, shows accept/custom buttons
9. User: accepts auto rate or enters custom received amount
10. Bot: asks for description (enter `-` to skip)
11. User: enters description or `-`
12. Bot: creates 2 linked transactions atomically, shows result

### /cancel Flow

1. User: `/cancel`
2. Bot: shows user's recent transactions (max 10, excludes cancellations)
3. User: clicks transaction → callback `cancel:select:<id>`
4. Bot: confirmation dialog with transaction details
5. User: confirms → callback `cancel:confirm:<id>`
6. Bot: creates reversal transaction, marks original as cancelled

**Validation:**
- Only transaction author can cancel
- Cannot cancel cancellations
- Cannot cancel already-cancelled transactions

---

## Group Chat & Topics Behavior

- Bot requires **admin rights** in group to delete messages
- Multiple users can run `/add` simultaneously (separate sessions per `chatId:userId`)
- All commands respond in the same topic where they were invoked
- `message_thread_id` is stored in session and used for all replies

**Topic Options Pattern:**
```typescript
await ctx.telegram.sendMessage(
  chatId,
  message,
  { parse_mode: "HTML", ...getTopicOptions(ctx) }
);
```

---

## Common Gotchas for AI

| Mistake | Consequence | Solution |
|---------|-------------|----------|
| Forgetting `ctx.answerCbQuery()` | Button shows loading forever | Always call for callback handlers |
| Missing `topicOptions` in sendMessage | Message fails silently in forum topics | Always spread `...getTopicOptions(ctx)` |
| Mixing minor/major units | Amounts 100x wrong | Convert at entry/exit only |
| Not validating `chatId`/`userId` | Crashes on edge cases | Check before any session operation |
| Not catching deletion errors | Handler fails if message already deleted | Wrap in try-catch, ignore errors |
| Forgetting `await t()` | Returns Promise object, not string | Always await translation function |
| Using raw `parseFloat` for amounts | Doesn't handle comma, no validation | Use `parseAmount()` utility |

---

## How to Add New Features

### Adding a New Command

1. Create handler in `handlers/newcommand.ts`
2. Register in `bot.ts`:
   - `bot.command("newcommand", handler)`
   - `bot.hears(/^🆕/, handler)` — for reply keyboard
   - `bot.action("cmd:newcommand", handler)` — for inline keyboard
3. Add keyboard button in `utils/keyboard.ts`
4. Add localization keys in `i18n/uk.ts` and `i18n/en.ts`
5. Update `/start` message if needed

### Adding a New Account

```bash
npm run add-account
```

See `functions/CLI_SETUP.md` for authentication setup.

---

## Code Conventions

- **Language:** TypeScript (strict mode)
- **Message formatting:** HTML parse mode
- **Date format:** `15 січ` (localized short month)
- **Amount format:** `+1,234.56 $` (sign, thousands separator, symbol)
- **Currency:** ISO 4217 codes (EUR, USD, UAH)
- **Comments:** English

### Display Formats

**Balance:**
```
💰 Account Balances

Cash +345.00 €
Visa card +506.00 $
```

**History:**
```
📋 Recent Transactions

30 Nov +50.00 $
Visa card · Viktor · Description
```

**Add Success:**
```
✅ Transaction Added

Visa card +456.00 $
Viktor · Groceries
```

**Sync Success:**
```
✅ Balance Synced

Visa card
Previous +729.00 $
Adjustment -679.00 $
New balance +50.00 $
```

**Transfer Success:**
```
✅ Transfer Complete

Cash -100.00 €
Monobank +110.00 $
Rate: 1 EUR = 1.10 USD
```

**Cancel Success:**
```
✅ Transaction Cancelled

Visa card
Original: +456.00 $
Reversal: -456.00 $
```

**Transfer Cancelled:**
```
✅ Transfer Cancelled

Cash +100.00 €
Monobank -110.00 $
```

---

## Git Conventions

### Commit Messages — Conventional Commits

```
<type>(<scope>): <short summary>
```

| Type       | Description                           |
| ---------- | ------------------------------------- |
| `feat`     | New feature                           |
| `fix`      | Bug fix                               |
| `docs`     | Documentation changes                 |
| `style`    | Formatting (no logic changes)         |
| `refactor` | Code refactor without behavior change |
| `perf`     | Performance improvements              |
| `test`     | Tests added or updated                |
| `chore`    | Configs, dependencies, minor tasks    |

**Examples:**
```
feat(add): support negative amounts
fix(sync): handle zero balance correctly
docs(readme): update installation section
```

### Branch Naming

```
<type>/<short-description>
```

**Examples:**
```
feat/negative-amounts
fix/sync-zero-balance
docs/update-readme
```

---

## Programming Principles

- **Single Responsibility:** Each function has one clear purpose
- **KISS:** Prefer simple solutions, avoid over-engineering
- **DRY:** Extract repeated code into utilities
- **Defensive:** Validate chatId/userId before operations
